import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.models.document import Document
from app.services.search_service import search_service

logger = logging.getLogger("app")

router = APIRouter()


class SearchQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query text")
    top_k: int = Field(default=5, ge=1, le=50, description="Top K documents/chunks to retrieve")
    search_mode: str = Field(default="semantic", description="Search mode: 'semantic' or 'fulltext'")
    filetype: Optional[str] = Field(default=None, description="Filter results by file extension (pdf, docx, txt, etc.)")
    document_ids: Optional[List[int]] = Field(default=None, description="Filter results to specific document IDs")
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Minimum similarity score threshold (0.0 to 1.0)")
    workspace_id: Optional[int] = Field(default=None, description="Workspace ID filter")


@router.post("/query", status_code=status.HTTP_200_OK)
@router.post("/semantic", status_code=status.HTTP_200_OK)
def search_documents(
    payload: SearchQueryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Module 08: Perform Semantic or Full-Text search across indexed knowledge base with workspace isolation.
    """
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    # Workspace data isolation checks
    if payload.workspace_id:
        verify_workspace_access(payload.workspace_id, current_user, db)

    if payload.document_ids:
        docs = db.query(Document).filter(Document.id.in_(payload.document_ids)).all()
        for doc in docs:
            if doc.workspace_id:
                verify_workspace_access(doc.workspace_id, current_user, db)

    try:
        results_payload = search_service.execute_search(
            db=db,
            query=payload.query,
            top_k=payload.top_k,
            search_mode=payload.search_mode,
            filetype=payload.filetype,
            document_ids=payload.document_ids,
            min_score=payload.min_score,
            workspace_id=payload.workspace_id
        )
        return {
            "success": True,
            "message": "Search query executed successfully.",
            "data": results_payload
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing search for query '{payload.query}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute search: {str(e)}"
        )


@router.get("/history", status_code=status.HTTP_200_OK)
def get_search_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Fetches recent search history records from SQLite database.
    """
    try:
        history = search_service.get_history(db, limit=limit)
        return {
            "success": True,
            "message": f"Retrieved {len(history)} search history items.",
            "data": {
                "total_items": len(history),
                "history": history
            }
        }
    except Exception as e:
        logger.error(f"Error fetching search history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve search history: {str(e)}"
        )


@router.delete("/history", status_code=status.HTTP_200_OK)
def clear_search_history(db: Session = Depends(get_db)):
    """
    Clears all search history records from SQLite.
    """
    try:
        deleted_count = search_service.clear_history(db)
        return {
            "success": True,
            "message": f"Successfully cleared {deleted_count} search history records.",
            "data": {
                "deleted_count": deleted_count
            }
        }
    except Exception as e:
        logger.error(f"Error clearing search history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear search history: {str(e)}"
        )


@router.delete("/history/{history_id}", status_code=status.HTTP_200_OK)
def delete_search_history_item(history_id: int, db: Session = Depends(get_db)):
    """
    Deletes a single search history record by ID.
    """
    try:
        success = search_service.delete_history_item(db, history_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Search history record ID {history_id} not found.")
        return {
            "success": True,
            "message": f"Successfully deleted search history record ID {history_id}.",
            "data": {
                "deleted_id": history_id
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting search history record ID {history_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete search history record: {str(e)}"
        )
