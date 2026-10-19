from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.core.db import Base


class AppSetting(Base):
    """
    Module 20: Persistent Settings Model for CogniDesk.
    Stores runtime configuration for AI providers, local Ollama, online/offline mode,
    chunking parameters, and diagnostics preferences.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    ai_provider = Column(String(50), nullable=False, default="ollama")  # "ollama" or "cloud"
    ollama_base_url = Column(String(255), nullable=False, default="http://127.0.0.1:11434")
    ollama_model = Column(String(100), nullable=False, default="qwen2.5:3b")
    ollama_fallback_models = Column(Text, nullable=False, default="qwen2.5:7b,llama3.2:3b,mistral:7b")
    enable_ollama_fallback = Column(Boolean, nullable=False, default=True)
    
    # Cloud AI Configuration (Optional / Online mode)
    cloud_provider = Column(String(50), nullable=False, default="openai")  # "openai", "anthropic", "custom"
    cloud_model = Column(String(100), nullable=False, default="gpt-4o-mini")
    cloud_api_key = Column(String(500), nullable=True)
    cloud_base_url = Column(String(255), nullable=True, default="https://api.openai.com/v1")
    
    # Privacy / Network mode
    is_offline_mode = Column(Boolean, nullable=False, default=True)
    
    # Embedding & Chunking Configuration Display
    embedding_model = Column(String(100), nullable=False, default="all-MiniLM-L6-v2")
    chunk_size = Column(Integer, nullable=False, default=500)
    chunk_overlap = Column(Integer, nullable=False, default=50)
    
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def mask_key(self, key: str | None) -> str | None:
        """Mask API key for secure presentation: e.g., 'sk-...abcd' or None."""
        if not key:
            return None
        stripped = key.strip()
        if len(stripped) <= 8:
            return "••••••••"
        return f"{stripped[:3]}••••••••{stripped[-4:]}"

    def to_dict(self, mask_secret: bool = True) -> dict:
        """Serialize settings to dictionary with security masking."""
        has_key = bool(self.cloud_api_key and self.cloud_api_key.strip())
        fallback_str = self.ollama_fallback_models or "qwen2.5:7b,llama3.2:3b,mistral:7b"
        fallback_list = [m.strip() for m in fallback_str.split(",") if m.strip()]
        return {
            "id": self.id,
            "ai_provider": self.ai_provider,
            "ollama_base_url": self.ollama_base_url,
            "ollama_model": self.ollama_model,
            "ollama_fallback_models": fallback_str,
            "enable_ollama_fallback": bool(self.enable_ollama_fallback),
            "fallback_models_list": fallback_list,
            "cloud_provider": self.cloud_provider,
            "cloud_model": self.cloud_model,
            "cloud_api_key": self.mask_key(self.cloud_api_key) if mask_secret else self.cloud_api_key,
            "has_api_key": has_key,
            "cloud_base_url": self.cloud_base_url or "https://api.openai.com/v1",
            "is_offline_mode": bool(self.is_offline_mode),
            "embedding_model": self.embedding_model,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<AppSetting id={self.id} provider='{self.ai_provider}' offline={self.is_offline_mode}>"
