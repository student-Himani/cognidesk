from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.db import Base

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    start_char = Column(Integer, nullable=False, default=0)
    end_char = Column(Integer, nullable=False, default=0)
    word_count = Column(Integer, nullable=False, default=0)
    character_count = Column(Integer, nullable=False, default=0)
    embedding_json = Column(Text, nullable=True)  # JSON representation of float list vector
    embedding_model = Column(String, nullable=False, default="all-MiniLM-L6-v2")
    metadata_json = Column(Text, nullable=True)   # JSON representation of chunk metadata
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to Document
    document = relationship("Document", back_populates="chunks_rel")
