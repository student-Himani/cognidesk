from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from app.core.db import Base


class SearchHistory(Base):
    """
    SQLite SQLAlchemy model for logging search queries and search metadata.
    """
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    query_text = Column(String(500), nullable=False, index=True)
    search_mode = Column(String(50), nullable=False, default="semantic")
    filters_json = Column(Text, nullable=True)
    results_count = Column(Integer, default=0)
    execution_time_ms = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<SearchHistory id={self.id} query='{self.query_text[:20]}' mode='{self.search_mode}'>"
