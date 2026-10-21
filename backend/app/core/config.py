import os
import sys
import shutil
import glob
from datetime import datetime
from typing import List, Optional, Any
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_base_repo_dir() -> str:
    # backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> repo_root
    core_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(core_dir)
    backend_dir = os.path.dirname(app_dir)
    return os.path.dirname(backend_dir)


def resolve_data_directory() -> str:
    """
    Resolves the persistent user data directory.
    In packaged production or desktop mode (COGNIDESK_DESKTOP=1 or sys.frozen),
    stores data in %APPDATA%/CogniDesk on Windows or ~/.cognidesk on Unix.
    In dev mode, defaults to repo root unless overridden by COGNIDESK_DATA_DIR.
    """
    if os.environ.get("COGNIDESK_DATA_DIR"):
        data_dir = os.path.abspath(os.environ["COGNIDESK_DATA_DIR"])
    elif os.environ.get("COGNIDESK_DESKTOP") == "1" or getattr(sys, "frozen", False):
        app_data = os.environ.get("APPDATA")
        if app_data and sys.platform == "win32":
            data_dir = os.path.join(app_data, "CogniDesk")
        else:
            data_dir = os.path.expanduser("~/.cognidesk")
    else:
        # Development mode defaults to the repository root
        data_dir = get_base_repo_dir()

    os.makedirs(data_dir, exist_ok=True)
    return data_dir


def perform_data_migration_and_backup(data_dir: str):
    """
    1. Migrates existing database, vector_db, and uploads from repo root to persistent data dir if not present.
    2. Creates a timestamped backup of the SQLite database.
    """
    try:
        repo_dir = get_base_repo_dir()
        db_dir = os.path.join(data_dir, "database")
        vector_dir = os.path.join(data_dir, "vector_db")
        upload_dir = os.path.join(data_dir, "uploads")
        backup_dir = os.path.join(data_dir, "backups")

        for d in (db_dir, vector_dir, upload_dir, backup_dir):
            os.makedirs(d, exist_ok=True)

        target_db = os.path.join(db_dir, "cognidesk.db")
        legacy_db = os.path.join(repo_dir, "database", "cognidesk.db")

        # Migrate DB if target doesn't exist but legacy does
        if not os.path.exists(target_db) and os.path.exists(legacy_db) and os.path.abspath(target_db) != os.path.abspath(legacy_db):
            try:
                shutil.copy2(legacy_db, target_db)
                print(f"[Storage Migration] Migrated existing SQLite database from {legacy_db} to {target_db}")
            except Exception as e:
                print(f"[Storage Migration] Warning: Failed to migrate legacy DB: {e}")

        # Migrate vector_db if target empty but legacy exists
        legacy_vec = os.path.join(repo_dir, "vector_db")
        if os.path.exists(legacy_vec) and os.path.abspath(vector_dir) != os.path.abspath(legacy_vec):
            if not os.path.exists(os.path.join(vector_dir, "chroma.sqlite3")):
                try:
                    for item in os.listdir(legacy_vec):
                        src = os.path.join(legacy_vec, item)
                        dst = os.path.join(vector_dir, item)
                        if os.path.isdir(src) and not os.path.exists(dst):
                            shutil.copytree(src, dst)
                        elif os.path.isfile(src) and not os.path.exists(dst):
                            shutil.copy2(src, dst)
                    print(f"[Storage Migration] Migrated ChromaDB vector store to {vector_dir}")
                except Exception as e:
                    print(f"[Storage Migration] Warning: Failed to migrate ChromaDB: {e}")

        # Migrate uploads if target empty but legacy exists
        legacy_uploads = os.path.join(repo_dir, "uploads")
        if os.path.exists(legacy_uploads) and os.path.abspath(upload_dir) != os.path.abspath(legacy_uploads):
            try:
                for item in os.listdir(legacy_uploads):
                    src = os.path.join(legacy_uploads, item)
                    dst = os.path.join(upload_dir, item)
                    if not os.path.exists(dst):
                        if os.path.isdir(src):
                            shutil.copytree(src, dst)
                        else:
                            shutil.copy2(src, dst)
                print(f"[Storage Migration] Migrated uploads to {upload_dir}")
            except Exception as e:
                print(f"[Storage Migration] Warning: Failed to migrate uploads: {e}")

        # Create timestamped backup of the database if it exists
        if os.path.exists(target_db):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(backup_dir, f"cognidesk_backup_{timestamp}.db")
            try:
                shutil.copy2(target_db, backup_file)
                # Keep up to 7 most recent backups
                existing_backups = sorted(glob.glob(os.path.join(backup_dir, "cognidesk_backup_*.db")))
                if len(existing_backups) > 7:
                    for old_backup in existing_backups[:-7]:
                        try:
                            os.remove(old_backup)
                        except OSError:
                            pass
            except Exception as e:
                print(f"[Storage Backup] Notice: Could not create backup: {e}")

    except Exception as e:
        print(f"[Storage Init] Warning during migration/backup: {e}")


DATA_DIR = resolve_data_directory()
perform_data_migration_and_backup(DATA_DIR)

DEFAULT_DB_FILE = os.path.join(DATA_DIR, "database", "cognidesk.db").replace("\\", "/")


class Settings(BaseSettings):
    APP_NAME: str = "CogniDesk API"
    APP_ENV: str = "development"
    DEBUG: bool = True
    VERSION: str = "1.0.0"
    
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Hosted Web Deployment Mode (Module 31)
    COGNIDESK_HOSTED_MODE: bool = False
    FRONTEND_URL: Optional[str] = None
    CORS_ALLOW_ALL: bool = False
    CORS_ORIGINS: Any = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "https://cognidesk.pages.dev",
    ]

    # Hosted Cloud AI Providers (Configured securely via backend environment)
    HOSTED_LLM_PROVIDER: Optional[str] = None  # "openai" | "anthropic" | "groq" | "openrouter" | "ollama"
    HOSTED_LLM_MODEL: Optional[str] = None     # e.g. "gpt-4o-mini", "llama-3.3-70b-versatile"
    HOSTED_LLM_BASE_URL: Optional[str] = None  # e.g. custom OpenAI-compatible endpoint
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None

    # Local Ollama Fallback Settings
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_MODEL: str = "qwen2.5:3b"
    EMBEDDING_MODEL: str = "all-minilm"
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"

    # Embedding & Chunking Engine (Module 06)
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 150
    EMBEDDING_BATCH_SIZE: int = 32

    # Database & Persistent Storage (PostgreSQL or SQLite)
    DATA_DIRECTORY: str = DATA_DIR
    DATABASE_URL: str = f"sqlite:///{DEFAULT_DB_FILE}"
    
    # ChromaDB Vector Storage (Persistent directory or Remote server)
    CHROMA_PERSIST_DIR: str = os.path.join(DATA_DIR, "vector_db")
    CHROMA_COLLECTION_NAME: str = "cognidesk_documents"
    CHROMA_DISTANCE_METRIC: str = "cosine"
    CHROMA_SERVER_HOST: Optional[str] = None
    CHROMA_SERVER_PORT: Optional[int] = 8000
    CHROMA_SERVER_SSL: bool = False

    UPLOAD_DIR: str = os.path.join(DATA_DIR, "uploads")
    BACKUP_DIR: str = os.path.join(DATA_DIR, "backups")
    LOG_LEVEL: str = "INFO"

    # Authentication & Security (Module 28)
    SECRET_KEY: str = "cognidesk-offline-secret-key-328957438927498"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_cors_origins(self) -> List[str]:
        """Resolves CORS origins list from string or list format."""
        origins: List[str] = []
        if isinstance(self.CORS_ORIGINS, str):
            origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        elif isinstance(self.CORS_ORIGINS, list):
            origins = list(self.CORS_ORIGINS)
        
        if self.FRONTEND_URL and self.FRONTEND_URL not in origins:
            origins.append(self.FRONTEND_URL.rstrip("/"))
            
        return origins

    def is_hosted(self) -> bool:
        """Determines if the backend is operating as a public hosted service."""
        return bool(
            self.COGNIDESK_HOSTED_MODE
            or self.OPENAI_API_KEY
            or self.ANTHROPIC_API_KEY
            or self.GROQ_API_KEY
            or self.OPENROUTER_API_KEY
            or self.HOSTED_LLM_PROVIDER
            or os.environ.get("COGNIDESK_HOSTED_MODE") == "1"
            or os.environ.get("RENDER") == "true"
            or os.environ.get("RAILWAY_ENVIRONMENT")
            or os.environ.get("FLY_ALLOC_ID")
        )

settings = Settings()


