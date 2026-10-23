import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.db import engine, Base, init_db
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
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan handler: executes startup and shutdown tasks
    after Uvicorn opens the port, ensuring immediate port binding on cloud hosts.
    """
    logger.info("CogniDesk FastAPI server initializing...")
    try:
        init_db()
        logger.info("CogniDesk startup checks passed; ready to serve requests.")
    except Exception as e:
        logger.error(f"Non-fatal error during startup initialization: {e}", exc_info=True)
    yield
    logger.info("CogniDesk FastAPI server shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="CogniDesk Offline AI Workspace Backend API",
    lifespan=lifespan,
)

# 2. Register global exception handlers
add_exception_handlers(app)

# CORS Middleware setup with hosted domain support
cors_origins = settings.get_cors_origins() + ["null"]
origin_regex = (
    r"https?://.*"
    if getattr(settings, "CORS_ALLOW_ALL", False)
    else r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|https://cognidesk\.pages\.dev|https://[a-zA-Z0-9-]+\.pages\.dev|file://.*|vscode-file://.*)"
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
    import os
    gemini_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    available_gemini_models = []
    gemini_probe_error = None
    if gemini_key:
        try:
            import httpx
            with httpx.Client(timeout=5.0) as client:
                res = client.get("https://generativelanguage.googleapis.com/v1beta/models", headers={"x-goog-api-key": gemini_key})
                if res.status_code == 200:
                    data = res.json()
                    available_gemini_models = [m.get("name", "").replace("models/", "") for m in data.get("models", [])]
                else:
                    gemini_probe_error = f"HTTP {res.status_code}: {res.text[:200]}"
        except Exception as e:
            gemini_probe_error = str(e)

    return {
        "message": "Welcome to CogniDesk API",
        "version": settings.VERSION,
        "status": "online",
        "release": "2026.10-gemini-probe",
        "docs_url": "/docs",
        "gemini_models": available_gemini_models,
        "gemini_probe_error": gemini_probe_error,
        "has_gemini_key": bool(gemini_key),
        "has_groq_key": bool(getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY")),
        "has_openai_key": bool(getattr(settings, "OPENAI_API_KEY", None) or os.environ.get("OPENAI_API_KEY")),
    }

@app.get("/health")
def read_health(db = None):
    from app.api.v1.endpoints.health import health_check
    from app.core.db import SessionLocal
    with SessionLocal() as db_session:
        return health_check(db=db_session)
