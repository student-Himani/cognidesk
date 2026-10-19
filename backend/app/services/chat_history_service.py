import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.conversation import Conversation
from app.models.workspace import Workspace
from app.services.redis_service import redis_service

logger = logging.getLogger("app")


class ChatHistoryService:
    """
    Service for persistent offline chat activity and conversation history using SQLite,
    scoped strictly to workspaces.
    """

    def get_conversations(
        self,
        db: Session,
        workspace_id: Optional[int] = None,
        search: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Fetch conversations ordered by most recently updated, scoped to workspace."""
        query = db.query(Conversation)

        if workspace_id is not None:
            query = query.filter(Conversation.workspace_id == workspace_id)

        if search and search.strip():
            clean_search = search.strip()
            term = f"%{clean_search}%"
            query = query.filter(
                or_(
                    Conversation.title.ilike(term),
                    Conversation.preview_text.ilike(term),
                    Conversation.messages_json.ilike(term)
                )
            )

        conversations = query.order_by(Conversation.updated_at.desc()).limit(limit).all()
        return [c.to_dict() for c in conversations]

    def get_conversation_by_id(self, db: Session, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Fetch single conversation thread by ID."""
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return None
        return conv.to_dict()

    def save_conversation(
        self,
        db: Session,
        thread_data: Dict[str, Any],
        workspace_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create or update a conversation in SQLite."""
        conv_id = str(thread_data.get("id") or "").strip()
        if not conv_id:
            raise ValueError("Conversation ID is required.")

        target_ws_id = workspace_id or thread_data.get("workspace_id")
        if target_ws_id is None:
            from app.services.workspace_service import workspace_service
            target_ws_id = workspace_service.get_active_workspace(db)["id"]

        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        new_title = thread_data.get("title")
        new_mode = thread_data.get("mode")
        new_doc_id = thread_data.get("selectedDocId")
        msgs = thread_data.get("messages")

        if conv:
            if new_title is not None:
                conv.title = str(new_title).strip()
            if new_mode is not None:
                conv.mode = str(new_mode).strip()
            if new_doc_id is not None:
                conv.selected_doc_id = str(new_doc_id).strip()
            if target_ws_id is not None:
                conv.workspace_id = target_ws_id
            if msgs is not None:
                conv.set_messages(msgs)
            conv.updated_at = datetime.now(timezone.utc)
        else:
            conv = Conversation(
                id=conv_id,
                workspace_id=target_ws_id,
                title=str(new_title or "New Conversation").strip(),
                mode=str(new_mode or "document"),
                selected_doc_id=str(new_doc_id or "all"),
            )
            conv.set_messages(msgs or [])
            db.add(conv)

        db.commit()
        db.refresh(conv)

        result = conv.to_dict()
        try:
            redis_service.save_thread(result)
        except Exception:
            pass

        return result

    def rename_conversation(self, db: Session, conversation_id: str, new_title: str) -> Optional[Dict[str, Any]]:
        """Rename an existing conversation title."""
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return None

        conv.title = new_title.strip()
        conv.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conv)

        result = conv.to_dict()
        try:
            redis_service.save_thread(result)
        except Exception:
            pass

        return result

    def delete_conversation(self, db: Session, conversation_id: str) -> bool:
        """Delete conversation by ID from SQLite and Redis cache."""
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return False

        db.delete(conv)
        db.commit()

        try:
            redis_service.delete_thread(conversation_id)
        except Exception:
            pass

        return True

    def search_conversations(
        self,
        db: Session,
        query: str,
        workspace_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Full-text search across titles, messages, and preview text."""
        return self.get_conversations(db=db, workspace_id=workspace_id, search=query)


chat_history_service = ChatHistoryService()
