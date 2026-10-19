from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.db import engine, Base, init_db_users, init_db_workspaces, init_db_conversations, init_db_settings
from app.core.errors import add_exception_handlers
from app.api.v1.api import api_router
from app.models.user import User
from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.search_history import SearchHistory
from app.models.note import Note
from app.models.flashcard import FlashcardDeck, Flashcard
from app.models.conversation import Conversation
from app.models.setting import AppSetting

# 1. Initialize logger configurations
setup_logging()

# 2. Initialize database tables on startup
Base.metadata.create_all(bind=engine)
init_db_users()
init_db_workspaces()
init_db_conversations()
init_db_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="CogniDesk Offline AI Workspace Backend API",
)

# 3. Register global exception handlers
add_exception_handlers(app)

# CORS Middleware setup with hosted domain support
cors_origins = settings.get_cors_origins() + ["null"]
origin_regex = (
    r"https?://.*"
    if getattr(settings, "CORS_ALLOW_ALL", False)
    else r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|file://.*|vscode-file://.*)"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Include API Routers
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {
        "message": "Welcome to CogniDesk API",
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs"
    }

@app.get("/health")
def read_health(db = None):
    from app.api.v1.endpoints.health import health_check
    from app.core.db import SessionLocal
    with SessionLocal() as db_session:
        return health_check(db=db_session)
