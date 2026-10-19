from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.db import Base

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, default=1, index=True)
    filename = Column(String, unique=True, index=True, nullable=False)
    original_filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    filetype = Column(String, nullable=False)
    filesize = Column(Integer, nullable=False)
    status = Column(String, default="uploaded")  # uploaded, processing, processed, embedding, embedded, failed
    chunks = Column(Integer, default=0)
    page_count = Column(Integer, default=0)
    word_count = Column(Integer, default=0)
    extracted_text = Column(Text, nullable=True)
    cleaned_text = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workspace = relationship("Workspace", back_populates="documents")
    chunks_rel = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

