import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.services.chat_history_service import chat_history_service
from app.services.workspace_service import workspace_service
from app.services.suggestion_service import suggestion_service

logger = logging.getLogger("app")
router = APIRouter()


class ThreadPayload(BaseModel):
    id: str
    title: str
    time: Optional[str] = None
    mode: Optional[str] = "document"
    selectedDocId: Optional[str] = "all"
    messages: List[Dict[str, Any]]
    workspace_id: Optional[int] = None


class RenameThreadPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="New title for the conversation")


@router.get("/threads", status_code=status.HTTP_200_OK)
def get_chat_threads(
    workspace_id: Optional[int] = None,
    search: Optional[str] = Query(None, description="Search keyword in title or messages"),
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Get chat conversations persisted in SQLite database scoped to workspace with user isolation.
    """
    try:
        target_ws_id = workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        threads = chat_history_service.get_conversations(
            db=db,
            workspace_id=target_ws_id,
            search=search
        )
        return {
            "success": True,
            "message": f"Retrieved {len(threads)} conversations from SQLite",
            "data": threads
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch conversations from SQLite: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch chat history: {str(e)}"
        )


@router.get("/threads/{thread_id}", status_code=status.HTTP_200_OK)
def get_chat_thread_by_id(
    thread_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Get a single chat conversation by ID from SQLite with user isolation.
    """
    thread = chat_history_service.get_conversation_by_id(db, thread_id)
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {thread_id} not found in SQLite"
        )
    if thread.get("workspace_id"):
        verify_workspace_access(thread["workspace_id"], current_user, db)

    return {
        "success": True,
        "message": f"Conversation {thread_id} retrieved",
        "data": thread
    }


@router.post("/threads", status_code=status.HTTP_200_OK)
def save_chat_thread(
    payload: ThreadPayload,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Save or update a chat conversation in SQLite with workspace scoping and user isolation.
    """
    try:
        thread_dict = payload.model_dump()
        target_ws_id = payload.workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        saved_thread = chat_history_service.save_conversation(
            db=db,
            thread_data=thread_dict,
            workspace_id=target_ws_id
        )
        return {
            "success": True,
            "message": f"Conversation {payload.id} saved to SQLite",
            "data": saved_thread
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save conversation {payload.id} to SQLite: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist chat conversation: {str(e)}"
        )


@router.put("/threads/{thread_id}/rename", status_code=status.HTTP_200_OK)
def rename_chat_thread(
    thread_id: str,
    payload: RenameThreadPayload,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Rename an existing conversation title in SQLite with user isolation.
    """
    existing = chat_history_service.get_conversation_by_id(db, thread_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {thread_id} not found"
        )
    if existing.get("workspace_id"):
        verify_workspace_access(existing["workspace_id"], current_user, db)

    try:
        updated = chat_history_service.rename_conversation(db, thread_id, payload.title)
        return {
            "success": True,
            "message": f"Conversation renamed to '{payload.title}'",
            "data": updated
        }
    except Exception as e:
        logger.error(f"Failed to rename conversation {thread_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rename conversation: {str(e)}"
        )


@router.delete("/threads/{thread_id}", status_code=status.HTTP_200_OK)
def delete_chat_thread(
    thread_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Delete a chat conversation from SQLite database with user isolation.
    """
    existing = chat_history_service.get_conversation_by_id(db, thread_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {thread_id} not found"
        )
    if existing.get("workspace_id"):
        verify_workspace_access(existing["workspace_id"], current_user, db)

    try:
        success = chat_history_service.delete_conversation(db, thread_id)
        return {
            "success": True,
            "message": f"Conversation {thread_id} deleted from SQLite"
        }
    except Exception as e:
        logger.error(f"Failed to delete conversation {thread_id} from SQLite: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete chat conversation: {str(e)}"
        )


@router.get("/search", status_code=status.HTTP_200_OK)
def search_chat_history(
    query: str = Query(..., min_length=1, description="Search query string"),
    workspace_id: Optional[int] = None,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Full-text search conversations within active workspace with user isolation.
    """
    try:
        target_ws_id = workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        results = chat_history_service.search_conversations(
            db=db,
            query=query,
            workspace_id=target_ws_id
        )
        return {
            "success": True,
            "message": f"Found {len(results)} matching conversations",
            "data": results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search failed for query '{query}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


class SuggestionRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Latest user message")
    answer: Optional[str] = Field("", description="Latest assistant response")
    mode: Optional[str] = Field("document", description="'normal' or 'document'")
    messages: Optional[List[Dict[str, Any]]] = Field(None, description="Recent conversation history")
    citations: Optional[List[Dict[str, Any]]] = Field(None, description="Document citations from RAG")
    model: Optional[str] = Field(None, description="LLM model identifier")


@router.post("/suggestions", status_code=status.HTTP_200_OK)
def get_follow_up_suggestions(payload: SuggestionRequest, db: Session = Depends(get_db)):
    """
    Module 27: Generate 2-4 contextual follow-up question suggestions
    based on the latest user query, assistant answer, conversation context,
    and retrieved RAG document citations.
    """
    try:
        suggestions = suggestion_service.generate_suggestions(
            db=db,
            query=payload.query,
            answer=payload.answer,
            mode=payload.mode or "document",
            messages=payload.messages,
            citations=payload.citations,
            model=payload.model
        )
        return {
            "success": True,
            "message": f"Generated {len(suggestions)} follow-up suggestions.",
            "suggestions": suggestions
        }
    except Exception as e:
        logger.warning(f"Error handling suggestion request: {e}")
        fallback_suggestions = [
            "Can you explain that in more detail?",
            "What are the practical applications or examples of this?",
            "How does this relate to other concepts?"
        ]
        return {
            "success": True,
            "message": "Fallback suggestions provided.",
            "suggestions": fallback_suggestions
        }
