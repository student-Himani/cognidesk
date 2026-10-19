import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.note import Note
from app.models.flashcard import FlashcardDeck
from app.services.vector_storage import vector_storage
from app.services.redis_service import redis_service

logger = logging.getLogger("app")


class WorkspaceService:
    """
    Offline Workspace Management Service:
    Handles SQLite CRUD operations for workspaces, workspace switching,
    workspace-scoped statistics, and cascading lifecycle management.
    """

    def get_workspaces(self, db: Session, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Fetch workspaces with scoped counts of documents, chunks, notes, and decks."""
        query = db.query(Workspace)
        if user_id is not None:
            query = query.filter((Workspace.user_id == user_id) | (Workspace.user_id == None))
        workspaces = query.order_by(Workspace.created_at.asc()).all()
        result = []
        for ws in workspaces:
            doc_count = db.query(func.count(Document.id)).filter(Document.workspace_id == ws.id).scalar() or 0
            
            # Count chunks for documents in this workspace
            chunk_count = (
                db.query(func.count(DocumentChunk.id))
                .join(Document, Document.id == DocumentChunk.document_id)
                .filter(Document.workspace_id == ws.id)
                .scalar()
                or 0
            )
            
            note_count = db.query(func.count(Note.id)).filter(Note.workspace_id == ws.id).scalar() or 0
            deck_count = db.query(func.count(FlashcardDeck.id)).filter(FlashcardDeck.workspace_id == ws.id).scalar() or 0

            result.append({
                "id": ws.id,
                "name": ws.name,
                "description": ws.description or "",
                "category": ws.category or "General",
                "is_active": bool(ws.is_active),
                "user_id": ws.user_id,
                "document_count": doc_count,
                "chunk_count": chunk_count,
                "note_count": note_count,
                "deck_count": deck_count,
                "flashcard_deck_count": deck_count,
                "created_at": ws.created_at.isoformat() if ws.created_at else None,
                "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
            })
        return result

    def get_active_workspace(self, db: Session, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Fetch the currently active workspace. If none is active, activates the first one."""
        if user_id is not None:
            active = db.query(Workspace).filter(
                ((Workspace.user_id == user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)),
                Workspace.is_active == True
            ).first()
            if not active:
                active = db.query(Workspace).filter(
                    (Workspace.user_id == user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)
                ).order_by(Workspace.id.asc()).first()
                if not active:
                    # Create default workspace for user
                    active = Workspace(
                        name="Default Workspace",
                        description="Primary offline knowledge workspace",
                        category="General",
                        user_id=user_id,
                        is_active=True
                    )
                    db.add(active)
                    db.commit()
                    db.refresh(active)
                else:
                    active.is_active = True
                    db.commit()
                    db.refresh(active)
        else:
            active = db.query(Workspace).filter(Workspace.is_active == True).first()
            if not active:
                active = db.query(Workspace).order_by(Workspace.id.asc()).first()
                if not active:
                    # Create Default Workspace if table is completely empty
                    active = Workspace(
                        id=1,
                        name="Default Workspace",
                        description="Primary offline knowledge workspace",
                        category="General",
                        user_id=1,
                        is_active=True
                    )
                    db.add(active)
                    db.commit()
                    db.refresh(active)
                else:
                    active.is_active = True
                    db.commit()
                    db.refresh(active)

        doc_count = db.query(func.count(Document.id)).filter(Document.workspace_id == active.id).scalar() or 0
        chunk_count = (
            db.query(func.count(DocumentChunk.id))
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(Document.workspace_id == active.id)
            .scalar() or 0
        )
        note_count = db.query(func.count(Note.id)).filter(Note.workspace_id == active.id).scalar() or 0
        deck_count = db.query(func.count(FlashcardDeck.id)).filter(FlashcardDeck.workspace_id == active.id).scalar() or 0

        return {
            "id": active.id,
            "name": active.name,
            "description": active.description or "",
            "category": active.category or "General",
            "is_active": True,
            "user_id": active.user_id,
            "document_count": doc_count,
            "chunk_count": chunk_count,
            "note_count": note_count,
            "deck_count": deck_count,
            "flashcard_deck_count": deck_count,
            "created_at": active.created_at.isoformat() if active.created_at else None,
            "updated_at": active.updated_at.isoformat() if active.updated_at else None,
        }

    def get_workspace_by_id(self, db: Session, workspace_id: int) -> Optional[Workspace]:
        """Fetch workspace model instance by ID."""
        return db.query(Workspace).filter(Workspace.id == workspace_id).first()

    def create_workspace(
        self,
        db: Session,
        name: str,
        category: str = "General",
        description: Optional[str] = None,
        set_active: bool = False,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a new workspace scoped to a user."""
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Workspace name cannot be empty.")

        # Check for duplicate names scoped to user
        query = db.query(Workspace).filter(func.lower(Workspace.name) == clean_name.lower())
        if user_id is not None:
            query = query.filter((Workspace.user_id == user_id) | (Workspace.user_id == None))
        existing = query.first()
        if existing:
            raise ValueError(f"Workspace with name '{clean_name}' already exists.")

        if set_active:
            if user_id is not None:
                db.query(Workspace).filter(Workspace.user_id == user_id).update({"is_active": False})
            else:
                db.query(Workspace).update({"is_active": False})

        new_ws = Workspace(
            name=clean_name,
            category=(category or "General").strip(),
            description=(description or "").strip(),
            is_active=set_active,
            user_id=user_id
        )
        db.add(new_ws)
        db.commit()
        db.refresh(new_ws)

        return {
            "id": new_ws.id,
            "name": new_ws.name,
            "description": new_ws.description or "",
            "category": new_ws.category or "General",
            "is_active": bool(new_ws.is_active),
            "user_id": new_ws.user_id,
            "document_count": 0,
            "chunk_count": 0,
            "note_count": 0,
            "deck_count": 0,
            "created_at": new_ws.created_at.isoformat() if new_ws.created_at else None,
            "updated_at": new_ws.updated_at.isoformat() if new_ws.updated_at else None,
        }

    def update_workspace(
        self,
        db: Session,
        workspace_id: int,
        name: Optional[str] = None,
        category: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update workspace name, category, or description."""
        ws = self.get_workspace_by_id(db, workspace_id)
        if not ws:
            raise ValueError(f"Workspace with ID {workspace_id} not found.")

        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise ValueError("Workspace name cannot be empty.")
            # Check for duplicate name in workspaces accessible by this user
            dup_query = db.query(Workspace).filter(
                func.lower(Workspace.name) == clean_name.lower(),
                Workspace.id != workspace_id
            )
            if ws.user_id is not None:
                dup_query = dup_query.filter(
                    (Workspace.user_id == ws.user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)
                )
            else:
                dup_query = dup_query.filter(
                    (Workspace.user_id == 1) | (Workspace.user_id == None)
                )
            duplicate = dup_query.first()
            if duplicate:
                raise ValueError(f"Another workspace with name '{clean_name}' already exists.")
            ws.name = clean_name

        if category is not None:
            ws.category = category.strip() or "General"

        if description is not None:
            ws.description = description.strip()

        ws.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(ws)

        return {
            "id": ws.id,
            "name": ws.name,
            "description": ws.description or "",
            "category": ws.category or "General",
            "is_active": bool(ws.is_active),
            "created_at": ws.created_at.isoformat() if ws.created_at else None,
            "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
        }

    def set_active_workspace(self, db: Session, workspace_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Activate a workspace and deactivate all other workspaces in SQLite for the user."""
        ws = self.get_workspace_by_id(db, workspace_id)
        if not ws:
            raise ValueError(f"Workspace with ID {workspace_id} not found.")

        # Deactivate previous active workspace
        if user_id is not None:
            db.query(Workspace).filter(
                (Workspace.user_id == user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)
            ).update({"is_active": False})
        else:
            db.query(Workspace).update({"is_active": False})

        # Activate target
        ws.is_active = True
        ws.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(ws)

        return self.get_active_workspace(db, user_id=user_id)

    def delete_workspace(self, db: Session, workspace_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Delete a workspace and cascade-delete its scoped documents (including ChromaDB vectors),
        notes, and flashcard decks. If active workspace is deleted, activates another workspace.
        """
        if workspace_id == 1:
            raise ValueError("Cannot delete the Default Workspace (ID: 1).")

        if user_id is not None:
            total_count = db.query(func.count(Workspace.id)).filter(
                (Workspace.user_id == user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)
            ).scalar()
        else:
            total_count = db.query(func.count(Workspace.id)).scalar()

        if total_count <= 1:
            raise ValueError("Cannot delete the only remaining workspace. CogniDesk requires at least one active workspace.")

        ws = self.get_workspace_by_id(db, workspace_id)
        if not ws:
            raise ValueError(f"Workspace with ID {workspace_id} not found.")

        was_active = ws.is_active

        # 1. Clean up ChromaDB vectors for documents in this workspace
        docs = db.query(Document).filter(Document.workspace_id == workspace_id).all()
        for d in docs:
            try:
                vector_storage.delete_document_vectors(d.id)
            except Exception as e:
                logger.warning(f"Failed to delete ChromaDB vectors for doc {d.id} during workspace deletion: {e}")

        # 2. Clean up scoped chat threads from Redis
        try:
            threads = redis_service.get_all_threads()
            for t in threads:
                if t.get("workspace_id") == workspace_id:
                    redis_service.delete_thread(t.get("id"))
        except Exception as e:
            logger.warning(f"Error cleaning up chat threads for workspace {workspace_id}: {e}")

        # 3. Delete workspace (SQLAlchemy cascade handles documents, notes, flashcard decks)
        db.delete(ws)
        db.commit()

        # 4. If the deleted workspace was active, activate the first available workspace
        new_active = None
        if was_active:
            if user_id is not None:
                new_active_ws = db.query(Workspace).filter(
                    (Workspace.user_id == user_id) | (Workspace.user_id == 1) | (Workspace.user_id == None)
                ).order_by(Workspace.id.asc()).first()
            else:
                new_active_ws = db.query(Workspace).order_by(Workspace.id.asc()).first()

            if new_active_ws:
                new_active_ws.is_active = True
                db.commit()
                db.refresh(new_active_ws)
                new_active = new_active_ws.id

        return {
            "deleted_id": workspace_id,
            "new_active_id": new_active,
            "message": f"Workspace {workspace_id} deleted successfully."
        }


workspace_service = WorkspaceService()
