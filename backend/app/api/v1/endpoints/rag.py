import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.models.document import Document
from app.services.rag_service import rag_service
from app.services.providers import OfflineModeEnforcedError
from app.models.setting import AppSetting

logger = logging.getLogger("app")

router = APIRouter()


class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="User query text for RAG pipeline")
    mode: Optional[str] = Field(default="document", description="'normal' for general LLM chat without RAG, 'document' for Document RAG chat")
    model: Optional[str] = Field(default=None, description="Local Ollama model name (e.g. qwen2.5:7b)")
    top_k: int = Field(default=5, ge=1, le=100, description="Top K context chunks to retrieve")
    filetype: Optional[str] = Field(default=None, description="Filter document search by file extension")
    document_ids: Optional[List[int]] = Field(default=None, description="Filter document search by document IDs")
    system_prompt: Optional[str] = Field(default=None, description="Custom system prompt override")
    messages: Optional[List[Dict[str, Any]]] = Field(default=None, description="Recent conversation history messages for context")


@router.post("/query", status_code=status.HTTP_200_OK)
def query_rag_pipeline(
    payload: RAGQueryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Module 09 / Module 24 / Module 27 / Module 28: Full RAG Pipeline non-streaming endpoint with user isolation.
    """
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    # Enforce document/workspace isolation
    if payload.document_ids:
        docs = db.query(Document).filter(Document.id.in_(payload.document_ids)).all()
        for doc in docs:
            if doc.workspace_id:
                verify_workspace_access(doc.workspace_id, current_user, db)

    try:
        result = rag_service.generate_response(
            db=db,
            query=payload.query,
            mode=payload.mode,
            model=payload.model,
            top_k=payload.top_k,
            filetype=payload.filetype,
            document_ids=payload.document_ids,
            system_prompt=payload.system_prompt,
            messages=payload.messages
        )
        return {
            "success": True,
            "message": "RAG pipeline response generated successfully.",
            "data": result
        }
    except OfflineModeEnforcedError as ome:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ome)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG pipeline query: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute RAG pipeline: {str(e)}"
        )


@router.post("/stream", status_code=status.HTTP_200_OK)
def stream_rag_pipeline(
    payload: RAGQueryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Module 09 / Module 24 / Module 27 / Module 28: Streaming RAG Pipeline endpoint (Server-Sent Events) with user isolation.
    """
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    # Enforce document/workspace isolation
    if payload.document_ids:
        docs = db.query(Document).filter(Document.id.in_(payload.document_ids)).all()
        for doc in docs:
            if doc.workspace_id:
                verify_workspace_access(doc.workspace_id, current_user, db)

    # Upfront check: if Cloud AI is configured but offline mode is active, reject immediately
    setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
    if setting and setting.is_offline_mode and setting.ai_provider == "cloud":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offline Mode is strictly enforced. Cloud AI requests are rejected with zero network calls."
        )

    try:
        generator = rag_service.generate_streaming_response(
            db=db,
            query=payload.query,
            mode=payload.mode,
            model=payload.model,
            top_k=payload.top_k,
            filetype=payload.filetype,
            document_ids=payload.document_ids,
            system_prompt=payload.system_prompt,
            messages=payload.messages
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    except OfflineModeEnforcedError as ome:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ome)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting RAG streaming: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start RAG stream: {str(e)}"
        )


@router.get("/status", status_code=status.HTTP_200_OK)
def get_ollama_status(db: Session = Depends(get_db)):
    """
    Checks local Ollama service connection status, returns installed models,
    and includes active provider telemetry.
    """
    try:
        status_info = rag_service.check_ollama_status(db=db)
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if setting:
            status_info["active_provider"] = setting.ai_provider
            status_info["cloud_provider"] = setting.cloud_provider
            status_info["cloud_model"] = setting.cloud_model
            status_info["is_offline_mode"] = bool(setting.is_offline_mode)
        return {
            "success": True,
            "message": "Ollama service status retrieved.",
            "data": status_info
        }
    except Exception as e:
        logger.error(f"Error checking Ollama status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check Ollama status: {str(e)}"
        )


@router.post("/context", status_code=status.HTTP_200_OK)
def get_rag_context(
    payload: RAGQueryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Module 09: RAG Context Preview endpoint with user isolation.
    """
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    if payload.document_ids:
        docs = db.query(Document).filter(Document.id.in_(payload.document_ids)).all()
        for doc in docs:
            if doc.workspace_id:
                verify_workspace_access(doc.workspace_id, current_user, db)

    try:
        context_info = rag_service.get_context_only(
            db=db,
            query=payload.query,
            top_k=payload.top_k,
            filetype=payload.filetype,
            document_ids=payload.document_ids,
            system_prompt=payload.system_prompt
        )
        return {
            "success": True,
            "message": "RAG context and prompt retrieved successfully.",
            "data": context_info
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting RAG context: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve RAG context: {str(e)}"
        )
