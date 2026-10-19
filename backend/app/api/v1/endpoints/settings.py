import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.settings_service import settings_service

logger = logging.getLogger("app")
router = APIRouter()


class SettingsUpdateRequest(BaseModel):
    ai_provider: Optional[str] = Field(None, description="'ollama' or 'cloud'")
    ollama_base_url: Optional[str] = Field(None, description="HTTP URL of local Ollama server")
    ollama_model: Optional[str] = Field(None, description="Model identifier e.g. 'qwen2.5:3b'")
    ollama_fallback_models: Optional[str] = Field(None, description="Comma-separated fallback model names")
    enable_ollama_fallback: Optional[bool] = Field(None, description="Enable automatic sequential fallback")
    cloud_provider: Optional[str] = Field(None, description="'openai', 'anthropic', or 'custom'")
    cloud_model: Optional[str] = Field(None, description="Cloud model e.g. 'gpt-4o-mini'")
    cloud_api_key: Optional[str] = Field(None, description="Secret API key (never returned in responses)")
    cloud_base_url: Optional[str] = Field(None, description="Base URL for Cloud AI provider")
    is_offline_mode: Optional[bool] = Field(None, description="True to force 100% offline local privacy")
    chunk_size: Optional[int] = Field(None, ge=100, le=5000, description="Chunk size in characters")
    chunk_overlap: Optional[int] = Field(None, ge=0, le=1000, description="Chunk overlap in characters")


class OllamaTestRequest(BaseModel):
    base_url: Optional[str] = Field("http://127.0.0.1:11434", description="Ollama endpoint URL to test")


class CloudTestRequest(BaseModel):
    provider: Optional[str] = Field("anthropic", description="'anthropic', 'openai', or 'custom'")
    api_key: Optional[str] = Field(None, description="Optional raw API key to test; if omitted, saved key is used")
    model: Optional[str] = Field(None, description="Model identifier to probe")
    base_url: Optional[str] = Field(None, description="Custom base URL if applicable")


@router.get("", response_model=Dict[str, Any])
def get_current_settings(db: Session = Depends(get_db)):
    """
    Fetch current persistent application settings.
    Sensitive credentials like API keys are masked for security.
    """
    try:
        return settings_service.get_settings_dict(db)
    except Exception as e:
        logger.error(f"Failed to fetch settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not load application settings: {str(e)}"
        )


@router.put("", response_model=Dict[str, Any])
def update_settings(payload: SettingsUpdateRequest, db: Session = Depends(get_db)):
    """
    Update persistent application settings in SQLite.
    Validates input parameters and protects API keys from accidental exposure.
    """
    try:
        data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
        updated = settings_service.update_settings(db, data)
        return updated
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save settings: {str(e)}"
        )


@router.post("/test-ollama", response_model=Dict[str, Any])
def test_ollama_endpoint(payload: OllamaTestRequest):
    """
    Test connectivity to a local or network Ollama instance and fetch available model tags.
    """
    return settings_service.test_ollama_connection(payload.base_url or "http://127.0.0.1:11434")


@router.post("/test-cloud", response_model=Dict[str, Any])
def test_cloud_endpoint(payload: CloudTestRequest, db: Session = Depends(get_db)):
    """
    Test connectivity to a Cloud AI provider (Anthropic or OpenAI) without exposing or logging secrets.
    Rejects immediately if Offline Mode is active.
    """
    return settings_service.test_cloud_connection(
        db=db,
        provider=payload.provider,
        api_key=payload.api_key,
        model=payload.model,
        base_url=payload.base_url
    )


@router.get("/system-status", response_model=Dict[str, Any])
def get_system_diagnostics(db: Session = Depends(get_db)):
    """
    Inspect real-time health and telemetry across all system subsystems:
    FastAPI Backend, SQLite Database, ChromaDB, EasyOCR, SentenceTransformers, Ollama, and MCP.
    """
    try:
        return settings_service.get_system_status(db)
    except Exception as e:
        logger.error(f"Failed to retrieve system status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"System diagnostics query failed: {str(e)}"
        )
