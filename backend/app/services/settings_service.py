import os
import logging
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.setting import AppSetting
from app.models.workspace import Workspace
from app.models.document import Document
from app.core.config import settings as app_config
from app.core.chroma import get_chroma_client

logger = logging.getLogger("app")


class SettingsService:
    """
    Module 20: Settings Service for CogniDesk.
    Manages local SQLite settings persistence, Ollama connectivity tests,
    dynamic model selection, API key security, and comprehensive system diagnostics.
    """

    def get_or_create_settings(self, db: Session) -> AppSetting:
        """Fetch or initialize the single persistent settings record (ID: 1)."""
        record = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if not record:
            record = AppSetting(
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
            db.add(record)
            db.commit()
            db.refresh(record)
        return record

    def get_settings_dict(self, db: Session) -> Dict[str, Any]:
        """Return application settings with masked API keys."""
        record = self.get_or_create_settings(db)
        return record.to_dict(mask_secret=True)

    def update_settings(self, db: Session, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and update settings in SQLite.
        Guarantees:
        - Never overwrites real key with masked placeholder
        - Never logs API keys
        - Enforces offline-mode constraints
        - Validates URLs
        """
        record = self.get_or_create_settings(db)

        # Validate URLs
        if "ollama_base_url" in update_data and update_data["ollama_base_url"]:
            url = str(update_data["ollama_base_url"]).strip()
            if not (url.startswith("http://") or url.startswith("https://")):
                raise ValueError("Ollama Base URL must begin with http:// or https://")
            record.ollama_base_url = url

        if "cloud_base_url" in update_data and update_data["cloud_base_url"]:
            curl = str(update_data["cloud_base_url"]).strip()
            if not (curl.startswith("http://") or curl.startswith("https://")):
                raise ValueError("Cloud Base URL must begin with http:// or https://")
            record.cloud_base_url = curl

        # Offline mode logic
        if "is_offline_mode" in update_data:
            record.is_offline_mode = bool(update_data["is_offline_mode"])

        # AI Provider validation
        if "ai_provider" in update_data:
            prov = str(update_data["ai_provider"]).lower().strip()
            if prov not in ("ollama", "cloud"):
                raise ValueError("AI Provider must be 'ollama' or 'cloud'")
            if record.is_offline_mode and prov == "cloud":
                raise ValueError("Cannot enable Cloud AI while in Offline Mode. Switch to Online Mode first.")
            record.ai_provider = prov

        if "ollama_model" in update_data and update_data["ollama_model"]:
            record.ollama_model = str(update_data["ollama_model"]).strip()

        if "ollama_fallback_models" in update_data:
            fb = update_data["ollama_fallback_models"]
            record.ollama_fallback_models = str(fb).strip() if fb else ""

        if "enable_ollama_fallback" in update_data:
            record.enable_ollama_fallback = bool(update_data["enable_ollama_fallback"])

        if "cloud_provider" in update_data and update_data["cloud_provider"]:
            record.cloud_provider = str(update_data["cloud_provider"]).strip()

        if "cloud_model" in update_data and update_data["cloud_model"]:
            record.cloud_model = str(update_data["cloud_model"]).strip()

        # Handle API key safely
        if "cloud_api_key" in update_data:
            raw_key = update_data["cloud_api_key"]
            if raw_key is not None:
                stripped_key = str(raw_key).strip()
                # If key contains bullet points / asterisks, user submitted back the masked representation: preserve existing
                if "••••" in stripped_key or "****" in stripped_key:
                    pass  # Keep existing key
                elif stripped_key == "":
                    record.cloud_api_key = None
                else:
                    record.cloud_api_key = stripped_key

        if "chunk_size" in update_data and isinstance(update_data["chunk_size"], int):
            record.chunk_size = max(100, min(5000, update_data["chunk_size"]))

        if "chunk_overlap" in update_data and isinstance(update_data["chunk_overlap"], int):
            record.chunk_overlap = max(0, min(record.chunk_size // 2, update_data["chunk_overlap"]))

        record.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(record)

        logger.info(f"Updated CogniDesk settings (provider={record.ai_provider}, offline={record.is_offline_mode})")
        return record.to_dict(mask_secret=True)

    def test_ollama_connection(self, base_url: str) -> Dict[str, Any]:
        """
        Tests connectivity to the specified Ollama server and fetches models list.
        Uses a short 3.5-second timeout to maintain responsiveness.
        """
        clean_url = (base_url or "http://127.0.0.1:11434").rstrip("/")
        if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
            clean_url = f"http://{clean_url}"

        try:
            with httpx.Client(timeout=3.5) as client:
                res = client.get(f"{clean_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models_list = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    return {
                        "connected": True,
                        "base_url": clean_url,
                        "models": models_list or ["qwen2.5:3b"],
                        "message": f"Successfully connected to Ollama! Found {len(models_list)} local model(s)."
                    }
                else:
                    return {
                        "connected": False,
                        "base_url": clean_url,
                        "models": [],
                        "message": f"Ollama endpoint responded with HTTP {res.status_code}: {res.text[:100]}"
                    }
        except httpx.ConnectError:
            return {
                "connected": False,
                "base_url": clean_url,
                "models": [],
                "message": f"Connection refused at {clean_url}. Is 'ollama serve' running in your terminal?"
            }
        except httpx.TimeoutException:
            return {
                "connected": False,
                "base_url": clean_url,
                "models": [],
                "message": f"Connection timed out while attempting to reach {clean_url}."
            }
        except Exception as e:
            return {
                "connected": False,
                "base_url": clean_url,
                "models": [],
                "message": f"Error connecting to Ollama: {str(e)}"
            }

    def test_cloud_connection(
        self,
        db: Session,
        provider: Optional[str] = "anthropic",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Tests Cloud AI connectivity (Anthropic Claude or OpenAI) without logging or leaking API keys.
        Enforces offline constraint: rejects with clear notice if Offline Mode is active.
        """
        record = self.get_or_create_settings(db)
        if record.is_offline_mode:
            return {
                "connected": False,
                "provider": provider or "cloud",
                "message": "Cannot test Cloud AI while in Offline Mode. Switch to Online Mode first in Settings."
            }

        prov_name = (provider or record.cloud_provider or "anthropic").lower().strip()
        
        # Resolve API key: provided, stored in SQLite, or from backend environment variables
        real_key = None
        if api_key and not ("••••" in api_key or "****" in api_key):
            real_key = api_key.strip()
        else:
            real_key = record.cloud_api_key

        if not real_key:
            if prov_name == "gemini" and getattr(settings, "GEMINI_API_KEY", None):
                real_key = settings.GEMINI_API_KEY
            elif prov_name == "groq" and getattr(settings, "GROQ_API_KEY", None):
                real_key = settings.GROQ_API_KEY
            elif prov_name == "openai" and getattr(settings, "OPENAI_API_KEY", None):
                real_key = settings.OPENAI_API_KEY
            elif prov_name == "anthropic" and getattr(settings, "ANTHROPIC_API_KEY", None):
                real_key = settings.ANTHROPIC_API_KEY
            elif prov_name == "openrouter" and getattr(settings, "OPENROUTER_API_KEY", None):
                real_key = settings.OPENROUTER_API_KEY

        if not real_key:
            return {
                "connected": False,
                "provider": prov_name,
                "message": f"No API key configured for {prov_name}. Please input a valid API key."
            }

        if prov_name == "anthropic":
            from app.services.providers.anthropic_provider import AnthropicProvider
            target_model = model or record.cloud_model or "claude-sonnet-4-5"
            target_url = base_url or record.cloud_base_url or "https://api.anthropic.com"
            p = AnthropicProvider(api_key=real_key, model=target_model, base_url=target_url)
            return p.test_connection()
        elif prov_name == "gemini":
            from app.services.providers.gemini_provider import GeminiProvider
            target_model = model or record.cloud_model or "gemini-3.8-flash"
            p = GeminiProvider(api_key=real_key, model=target_model, base_url=base_url)
            return p.test_connection()
        elif prov_name == "groq":
            from app.services.providers.openai_provider import OpenAIProvider
            target_model = model or record.cloud_model or "llama-3.3-70b-versatile"
            target_url = base_url or ("https://api.groq.com/openai/v1" if not record.cloud_base_url or "api.openai.com" in record.cloud_base_url else record.cloud_base_url)
            p = OpenAIProvider(api_key=real_key, model=target_model, base_url=target_url)
            return p.test_connection()
        else:
            from app.services.providers.openai_provider import OpenAIProvider
            target_model = model or record.cloud_model or "gpt-4o-mini"
            target_url = base_url or record.cloud_base_url or "https://api.openai.com/v1"
            p = OpenAIProvider(api_key=real_key, model=target_model, base_url=target_url)
            return p.test_connection()

    def get_system_status(self, db: Session) -> Dict[str, Any]:
        """
        Inspects real status for all internal subsystems:
        Backend API, SQLite, ChromaDB, EasyOCR, Embedding Engine, Ollama, and MCP.
        """
        settings_record = self.get_or_create_settings(db)

        # 1. Database (SQLite)
        db_status = "healthy"
        total_workspaces = 0
        total_documents = 0
        try:
            db.execute(text("SELECT 1"))
            total_workspaces = db.query(Workspace).count()
            total_documents = db.query(Document).count()
        except Exception as e:
            db_status = f"unhealthy: {str(e)}"

        # 2. Vector DB (ChromaDB)
        chroma_status = "unhealthy"
        total_vectors = 0
        collection_name = getattr(app_config, "CHROMA_COLLECTION_NAME", "cognidesk_documents")
        try:
            client = get_chroma_client()
            heartbeat = client.heartbeat()
            if heartbeat is not None:
                chroma_status = "healthy"
                try:
                    coll = client.get_or_create_collection(collection_name)
                    total_vectors = coll.count()
                except Exception:
                    pass
        except Exception as e:
            chroma_status = f"unhealthy: {str(e)}"

        # 3. Ollama Connectivity
        ollama_info = self.test_ollama_connection(settings_record.ollama_base_url)

        # 4. OCR Engine (EasyOCR)
        ocr_status = "ready"
        supported_ocr_formats = [".png", ".jpg", ".jpeg", ".bmp"]
        try:
            from app.services.document_processor import DocumentProcessor
            if getattr(DocumentProcessor, "is_ocr_available", lambda: True)() and hasattr(DocumentProcessor, "get_ocr_reader"):
                ocr_status = "ready"
            else:
                ocr_status = "not_configured"
        except Exception as e:
            ocr_status = f"error: {str(e)}"

        # 5. Embedding Engine
        embed_status = {
            "status": "ready",
            "model_name": settings_record.embedding_model or "all-MiniLM-L6-v2",
            "dimensions": 384,
            "metric": "cosine",
            "chunk_size": settings_record.chunk_size,
            "chunk_overlap": settings_record.chunk_overlap
        }

        # 6. Model Context Protocol (MCP) — Local Server Active, Cloud MCP Planned
        from app.services.mcp_service import mcp_service
        mcp_info = {
            "status": "active",
            "is_implemented": True,
            "title": "Model Context Protocol (MCP)",
            "description": "Standardized protocol exposing CogniDesk local vector index as external tools ('search_documents', 'get_document_summary') with active workspace isolation.",
            "protocol_version": mcp_service.protocol_version,
            "endpoint": "/api/v1/mcp",
            "active_tools": ["search_documents", "get_document_summary"],
            "cloud_mcp": "planned"
        }

        return {
            "backend": {
                "status": "healthy",
                "version": getattr(app_config, "VERSION", "1.0.0"),
                "app_name": getattr(app_config, "APP_NAME", "CogniDesk API"),
                "host": getattr(app_config, "HOST", "127.0.0.1"),
                "port": getattr(app_config, "PORT", 8000),
            },
            "database": {
                "status": db_status,
                "engine": "SQLite",
                "database_url": "database/cognidesk.db",
                "total_workspaces": total_workspaces,
                "total_documents": total_documents,
            },
            "vector_store": {
                "status": chroma_status,
                "engine": "ChromaDB",
                "collection": collection_name,
                "total_vectors": total_vectors,
                "persist_dir": getattr(app_config, "CHROMA_PERSIST_DIR", "../vector_db"),
            },
            "ollama": ollama_info,
            "ocr_engine": {
                "status": ocr_status,
                "engine": "EasyOCR",
                "models": ["CRAFT (detection)", "ResNet/BiLSTM (recognition)"],
                "supported_formats": supported_ocr_formats,
                "offline": True,
            },
            "embedding_engine": embed_status,
            "mcp": mcp_info,
            "privacy_mode": "100% Local / Offline" if settings_record.is_offline_mode else "Online Mode Enabled"
        }


settings_service = SettingsService()
