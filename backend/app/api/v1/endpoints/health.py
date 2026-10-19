import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.db import get_db
from app.core.chroma import get_chroma_client
from app.core.config import settings

logger = logging.getLogger("app")
router = APIRouter()

@router.get("/health", response_model=dict)
def health_check(db: Session = Depends(get_db)):
    """
    Check the health of the FastAPI backend, SQLite Database, and ChromaDB.
    """
    health_status = {
        "status": "healthy",
        "services": {
            "api": "healthy",
            "database": "unhealthy",
            "vector_store": "unhealthy"
        }
    }
    
    # 1. Check Database connection
    try:
        db.execute(text("SELECT 1"))
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["status"] = "degraded"
        health_status["services"]["database"] = f"unhealthy: {str(e)}"
        
    # 2. Check Vector Store connection (ChromaDB)
    try:
        client = get_chroma_client()
        # ChromaDB PersistentClient has a heartbeat() method
        heartbeat = client.heartbeat()
        if heartbeat is not None:
            health_status["services"]["vector_store"] = "healthy"
        else:
            health_status["status"] = "degraded"
            health_status["services"]["vector_store"] = "unhealthy: no heartbeat"
    except Exception as e:
        logger.error(f"Vector store health check failed: {e}")
        health_status["status"] = "degraded"
        health_status["services"]["vector_store"] = f"unhealthy: {str(e)}"
        
    return health_status
