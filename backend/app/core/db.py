import os
import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

logger = logging.getLogger("app")
db_url = settings.DATABASE_URL

# Normalize postgres:// to postgresql:// for SQLAlchemy compatibility
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Parse the database URL to get file path if it's SQLite
if db_url.startswith("sqlite:///"):
    raw_path = db_url.replace("sqlite:///", "")
    if not os.path.isabs(raw_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        abs_path = os.path.abspath(os.path.join(backend_dir, raw_path))
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        db_url = f"sqlite:///{abs_path}"
    else:
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)

# Create engine with appropriate pooling and connection settings
if db_url.startswith("sqlite"):
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        db_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True
    )

# Function to auto-migrate SQLite table columns if created in earlier phases
def migrate_sqlite_schema():
    if engine.dialect.name != "sqlite":
        return
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "documents" in tables:
            columns = {col["name"] for col in inspector.get_columns("documents")}
            required_columns = {
                "page_count": "INTEGER DEFAULT 0",
                "word_count": "INTEGER DEFAULT 0",
                "extracted_text": "TEXT",
                "cleaned_text": "TEXT",
                "metadata_json": "TEXT",
                "error_message": "VARCHAR"
            }
            with engine.connect() as conn:
                for col_name, col_type in required_columns.items():
                    if col_name not in columns:
                        logger.info(f"Auto-migrating SQLite DB: Adding column {col_name} to documents table.")
                        conn.execute(text(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}"))
                conn.commit()
        if "workspaces" in tables:
            ws_columns = {col["name"] for col in inspector.get_columns("workspaces")}
            if "user_id" not in ws_columns:
                logger.info("Auto-migrating SQLite DB: Adding column user_id to workspaces table.")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE workspaces ADD COLUMN user_id INTEGER"))
                    conn.commit()
        if "app_settings" in tables:
            setting_columns = {col["name"] for col in inspector.get_columns("app_settings")}
            required_setting_cols = {
                "ollama_fallback_models": "TEXT DEFAULT 'qwen2.5:7b,llama3.2:3b,mistral:7b'",
                "enable_ollama_fallback": "INTEGER DEFAULT 1"
            }
            with engine.connect() as conn:
                for col_name, col_type in required_setting_cols.items():
                    if col_name not in setting_columns:
                        logger.info(f"Auto-migrating SQLite DB: Adding column {col_name} to app_settings table.")
                        conn.execute(text(f"ALTER TABLE app_settings ADD COLUMN {col_name} {col_type}"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Database schema auto-migration notice: {e}")

migrate_sqlite_schema()

def init_db_users():
    """
    Ensures default local user exists and all pre-existing workspaces
    without user_id are safely assigned to the default local user.
    """
    try:
        from app.models.user import User
        Base.metadata.create_all(bind=engine, tables=[User.__table__])

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        with engine.connect() as conn:
            if "users" in tables:
                user1_exists = conn.execute(text("SELECT COUNT(*) FROM users WHERE id = 1")).scalar()
                if user1_exists == 0:
                    logger.info("Seeding Default User (ID: 1) in database.")
                    from app.services.auth_service import auth_service
                    default_pwd = auth_service.hash_password("cognidesk123")
                    conn.execute(text(
                        "INSERT INTO users (id, email, full_name, hashed_password, is_guest, is_active, created_at, updated_at) "
                        "VALUES (1, 'local@cognidesk.local', 'Local User', :pwd, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                    ), {"pwd": default_pwd})
                    conn.commit()

            if "workspaces" in tables:
                # Ensure all unassigned workspaces point to user 1
                conn.execute(text("UPDATE workspaces SET user_id = 1 WHERE user_id IS NULL"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Users schema initialization notice: {e}")

def init_db_workspaces():
    """
    Ensures the workspaces table is initialized, default workspace exists,
    and documents/notes/flashcard_decks tables have the workspace_id column.
    """
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        with engine.connect() as conn:
            # Check and add workspace_id column to tables if missing
            if engine.dialect.name == "sqlite":
                for table_name in ["documents", "notes", "flashcard_decks"]:
                    if table_name in tables:
                        columns = {col["name"] for col in inspector.get_columns(table_name)}
                        if "workspace_id" not in columns:
                            logger.info(f"Adding workspace_id column to {table_name} table.")
                            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN workspace_id INTEGER DEFAULT 1"))
                            conn.execute(text(f"UPDATE {table_name} SET workspace_id = 1 WHERE workspace_id IS NULL"))

            # Ensure default workspace exists
            if "workspaces" in tables:
                res1 = conn.execute(text("SELECT COUNT(*) FROM workspaces WHERE id = 1")).scalar()
                if res1 == 0:
                    logger.info("Initializing Default Workspace (ID: 1) in database.")
                    conn.execute(text(
                        "INSERT INTO workspaces (id, name, description, category, is_active, user_id, created_at, updated_at) "
                        "VALUES (1, 'Default Workspace', 'Primary knowledge workspace', 'General', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                    ))
                    conn.commit()

                # Ensure at least one workspace is active
                active_count = conn.execute(text("SELECT COUNT(*) FROM workspaces WHERE is_active = 1")).scalar()
                if active_count == 0:
                    conn.execute(text("UPDATE workspaces SET is_active = 1 WHERE id = 1"))
                    conn.commit()

            conn.commit()
    except Exception as e:
        logger.warning(f"Workspace schema auto-migration notice: {e}")


def init_db_conversations():
    """
    Ensures the conversations table is created in SQLite and migrates
    pre-existing legacy chat threads from redis_chat_store.json into SQLite.
    """
    try:
        import json
        from app.models.conversation import Conversation
        Base.metadata.create_all(bind=engine, tables=[Conversation.__table__])

        # Check if conversations table is empty and legacy redis_chat_store.json exists
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        legacy_store = os.path.join(settings.UPLOAD_DIR, "redis_chat_store.json")
        if not os.path.exists(legacy_store):
            legacy_store = os.path.join(backend_dir, "uploads", "redis_chat_store.json")

        db = SessionLocal()
        try:
            count = db.query(Conversation).count()
            if count == 0 and os.path.exists(legacy_store):
                with open(legacy_store, "r", encoding="utf-8") as f:
                    threads_data = json.load(f)
                    if isinstance(threads_data, list):
                        for item in threads_data:
                            tid = str(item.get("id") or "").strip()
                            if not tid:
                                continue
                            title = str(item.get("title") or "AI Chat Session").strip()
                            mode = str(item.get("mode") or "document")
                            selected_doc_id = str(item.get("selectedDocId") or "all")
                            msgs = item.get("messages", [])
                            ws_id = int(item.get("workspace_id") or 1)

                            conv = Conversation(
                                id=tid,
                                workspace_id=ws_id,
                                title=title,
                                mode=mode,
                                selected_doc_id=selected_doc_id,
                            )
                            conv.set_messages(msgs)
                            db.add(conv)
                        db.commit()
                        logger.info(f"Migrated {len(threads_data)} legacy chat threads into SQLite conversations table.")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Conversations schema migration notice: {e}")


def init_db_settings():
    """
    Ensures the app_settings table is created in SQLite and default settings (ID: 1)
    are seeded if not already present.
    """
    try:
        from app.models.setting import AppSetting
        Base.metadata.create_all(bind=engine, tables=[AppSetting.__table__])

        db = SessionLocal()
        try:
            current = db.query(AppSetting).filter(AppSetting.id == 1).first()
            if not current:
                logger.info("Initializing Default Settings in SQLite database (ID: 1).")
                default_setting = AppSetting(
                    id=1,
                    ai_provider="ollama",
                    ollama_base_url="http://127.0.0.1:11434",
                    ollama_model="qwen2.5:3b",
                    ollama_fallback_models="qwen2.5:7b,llama3.2:3b,mistral:7b",
                    enable_ollama_fallback=True,
                    cloud_provider="openai",
                    cloud_model="gpt-4o-mini",
                    cloud_api_key=None,
                    cloud_base_url="https://api.openai.com/v1",
                    is_offline_mode=True,
                    embedding_model="all-MiniLM-L6-v2",
                    chunk_size=500,
                    chunk_overlap=50,
                )
                db.add(default_setting)
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Settings schema initialization notice: {e}")


# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base
Base = declarative_base()

# FastAPI Dependency for db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
