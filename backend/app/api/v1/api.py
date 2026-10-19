from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, documents, embeddings, vector_db, search, rag, chat, notes, flashcards, workspaces, settings, mcp

api_router = APIRouter()

# Include routers
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & Guest Mode"])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])
api_router.include_router(mcp.router, prefix="/mcp", tags=["Model Context Protocol (MCP)"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(embeddings.router, prefix="/embeddings", tags=["Embeddings"])
api_router.include_router(vector_db.router, prefix="/vector-db", tags=["Vector Database"])
api_router.include_router(search.router, prefix="/search", tags=["Search"])
api_router.include_router(rag.router, prefix="/rag", tags=["RAG Pipeline"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat History"])
api_router.include_router(notes.router, prefix="/notes", tags=["Notes"])
api_router.include_router(flashcards.router, prefix="/flashcards", tags=["Flashcards"])


