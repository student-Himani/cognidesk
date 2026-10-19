import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.setting import AppSetting
from app.services.providers.base import BaseLLMProvider, OfflineModeEnforcedError
from app.services.providers.ollama_provider import OllamaProvider
from app.services.providers.anthropic_provider import AnthropicProvider
from app.services.providers.openai_provider import OpenAIProvider

logger = logging.getLogger("app")


def get_llm_provider(
    db: Optional[Session] = None,
    force_provider: Optional[str] = None,
    force_model: Optional[str] = None
) -> BaseLLMProvider:
    """
    Factory function to resolve and return the active LLM provider.
    Supports:
    1. Secure server-side hosted LLM providers via environment variables (OpenAI, Anthropic, Groq, OpenRouter).
    2. User-configured custom cloud providers via database settings.
    3. Local Ollama provider for local-first/offline desktop execution.
    """
    setting = None
    if db is not None:
        try:
            setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        except Exception as e:
            logger.warning(f"Could not load AppSetting from database in provider factory: {e}")

    # Determine if system is running as a hosted web deployment
    is_hosted = settings.is_hosted()

    # 1. Check for Server-Side Hosted AI Configuration (Never exposed to client)
    server_provider = (settings.HOSTED_LLM_PROVIDER or "").lower().strip()
    server_model = force_model or settings.HOSTED_LLM_MODEL
    server_base_url = settings.HOSTED_LLM_BASE_URL

    # Groq server configuration
    if settings.GROQ_API_KEY and (server_provider in ("groq", "openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=settings.GROQ_API_KEY,
            model=server_model or "llama-3.3-70b-versatile",
            base_url=server_base_url or "https://api.groq.com/openai/v1"
        )

    # OpenRouter server configuration
    if settings.OPENROUTER_API_KEY and (server_provider in ("openrouter", "openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=settings.OPENROUTER_API_KEY,
            model=server_model or "meta-llama/llama-3.3-70b-instruct",
            base_url=server_base_url or "https://openrouter.ai/api/v1"
        )

    # OpenAI server configuration
    if settings.OPENAI_API_KEY and (server_provider in ("openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            model=server_model or "gpt-4o-mini",
            base_url=server_base_url or "https://api.openai.com/v1"
        )

    # Anthropic server configuration
    if settings.ANTHROPIC_API_KEY and (server_provider in ("anthropic", "") or not server_provider):
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            model=server_model or "claude-3-5-sonnet-20241022",
            base_url=server_base_url or "https://api.anthropic.com"
        )

    # Hosted Ollama server configuration (remote Ollama daemon on server)
    if is_hosted and server_provider == "ollama" and server_base_url:
        return OllamaProvider(
            base_url=server_base_url,
            default_model=server_model or "qwen2.5:7b"
        )

    # 2. Database Setting Defaults
    is_offline = False if is_hosted else getattr(setting, "is_offline_mode", True)
    ai_provider = (force_provider or getattr(setting, "ai_provider", "ollama")).lower().strip()
    ollama_base_url = getattr(setting, "ollama_base_url", "http://127.0.0.1:11434")
    ollama_model = force_model or getattr(setting, "ollama_model", "qwen2.5:3b")

    cloud_provider_name = getattr(setting, "cloud_provider", "openai").lower().strip()
    cloud_model = force_model or getattr(setting, "cloud_model", "gpt-4o-mini")
    cloud_api_key = getattr(setting, "cloud_api_key", None)
    cloud_base_url = getattr(setting, "cloud_base_url", None)

    # 3. Enforce Offline Mode for local desktop execution
    is_cloud = (ai_provider in ("cloud", "anthropic", "openai", "groq", "openrouter"))
    if is_offline and is_cloud:
        raise OfflineModeEnforcedError(
            "Offline Mode is strictly enforced. Cloud AI requests are rejected with zero network calls. "
            "Switch to Online Mode in Settings to enable external AI providers."
        )

    # 4. User-Configured Custom Cloud Provider
    if is_cloud:
        is_anthropic = (ai_provider == "anthropic") or (ai_provider == "cloud" and cloud_provider_name == "anthropic")
        if is_anthropic:
            base_url = cloud_base_url if cloud_base_url and "api.anthropic.com" in cloud_base_url else "https://api.anthropic.com"
            return AnthropicProvider(
                api_key=cloud_api_key,
                model=cloud_model or "claude-sonnet-4-5",
                base_url=base_url
            )
        else:
            base_url = cloud_base_url if cloud_base_url and "api.openai.com" in cloud_base_url else "https://api.openai.com/v1"
            return OpenAIProvider(
                api_key=cloud_api_key,
                model=cloud_model or "gpt-4o-mini",
                base_url=base_url
            )

    # 5. Default to Local Ollama Provider
    return OllamaProvider(
        base_url=ollama_base_url,
        default_model=ollama_model
    )

