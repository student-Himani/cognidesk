import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.db import get_db, SessionLocal
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.embedding_engine import embedding_engine

logger = logging.getLogger("app")
router = APIRouter()


def embed_document_background(doc_id: int):
    """Background task handler for document embedding generation."""
    db: Session = SessionLocal()
    try:
        logger.info(f"Background task starting embedding engine for document ID {doc_id}")
        embedding_engine.process_document_embedding(db, doc_id)
    except Exception as e:
        logger.error(f"Background embedding failed for document ID {doc_id}: {e}")
    finally:
        db.close()


@router.post("/documents/{document_id}/embed")
def generate_document_embeddings(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Trigger text chunking and embedding generation for a specific processed document.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document ID {document_id} not found"
        )

    text_to_embed = (doc.cleaned_text or doc.extracted_text or "").strip()
    if not text_to_embed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document ID {document_id} has no cleaned or extracted text to generate embeddings."
        )

    background_tasks.add_task(embed_document_background, doc.id)

    return {
        "success": True,
        "message": f"Embedding generation task scheduled for document ID {document_id}",
        "data": {
            "document_id": str(doc.id),
            "filename": doc.original_filename,
            "status": "embedding"
        }
    }


@router.post("/documents/embed-all")
def embed_all_processed_documents(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Find all documents in 'processed' status or missing embeddings and trigger embedding generation.
    """
    docs = db.query(Document).filter(Document.status == "processed").all()
    if not docs:
        return {
            "success": True,
            "message": "No pending processed documents found for embedding generation.",
            "data": {"scheduled_count": 0}
        }

    scheduled_ids = []
    for doc in docs:
        text_to_embed = (doc.cleaned_text or doc.extracted_text or "").strip()
        if text_to_embed:
            background_tasks.add_task(embed_document_background, doc.id)
            scheduled_ids.append(doc.id)

    return {
        "success": True,
        "message": f"Scheduled embedding generation for {len(scheduled_ids)} processed documents.",
        "data": {
            "scheduled_count": len(scheduled_ids),
            "document_ids": scheduled_ids
        }
    }


@router.get("/documents/{document_id}/chunks")
def get_document_chunks(document_id: int, db: Session = Depends(get_db)):
    """
    Retrieve generated text chunks, chunk position metadata, and embedding dimensions for a document.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document ID {document_id} not found"
        )

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )

    chunk_list = []
    for c in chunks:
        meta_dict = {}
        if c.metadata_json:
            try:
                meta_dict = json.loads(c.metadata_json)
            except Exception:
                meta_dict = {}

        emb_dim = 0
        if c.embedding_json:
            try:
                emb_vec = json.loads(c.embedding_json)
                emb_dim = len(emb_vec) if isinstance(emb_vec, list) else 0
            except Exception:
                emb_dim = 0

        chunk_list.append({
            "id": c.id,
            "chunk_index": c.chunk_index,
            "text": c.chunk_text,
            "start_char": c.start_char,
            "end_char": c.end_char,
            "character_count": c.character_count,
            "word_count": c.word_count,
            "embedding_model": c.embedding_model,
            "embedding_dimension": emb_dim,
            "metadata": meta_dict
        })

    return {
        "success": True,
        "data": {
            "document_id": str(doc.id),
            "filename": doc.original_filename,
            "total_chunks": len(chunk_list),
            "status": doc.status,
            "chunks": chunk_list
        }
    }


@router.get("/status")
def get_embedding_engine_status(db: Session = Depends(get_db)):
    """
    Retrieve embedding engine configuration and cache stats.
    """
    engine_stats = embedding_engine.get_status(db)
    return {
        "success": True,
        "data": engine_stats
    }
