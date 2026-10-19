import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.db import get_db
from app.core.auth_deps import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.services.auth_service import auth_service

logger = logging.getLogger("app")
router = APIRouter()


class RegisterRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="User password (min 6 chars)")
    full_name: Optional[str] = Field(default=None, description="Full name or display nickname")
    guest_token: Optional[str] = Field(default=None, description="Current guest token to claim data from")


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")
    guest_token: Optional[str] = Field(default=None, description="Optional guest token to merge data into account")


class GuestRequest(BaseModel):
    guest_token: Optional[str] = Field(default=None, description="Existing guest token to resume session")


class ClaimGuestRequest(BaseModel):
    guest_token: str = Field(..., description="Guest token containing workspaces to transfer")


def format_user_response(user: User, db: Session) -> dict:
    ws_count = db.query(func.count(Workspace.id)).filter(Workspace.user_id == user.id).scalar() or 0
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_guest": bool(user.is_guest),
        "is_active": bool(user.is_active),
        "workspace_count": ws_count,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new persistent user account."""
    try:
        user, token = auth_service.register_user(
            db=db,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            guest_token=payload.guest_token
        )
        return {
            "success": True,
            "message": "Account created successfully.",
            "data": {
                "user": format_user_response(user, db),
                "token": token
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", status_code=status.HTTP_200_OK)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Log in to an existing account with email and password."""
    try:
        user, token = auth_service.authenticate_user(
            db=db,
            email=payload.email,
            password=payload.password,
            guest_token=payload.guest_token
        )
        return {
            "success": True,
            "message": "Login successful.",
            "data": {
                "user": format_user_response(user, db),
                "token": token
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(ve))
    except Exception as e:
        logger.error(f"Error authenticating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )


@router.post("/guest", status_code=status.HTTP_200_OK)
def start_guest_session(payload: Optional[GuestRequest] = None, db: Session = Depends(get_db)):
    """Start or resume an offline Guest session without registration."""
    try:
        existing_token = payload.guest_token if payload else None
        guest_user, token = auth_service.create_guest_user(db=db, existing_guest_token=existing_token)
        return {
            "success": True,
            "message": "Guest session started.",
            "data": {
                "user": format_user_response(guest_user, db),
                "token": token
            }
        }
    except Exception as e:
        logger.error(f"Error creating guest session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Guest mode initialization failed: {str(e)}"
        )


@router.get("/me", status_code=status.HTTP_200_OK)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve current authenticated user or guest profile."""
    return {
        "success": True,
        "message": "Profile retrieved.",
        "data": format_user_response(current_user, db)
    }


@router.post("/claim-guest", status_code=status.HTTP_200_OK)
def claim_guest_data(
    payload: ClaimGuestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transfer guest workspaces and documents to the logged-in user."""
    try:
        claimed_count = auth_service.claim_guest_workspaces(
            db=db,
            target_user=current_user,
            guest_token=payload.guest_token
        )
        return {
            "success": True,
            "message": f"Successfully claimed {claimed_count} guest workspace(s).",
            "data": {
                "claimed_count": claimed_count,
                "user": format_user_response(current_user, db)
            }
        }
    except Exception as e:
        logger.error(f"Error claiming guest data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to claim guest data: {str(e)}"
        )


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout():
    """Logout current user (client clears local token)."""
    return {
        "success": True,
        "message": "Logged out successfully."
    }
