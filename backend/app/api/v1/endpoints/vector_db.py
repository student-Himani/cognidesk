import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks, Header
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db, SessionLocal
from app.core.chroma import get_chroma_client, get_or_create_collection
from app.models.document import Document
from app.models.workspace import Workspace
from app.services.vector_storage import vector_storage
from app.services.workspace_service import workspace_service

logger = logging.getLogger("app")
router = APIRouter()


def sync_document_background(doc_id: int):
    """Background task to sync document chunks to ChromaDB."""
    db: Session = SessionLocal()
    try:
        logger.info(f"Background task starting ChromaDB vector storage for document ID {doc_id}")
        vector_storage.store_document_vectors(db, doc_id)
    except Exception as e:
        logger.error(f"Background vector storage failed for document ID {doc_id}: {e}")
    finally:
        db.close()


@router.post("/sync/{document_id}")
def sync_document_to_chroma(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Store embeddings and metadata for an embedded document into ChromaDB and update status to 'indexed'.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document ID {document_id} not found"
        )

    if not doc.chunks_rel:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document ID {document_id} has no generated chunks. Run Module 06 embedding engine first."
        )

    background_tasks.add_task(sync_document_background, doc.id)

    return {
        "success": True,
        "message": f"Vector storage task scheduled for document ID {document_id}",
        "data": {
            "document_id": str(doc.id),
            "filename": doc.original_filename,
            "status": "indexing"
        }
    }


@router.post("/sync-all")
def sync_all_documents_to_chroma(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Find all documents in 'embedded' status and trigger vector storage in ChromaDB.
    """
    docs = db.query(Document).filter(Document.status == "embedded").all()
    if not docs:
        return {
            "success": True,
            "message": "No pending embedded documents found for vector storage.",
            "data": {"scheduled_count": 0}
        }

    scheduled_ids = []
    for doc in docs:
        background_tasks.add_task(sync_document_background, doc.id)
        scheduled_ids.append(doc.id)

    return {
        "success": True,
        "message": f"Scheduled vector storage for {len(scheduled_ids)} embedded documents.",
        "data": {
            "scheduled_count": len(scheduled_ids),
            "document_ids": scheduled_ids
        }
    }


@router.delete("/documents/{document_id}")
def delete_document_vectors_from_chroma(document_id: int):
    """
    Delete all vector records associated with document ID from ChromaDB.
    """
    success = vector_storage.delete_document_vectors(document_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete ChromaDB vectors for document ID {document_id}"
        )

    return {
        "success": True,
        "message": f"Successfully deleted vector storage for document ID {document_id}"
    }


@router.get("/stats")
def get_vector_db_stats(
    workspace_id: Optional[int] = None,
    x_workspace_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Get ChromaDB vector store statistics, total vectors, and document indexing stats,
    scoped to the active or specified workspace.
    """
    target_ws_id = workspace_id
    if target_ws_id is None and x_workspace_id:
        try:
            target_ws_id = int(x_workspace_id)
        except ValueError:
            pass
    if target_ws_id is None:
        active_ws = workspace_service.get_active_workspace(db)
        target_ws_id = active_ws.get("id", 1)

    ws = db.query(Workspace).filter(Workspace.id == target_ws_id).first()
    ws_name = ws.name if ws else f"Workspace {target_ws_id}"

    stats = vector_storage.get_storage_stats(db, workspace_id=target_ws_id)

    # Read actual embedding configuration from settings
    model_name = getattr(settings, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
    chunk_size = getattr(settings, "CHUNK_SIZE", 1000)
    chunk_overlap = getattr(settings, "CHUNK_OVERLAP", 150)
    batch_size = getattr(settings, "EMBEDDING_BATCH_SIZE", 32)
    distance_metric = getattr(settings, "CHROMA_DISTANCE_METRIC", "cosine")

    # Build workspace-scoped collections list
    total_docs = stats.get("total_documents", 0)
    total_chunks = stats.get("total_chunks", 0)

    collections_data = []

    # 1. Primary Vector Store collection
    collections_data.append({
        "name": f"{ws_name} Vector Store",
        "count": f"{total_chunks:,} chunks",
        "docs": total_docs,
        "tags": ["ChromaDB", distance_metric.capitalize(), model_name, "Active" if total_docs > 0 else "Empty"]
    })

    # 2. Add real categorized collections based on documents in this workspace
    ws_docs = db.query(Document).filter(Document.workspace_id == target_ws_id).all()
    if ws_docs:
        by_type: dict = {}
        for d in ws_docs:
            ft = (d.filetype or "txt").upper()
            if ft not in by_type:
                by_type[ft] = {"chunks": 0, "docs": 0}
            by_type[ft]["chunks"] += (d.chunks or 0)
            by_type[ft]["docs"] += 1

        for ft, info in by_type.items():
            collections_data.append({
                "name": f"{ft} Knowledge Store",
                "count": f"{info['chunks']:,} chunks",
                "docs": info["docs"],
                "tags": [ft, "Vectorized", f"{info['chunks']} chunks"]
            })

        # If there are fewer than 3 collections, also add top individual documents
        if len(collections_data) < 3:
            for d in ws_docs[:3]:
                doc_title = d.original_filename or f"Document {d.id}"
                if not any(c["name"] == doc_title for c in collections_data):
                    collections_data.append({
                        "name": doc_title,
                        "count": f"{d.chunks or 0:,} chunks",
                        "docs": 1,
                        "tags": [(d.filetype or "doc").upper(), d.status.capitalize(), f"{d.page_count or 1} Pages"]
                    })

    data = {
        **stats,
        "workspace_name": ws_name,
        "embedding_model": model_name,
        "embedding_dimension": 384,
        "embedding_provider": "Local SentenceTransformers (PyTorch)",
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "batch_size": batch_size,
        "distance_metric": distance_metric,
        "collection_status": "Active" if stats.get("total_vectors_in_collection", 0) > 0 or total_docs > 0 else "Ready",
        "collections": collections_data
    }

    return {
        "success": True,
        "data": data
    }


@router.get("/collections")
def list_chroma_collections():
    """
    List all collections in ChromaDB.
    """
    client = get_chroma_client()
    collections = client.list_collections()
    
    collection_items = []
    for c in collections:
        collection_items.append({
            "name": c.name,
            "id": str(c.id),
            "count": c.count(),
            "metadata": c.metadata or {}
        })

    return {
        "success": True,
        "data": {
            "total_collections": len(collection_items),
            "collections": collection_items
        }
    }


@router.get("/documents/{document_id}")
def get_document_vectors(document_id: int):
    """
    Retrieve stored vector records, text chunks, and metadata from ChromaDB for a document.
    """
    result = vector_storage.get_document_vectors(document_id)
    return {
        "success": True,
        "data": result
    }
