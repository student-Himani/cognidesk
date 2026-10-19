import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.db import Base


class Conversation(Base):
    """
    SQLite SQLAlchemy model for persistent offline chat conversations.
    Supports both Normal Chat and Document Chat, scoped to a Workspace.
    """
    __tablename__ = "conversations"

    id = Column(String(100), primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, default=1, index=True)
    title = Column(String(255), nullable=False, index=True)
    mode = Column(String(50), nullable=False, default="document")  # "normal" or "document"
    selected_doc_id = Column(String(50), nullable=False, default="all")  # "all" or specific document ID
    messages_json = Column(Text, nullable=False, default="[]")  # Full serialized JSON list of messages & citations
    preview_text = Column(String(500), nullable=True)  # Snippet of latest message for search preview
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    workspace = relationship("Workspace", back_populates="conversations")

    def get_messages(self):
        """Parse serialized messages JSON string into a Python list."""
        try:
            return json.loads(self.messages_json or "[]")
        except Exception:
            return []

    def set_messages(self, messages_list):
        """Serialize Python messages list into JSON and update counts/preview."""
        self.messages_json = json.dumps(messages_list or [], ensure_ascii=False)
        self.message_count = len(messages_list or [])
        if messages_list:
            last_msg = messages_list[-1]
            txt = str(last_msg.get("text", "")).strip()
            self.preview_text = txt[:200] if txt else "Empty message"
        else:
            self.preview_text = ""

    def to_dict(self):
        """Convert to frontend-friendly dictionary matching ChatThreadItem."""
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "title": self.title,
            "time": self.updated_at.strftime("%I:%M %p") if self.updated_at else "Just now",
            "mode": self.mode,
            "selectedDocId": self.selected_doc_id,
            "messages": self.get_messages(),
            "message_count": self.message_count,
            "preview_text": self.preview_text or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<Conversation id='{self.id}' title='{self.title[:20]}' workspace={self.workspace_id}>"
