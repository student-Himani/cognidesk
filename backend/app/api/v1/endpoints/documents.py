import os
import json
import aiofiles
import logging
import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException, status, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db, SessionLocal
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.models.workspace import Workspace
from app.models.document import Document
from app.services.document_processor import document_processor
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.workspace_service import workspace_service

logger = logging.getLogger("app")
router = APIRouter()

# Resolve absolute uploads directory path
if os.path.isabs(settings.UPLOAD_DIR):
    absolute_upload_dir = settings.UPLOAD_DIR
else:
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    absolute_upload_dir = os.path.abspath(os.path.join(backend_dir, settings.UPLOAD_DIR))

# Ensure uploads directory exists
os.makedirs(absolute_upload_dir, exist_ok=True)



class DocumentRename(BaseModel):
    original_filename: str


def format_size(bytes_size: int) -> str:
    if bytes_size == 0:
        return "0 Bytes"
    k = 1024
    sizes = ["Bytes", "KB", "MB", "GB"]
    i = int(math.floor(math.log(bytes_size) / math.log(k)))
    return f"{round(bytes_size / math.pow(k, i), 1)} {sizes[i]}"


def map_status(db_status: str) -> str:
    status_lower = (db_status or "").lower()
    if status_lower in ("embedded", "indexed"):
        return "Indexed"
    elif status_lower == "processed":
        return "Processed"
    elif status_lower == "failed":
        return "Failed"
    else:
        return "Processing"


def process_document_background(doc_id: int):
    """
    Background worker function for Module 05, 06 & 07.
    1. Module 05: Extracts text, cleans text, extracts metadata, updates SQLite.
    2. Module 06: Chunks text, generates embeddings, stores chunks.
    3. Module 07: Stores vector embeddings & metadata in ChromaDB, updates status to 'indexed'.
    """
    db = SessionLocal()
    try:
        # Module 05: Extract and clean text
        document_processor.extract_and_process(db, doc_id)

        # Module 06: Chunk text and generate vector embeddings
        chunks_count, _ = embedding_engine.process_document_embedding(db, doc_id)

        # Module 07: Store vector embeddings in ChromaDB if chunks exist
        if chunks_count > 0:
            vector_storage.store_document_vectors(db, doc_id)
        else:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "indexed"
                db.commit()

    except Exception as e:
        logger.error(f"Error in background processing pipeline for doc {doc_id}: {e}")
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = str(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    workspace_id: Optional[int] = Form(None),
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Upload a document. Saves the file to disk, records metadata in SQLite,
    and initiates text extraction / cleaning background task (Module 05).
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing"
        )

    # Security: sanitize filename against path traversal attacks (e.g., ../../evil.pdf)
    safe_basename = os.path.basename(file.filename.replace("\\", "/")).strip()
    if not safe_basename or safe_basename in (".", ".."):
        safe_basename = f"upload_{uuid.uuid4().hex[:8]}"

    filename = safe_basename
    file_ext = os.path.splitext(filename)[1].lower().replace(".", "")

    allowed_extensions = {"pdf", "docx", "pptx", "xlsx", "txt", "csv", "md", "png", "jpg", "jpeg", "bmp"}
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: .{file_ext}. Allowed: {', '.join(sorted(allowed_extensions))}"
        )

    # Resolve target workspace ID
    target_ws_id = workspace_id
    if target_ws_id is None and x_workspace_id:
        try:
            target_ws_id = int(x_workspace_id)
        except (ValueError, TypeError):
            target_ws_id = None
    if target_ws_id is None:
        target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

    # Enforce data isolation: verify workspace ownership
    verify_workspace_access(target_ws_id, current_user, db)

    # Safe unique target file path strictly within absolute_upload_dir
    file_path = os.path.abspath(os.path.join(absolute_upload_dir, filename))
    if not file_path.startswith(absolute_upload_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: path traversal detected"
        )

    counter = 1
    name_part, ext_part = os.path.splitext(filename)
    while os.path.exists(file_path) or db.query(Document).filter(Document.filename == filename).first() is not None:
        filename = f"{name_part}_{counter}{ext_part}"
        file_path = os.path.abspath(os.path.join(absolute_upload_dir, filename))
        counter += 1

    try:
        logger.info(f"Saving uploaded file to: {file_path}")
        async with aiofiles.open(file_path, "wb") as out_file:
            while content := await file.read(1024 * 1024):  # 1MB chunks
                await out_file.write(content)
    except Exception as e:
        logger.error(f"Error saving uploaded file: {e}")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file to local storage: {str(e)}"
        )

    file_size = os.path.getsize(file_path)

    # Save document record in SQLite Database
    try:
        db_doc = Document(
            workspace_id=target_ws_id,
            filename=filename,
            original_filename=safe_basename,
            filepath=file_path,
            filetype=file_ext,
            filesize=file_size,
            status="uploaded",
            chunks=0,
            page_count=0,
            word_count=0
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

        # Trigger background processing task (Module 05)
        background_tasks.add_task(process_document_background, db_doc.id)

    except Exception as e:
        logger.error(f"Database registration failed: {e}")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database record registration failed: {str(e)}"
        )

    doc_item = {
        "id": str(db_doc.id),
        "workspace_id": db_doc.workspace_id,
        "name": db_doc.original_filename,
        "filename": db_doc.filename,
        "size": format_size(db_doc.filesize),
        "filesize": db_doc.filesize,
        "type": db_doc.filetype.upper(),
        "filetype": db_doc.filetype,
        "status": "Processing",
        "date": db_doc.created_at.strftime("%Y-%m-%d"),
        "chunks": db_doc.chunks,
        "page_count": db_doc.page_count,
        "word_count": db_doc.word_count
    }

    return {
        "success": True,
        "message": "File uploaded successfully and processing started",
        "data": doc_item
    }


@router.get("", response_model=list)
@router.get("/", response_model=list)
def list_documents(
    workspace_id: Optional[int] = None,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    List all documents in SQLite database scoped to workspace with user isolation.
    """
    target_ws_id = workspace_id
    if target_ws_id is None and x_workspace_id:
        try:
            target_ws_id = int(x_workspace_id)
        except (ValueError, TypeError):
            target_ws_id = None

    query = db.query(Document)
    if target_ws_id is not None:
        verify_workspace_access(target_ws_id, current_user, db)
        query = query.filter(Document.workspace_id == target_ws_id)
    elif current_user is not None:
        user_ws_ids = [w.id for w in db.query(Workspace.id).filter((Workspace.user_id == current_user.id) | (Workspace.user_id == None)).all()]
        query = query.filter(Document.workspace_id.in_(user_ws_ids))
    else:
        active_ws = workspace_service.get_active_workspace(db)
        query = query.filter(Document.workspace_id == active_ws["id"])

    documents = query.order_by(Document.created_at.desc()).all()
    return [
        {
            "id": str(doc.id),
            "workspace_id": doc.workspace_id,
            "name": doc.original_filename,
            "filename": doc.filename,
            "size": format_size(doc.filesize),
            "filesize": doc.filesize,
            "type": doc.filetype.upper(),
            "filetype": doc.filetype,
            "status": map_status(doc.status),
            "date": doc.created_at.strftime("%Y-%m-%d"),
            "chunks": doc.chunks,
            "page_count": doc.page_count,
            "word_count": doc.word_count,
            "has_text": bool(doc.cleaned_text and doc.cleaned_text.strip())
        }
        for doc in documents
    ]


@router.get("/{document_id}")
def get_document_details(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Retrieve single document metadata by ID.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    return {
        "id": str(doc.id),
        "name": doc.original_filename,
        "filename": doc.filename,
        "original_filename": doc.original_filename,
        "size": format_size(doc.filesize),
        "filesize": doc.filesize,
        "type": doc.filetype.upper(),
        "filetype": doc.filetype,
        "status": map_status(doc.status),
        "date": doc.created_at.strftime("%Y-%m-%d"),
        "chunks": doc.chunks,
        "chunks_count": doc.chunks,
        "page_count": doc.page_count,
        "word_count": doc.word_count,
        "extracted_text_preview": (doc.cleaned_text or "")[:150],
        "embedding_status": doc.status,
        "has_text": bool(doc.cleaned_text and doc.cleaned_text.strip())
    }


@router.post("/{document_id}/process")
def process_document_manually(
    document_id: int,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Re-trigger document processing (text extraction & metadata) manually.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    background_tasks.add_task(process_document_background, doc.id)

    return {
        "success": True,
        "message": f"Document processing initiated for ID {document_id}"
    }


@router.get("/{document_id}/content")
def get_document_content(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Retrieve extracted text, cleaned text, and metadata for a processed document (Module 05).
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    metadata_dict = {}
    if doc.metadata_json:
        try:
            metadata_dict = json.loads(doc.metadata_json)
        except Exception:
            metadata_dict = {}

    return {
        "success": True,
        "data": {
            "id": str(doc.id),
            "name": doc.original_filename,
            "status": map_status(doc.status),
            "raw_text": doc.extracted_text or "",
            "cleaned_text": doc.cleaned_text or "",
            "word_count": doc.word_count,
            "page_count": doc.page_count,
            "metadata": metadata_dict,
            "error_message": doc.error_message
        }
    }


@router.patch("/{document_id}")
def rename_document(
    document_id: int,
    payload: DocumentRename,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Rename the display name of a document in SQLite.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in database"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    new_name = payload.original_filename.strip()
    if not new_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty"
        )

    orig_ext = os.path.splitext(doc.original_filename)[1].lower()
    new_ext = os.path.splitext(new_name)[1].lower()
    if orig_ext and orig_ext != new_ext:
        new_name = f"{new_name}{orig_ext}" if not new_name.endswith(orig_ext) else new_name

    try:
        doc.original_filename = new_name
        db.commit()
        db.refresh(doc)
    except Exception as e:
        logger.error(f"Failed to rename database entry: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not rename document metadata: {str(e)}"
        )

    return {
        "success": True,
        "message": "Document renamed successfully",
        "data": {
            "id": str(doc.id),
            "name": doc.original_filename,
            "size": format_size(doc.filesize),
            "type": doc.filetype.upper(),
            "status": map_status(doc.status),
            "date": doc.created_at.strftime("%Y-%m-%d"),
            "chunks": doc.chunks,
            "page_count": doc.page_count,
            "word_count": doc.word_count
        }
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Delete a document. Removes the database record and deletes physical file from disk.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in database"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    if os.path.exists(doc.filepath):
        try:
            logger.info(f"Deleting physical file at: {doc.filepath}")
            os.remove(doc.filepath)
        except Exception as e:
            logger.error(f"Failed to delete physical file {doc.filepath}: {e}")

    # Delete associated vectors from ChromaDB
    try:
        vector_storage.delete_document_vectors(doc.id)
    except Exception as e:
        logger.warning(f"Failed to purge ChromaDB vectors for document ID {doc.id}: {e}")

    try:
        db.delete(doc)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to delete database entry: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not delete document from database: {str(e)}"
        )

    return {
        "success": True,
        "message": "Document deleted successfully"
    }


@router.get("/{document_id}/preview")
def preview_document(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Serve physical document for browser preview.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    if doc.workspace_id:
        verify_workspace_access(doc.workspace_id, current_user, db)

    abs_filepath = os.path.abspath(doc.filepath)
    if not abs_filepath.startswith(absolute_upload_dir) or not os.path.exists(abs_filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical file not found or unauthorized path"
        )

    media_types = {
        "pdf": "application/pdf",
        "txt": "text/plain",
        "md": "text/markdown",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "bmp": "image/bmp",
        "csv": "text/csv"
    }
    media_type = media_types.get(doc.filetype.lower(), "application/octet-stream")

    return FileResponse(
        path=doc.filepath,
        filename=doc.original_filename,
        media_type=media_type
    )
