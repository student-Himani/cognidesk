import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.services.notes_service import notes_service
from app.services.workspace_service import workspace_service

logger = logging.getLogger("app")

router = APIRouter()


class NoteCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, description="Note title")
    content: str = Field(..., min_length=1, description="Note content in Markdown")
    category: Optional[str] = Field(default="Manual Note", description="Category tag")
    document_id: Optional[int] = Field(default=None, description="Associated document ID")
    workspace_id: Optional[int] = Field(default=None, description="Target workspace ID")


class NoteUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, description="Updated note title")
    content: Optional[str] = Field(default=None, description="Updated note content")
    category: Optional[str] = Field(default=None, description="Updated category tag")


class AINoteGenerateRequest(BaseModel):
    document_id: int = Field(..., description="Document ID to generate AI notes from")
    model: Optional[str] = Field(default=None, description="Optional local Ollama model name")
    workspace_id: Optional[int] = Field(default=None, description="Target workspace ID")


@router.get("", status_code=status.HTTP_200_OK)
def get_all_notes(
    workspace_id: Optional[int] = None,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch all saved notes scoped to active/requested workspace with user isolation."""
    try:
        target_ws_id = workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        # Enforce workspace access isolation
        verify_workspace_access(target_ws_id, current_user, db)

        notes = notes_service.get_notes(db, workspace_id=target_ws_id)
        return {
            "success": True,
            "message": f"Retrieved {len(notes)} notes.",
            "data": notes
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching notes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch notes: {str(e)}"
        )


@router.get("/{note_id}", status_code=status.HTTP_200_OK)
def get_note(
    note_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch single note details by ID with user isolation."""
    note = notes_service.get_note_by_id(db, note_id)
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note with ID {note_id} not found."
        )
    if note.workspace_id:
        verify_workspace_access(note.workspace_id, current_user, db)

    return {
        "success": True,
        "message": "Note retrieved successfully.",
        "data": note
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreateRequest,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Create a manual note scoped to a workspace with user isolation."""
    try:
        target_ws_id = payload.workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        # Enforce workspace access isolation
        verify_workspace_access(target_ws_id, current_user, db)

        note = notes_service.create_note(
            db=db,
            title=payload.title,
            content=payload.content,
            category=payload.category or "Manual Note",
            document_id=payload.document_id,
            workspace_id=target_ws_id
        )
        return {
            "success": True,
            "message": "Note created successfully.",
            "data": note
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating note: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create note: {str(e)}"
        )


@router.put("/{note_id}", status_code=status.HTTP_200_OK)
def update_note(
    note_id: int,
    payload: NoteUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Update an existing note with user isolation."""
    existing_note = notes_service.get_note_by_id(db, note_id)
    if not existing_note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note with ID {note_id} not found."
        )
    if existing_note.workspace_id:
        verify_workspace_access(existing_note.workspace_id, current_user, db)

    updated_note = notes_service.update_note(
        db=db,
        note_id=note_id,
        title=payload.title,
        content=payload.content,
        category=payload.category
    )
    return {
        "success": True,
        "message": "Note updated successfully.",
        "data": updated_note
    }


@router.delete("/{note_id}", status_code=status.HTTP_200_OK)
def delete_note(
    note_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Delete a note by ID with user isolation."""
    existing_note = notes_service.get_note_by_id(db, note_id)
    if not existing_note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Note with ID {note_id} not found."
        )
    if existing_note.workspace_id:
        verify_workspace_access(existing_note.workspace_id, current_user, db)

    success = notes_service.delete_note(db, note_id)
    return {
        "success": True,
        "message": f"Note {note_id} deleted successfully."
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def generate_ai_note(
    payload: AINoteGenerateRequest,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Generates structured AI study notes for a document with user isolation.
    """
    try:
        target_ws_id = payload.workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        note = notes_service.generate_ai_note(
            db=db,
            document_id=payload.document_id,
            model=payload.model,
            workspace_id=target_ws_id
        )
        return {
            "success": True,
            "message": "AI notes generated and saved successfully.",
            "data": note
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating AI note: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate AI note: {str(e)}"
        )
