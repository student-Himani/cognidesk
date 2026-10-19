import os
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger("app")

_chroma_client = None


def get_chroma_client():
    """
    Initialize and return a persistent or remote ChromaDB client.
    Supports local persistent disk storage or hosted Chroma service.
    """
    global _chroma_client
    if _chroma_client is None:
        try:
            import chromadb

            # Check for remote ChromaDB server configuration
            if getattr(settings, "CHROMA_SERVER_HOST", None):
                host = settings.CHROMA_SERVER_HOST
                port = getattr(settings, "CHROMA_SERVER_PORT", 8000) or 8000
                ssl = getattr(settings, "CHROMA_SERVER_SSL", False)
                logger.info(f"Connecting to remote ChromaDB service at {host}:{port} (ssl={ssl})")
                _chroma_client = chromadb.HttpClient(host=host, port=port, ssl=ssl)
            else:
                # Resolve absolute path for vector db storage
                raw_path = getattr(settings, "CHROMA_PERSIST_DIR", "../vector_db")
                if not os.path.isabs(raw_path):
                    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    absolute_chroma_dir = os.path.abspath(os.path.join(backend_dir, raw_path))
                else:
                    absolute_chroma_dir = raw_path

                os.makedirs(absolute_chroma_dir, exist_ok=True)
                logger.info(f"Initializing ChromaDB persistent storage at: {absolute_chroma_dir}")
                _chroma_client = chromadb.PersistentClient(path=absolute_chroma_dir)
        except ImportError:
            logger.error("chromadb package is not installed. Please check requirements.")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            raise

    return _chroma_client


def get_or_create_collection(collection_name: Optional[str] = None):
    """
    Get or create a ChromaDB collection with cosine distance metric configured.
    """
    client = get_chroma_client()
    name = collection_name or getattr(settings, "CHROMA_COLLECTION_NAME", "cognidesk_documents")
    metric = getattr(settings, "CHROMA_DISTANCE_METRIC", "cosine")

    try:
        collection = client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": metric}
        )
        return collection
    except Exception as e:
        logger.error(f"Error accessing ChromaDB collection '{name}': {e}")
        raise
