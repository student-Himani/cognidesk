import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.services.workspace_service import workspace_service

logger = logging.getLogger("app")
router = APIRouter()


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Workspace name")
    category: Optional[str] = Field(default="General", description="Workspace category")
    description: Optional[str] = Field(default="", description="Workspace description")
    set_active: Optional[bool] = Field(default=False, description="Whether to activate immediately")


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, description="Updated workspace name")
    category: Optional[str] = Field(default=None, description="Updated workspace category")
    description: Optional[str] = Field(default=None, description="Updated workspace description")


@router.get("", status_code=status.HTTP_200_OK)
def get_all_workspaces(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch all workspaces scoped to the current user (or all if unauthenticated)."""
    try:
        user_id = current_user.id if current_user else None
        workspaces = workspace_service.get_workspaces(db, user_id=user_id)
        return {
            "success": True,
            "message": f"Retrieved {len(workspaces)} workspaces.",
            "data": workspaces
        }
    except Exception as e:
        logger.error(f"Error fetching workspaces: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workspaces: {str(e)}"
        )


@router.get("/active", status_code=status.HTTP_200_OK)
def get_active_workspace(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch the currently active workspace for the current user."""
    try:
        user_id = current_user.id if current_user else None
        active = workspace_service.get_active_workspace(db, user_id=user_id)
        return {
            "success": True,
            "message": "Active workspace retrieved.",
            "data": active
        }
    except Exception as e:
        logger.error(f"Error fetching active workspace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active workspace: {str(e)}"
        )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Create a new offline workspace scoped to the current user."""
    try:
        user_id = current_user.id if current_user else None
        created = workspace_service.create_workspace(
            db=db,
            name=payload.name,
            category=payload.category or "General",
            description=payload.description,
            set_active=bool(payload.set_active),
            user_id=user_id
        )
        return {
            "success": True,
            "message": f"Workspace '{payload.name}' created successfully.",
            "data": created
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating workspace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create workspace: {str(e)}"
        )


@router.put("/{workspace_id}", status_code=status.HTTP_200_OK)
def update_workspace(
    workspace_id: int,
    payload: WorkspaceUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Rename or update a workspace. Enforces user ownership."""
    # Enforce data isolation: 403 if accessing another user's workspace
    verify_workspace_access(workspace_id, current_user, db)

    try:
        updated = workspace_service.update_workspace(
            db=db,
            workspace_id=workspace_id,
            name=payload.name,
            category=payload.category,
            description=payload.description
        )
        return {
            "success": True,
            "message": "Workspace updated successfully.",
            "data": updated
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error updating workspace {workspace_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update workspace: {str(e)}"
        )


@router.post("/{workspace_id}/activate", status_code=status.HTTP_200_OK)
def set_active_workspace(
    workspace_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Switch active workspace in SQLite. Enforces user ownership."""
    # Enforce data isolation: 403 if accessing another user's workspace
    verify_workspace_access(workspace_id, current_user, db)

    try:
        user_id = current_user.id if current_user else None
        active = workspace_service.set_active_workspace(db, workspace_id, user_id=user_id)
        return {
            "success": True,
            "message": f"Workspace {workspace_id} is now active.",
            "data": active
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error activating workspace {workspace_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to activate workspace: {str(e)}"
        )


@router.delete("/{workspace_id}", status_code=status.HTTP_200_OK)
def delete_workspace(
    workspace_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Delete a workspace and cascade-delete all its scoped content. Enforces user ownership."""
    # Enforce data isolation: 403 if accessing another user's workspace
    verify_workspace_access(workspace_id, current_user, db)

    try:
        user_id = current_user.id if current_user else None
        result = workspace_service.delete_workspace(db, workspace_id, user_id=user_id)
        return {
            "success": True,
            "message": result["message"],
            "data": result
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error deleting workspace {workspace_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete workspace: {str(e)}"
        )
