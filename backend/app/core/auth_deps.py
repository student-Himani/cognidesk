import logging
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import User
from app.models.workspace import Workspace
from app.services.auth_service import auth_service

logger = logging.getLogger("app")


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Strict dependency: Requires a valid Bearer token.
    Returns the authenticated User or raises 401 Unauthorized.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in or continue as Guest.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = parts[1]
    payload = auth_service.decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token subject.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = auth_service.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deactivated.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return user


def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Flexible dependency for backwards-compatibility:
    If Authorization header is provided, strictly validates it (raising 401 if invalid).
    If no Authorization header is provided, returns None (allowing default local workspace fallback).
    """
    if not authorization:
        return None

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = parts[1]
    payload = auth_service.decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token subject.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = auth_service.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deactivated.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return user


def verify_workspace_access(
    workspace_id: int,
    user: Optional[User],
    db: Session
) -> Workspace:
    """
    Enforces user-to-workspace data isolation.
    Returns 404 if workspace does not exist.
    Returns 403 Forbidden if the workspace belongs to a different user.
    """
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace with ID {workspace_id} not found."
        )

    if user is not None:
        # If workspace is assigned to another user, check if it's the default local user (user_id == 1) or unassigned
        if ws.user_id is not None and ws.user_id != user.id:
            if ws.user_id == 1:
                # Seamlessly re-assign local workspace to the active user on this local machine
                logger.info(
                    f"Re-assigning legacy local workspace {workspace_id} ('{ws.name}') from local user 1 to active user {user.id}"
                )
                ws.user_id = user.id
                db.commit()
                db.refresh(ws)
                return ws

            logger.warning(
                f"Data isolation violation: User {user.id} attempted to access Workspace {workspace_id} owned by User {ws.user_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: You do not have permission to access workspace '{ws.name}'."
            )
        elif ws.user_id is None:
            # Re-assign unassigned workspace to the active user
            ws.user_id = user.id
            db.commit()
            db.refresh(ws)

    return ws
