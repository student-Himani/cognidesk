import os
import logging
from typing import Optional, Generator, Dict, Any
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.setting import AppSetting
from app.services.providers.base import BaseLLMProvider, LLMResponse, OfflineModeEnforcedError, CloudProviderError
from app.services.providers.ollama_provider import OllamaProvider
from app.services.providers.anthropic_provider import AnthropicProvider
from app.services.providers.openai_provider import OpenAIProvider
from app.services.providers.gemini_provider import GeminiProvider

logger = logging.getLogger("app")


class UnconfiguredHostedProvider(BaseLLMProvider):
    """
    Fallback provider when running in hosted mode without server-side or database API keys configured.
    Provides clear, informative setup instructions via structured CloudProviderError instead of returning fake success responses.
    """
    SETUP_MESSAGE = (
        "CogniDesk Hosted AI Setup Required:\n\n"
        "No hosted AI provider API key is currently configured on this server or in settings.\n\n"
        "To enable live server-side AI answers:\n"
        "1. Open your Render dashboard for this backend service and add GROQ_API_KEY (recommended, free fast tier), GEMINI_API_KEY, or OPENAI_API_KEY to Environment Variables.\n"
        "2. Alternatively, enter your custom API key in the application under Settings -> Cloud AI.\n"
        "3. Or run local Ollama (`ollama serve`) on your laptop for local offline execution."
    )

    @property
    def provider_name(self) -> str:
        return "unconfigured"

    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> LLMResponse:
        raise CloudProviderError(
            self.SETUP_MESSAGE,
            status_code=503,
            provider="unconfigured"
        )

    def stream_generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> Generator[str, None, None]:
        raise CloudProviderError(
            self.SETUP_MESSAGE,
            status_code=503,
            provider="unconfigured"
        )

    def test_connection(self) -> Dict[str, Any]:
        return {
            "connected": False,
            "message": "Hosted AI provider API key is not configured in server environment or database settings."
        }


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
    3. UnconfiguredHostedProvider fallback for cloud environments without keys.
    4. Local Ollama provider for local-first/offline desktop execution.
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
    server_provider = (settings.HOSTED_LLM_PROVIDER or os.environ.get("HOSTED_LLM_PROVIDER") or os.environ.get("AI_PROVIDER") or "").lower().strip()
    server_model = force_model or settings.HOSTED_LLM_MODEL or os.environ.get("HOSTED_LLM_MODEL")
    server_base_url = settings.HOSTED_LLM_BASE_URL or os.environ.get("HOSTED_LLM_BASE_URL")

    # Gemini server configuration
    gemini_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    if gemini_key and (server_provider in ("gemini", "google", "") or not server_provider):
        return GeminiProvider(
            api_key=gemini_key,
            model=server_model or "gemini-2.5-flash",
            base_url=server_base_url
        )

    # Groq server configuration
    groq_key = getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY")
    if groq_key and (server_provider in ("groq", "openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=groq_key,
            model=server_model or "llama-3.3-70b-versatile",
            base_url=server_base_url or "https://api.groq.com/openai/v1"
        )

    # OpenRouter server configuration
    openrouter_key = getattr(settings, "OPENROUTER_API_KEY", None) or os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key and (server_provider in ("openrouter", "openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=openrouter_key,
            model=server_model or "meta-llama/llama-3.3-70b-instruct",
            base_url=server_base_url or "https://openrouter.ai/api/v1"
        )

    # OpenAI server configuration
    openai_key = getattr(settings, "OPENAI_API_KEY", None) or os.environ.get("OPENAI_API_KEY")
    if openai_key and (server_provider in ("openai", "") or not server_provider):
        return OpenAIProvider(
            api_key=openai_key,
            model=server_model or "gpt-4o-mini",
            base_url=server_base_url or "https://api.openai.com/v1"
        )

    # Anthropic server configuration
    anthropic_key = getattr(settings, "ANTHROPIC_API_KEY", None) or os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key and (server_provider in ("anthropic", "") or not server_provider):
        return AnthropicProvider(
            api_key=anthropic_key,
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
    is_cloud = (ai_provider in ("cloud", "anthropic", "openai", "groq", "openrouter", "gemini"))
    if is_offline and is_cloud:
        raise OfflineModeEnforcedError(
            "Offline Mode is strictly enforced. Cloud AI requests are rejected with zero network calls. "
            "Switch to Online Mode in Settings to enable external AI providers."
        )

    # 4. User-Configured Custom Cloud Provider from Database Settings
    if is_cloud and cloud_api_key:
        if cloud_provider_name == "anthropic" or ai_provider == "anthropic":
            base_url = cloud_base_url if cloud_base_url and "api.anthropic.com" in cloud_base_url else "https://api.anthropic.com"
            return AnthropicProvider(
                api_key=cloud_api_key,
                model=cloud_model or "claude-3-5-sonnet-20241022",
                base_url=base_url
            )
        elif cloud_provider_name == "gemini" or ai_provider == "gemini":
            return GeminiProvider(
                api_key=cloud_api_key or gemini_key,
                model=cloud_model or "gemini-2.5-flash",
                base_url=cloud_base_url
            )
        elif cloud_provider_name == "groq" or ai_provider == "groq":
            base_url = cloud_base_url if cloud_base_url and "groq.com" in cloud_base_url else "https://api.groq.com/openai/v1"
            return OpenAIProvider(
                api_key=cloud_api_key,
                model=cloud_model or "llama-3.3-70b-versatile",
                base_url=base_url
            )
        elif cloud_provider_name == "openrouter" or ai_provider == "openrouter":
            base_url = cloud_base_url if cloud_base_url and "openrouter.ai" in cloud_base_url else "https://openrouter.ai/api/v1"
            return OpenAIProvider(
                api_key=cloud_api_key,
                model=cloud_model or "meta-llama/llama-3.3-70b-instruct",
                base_url=base_url
            )
        else:
            base_url = cloud_base_url if cloud_base_url else "https://api.openai.com/v1"
            return OpenAIProvider(
                api_key=cloud_api_key,
                model=cloud_model or "gpt-4o-mini",
                base_url=base_url
            )

    # 5. Hosted mode fallback when no cloud keys are configured
    if is_hosted:
        logger.info("Operating in hosted mode with no server or cloud AI keys configured. Returning UnconfiguredHostedProvider.")
        return UnconfiguredHostedProvider()

    # 6. Default to Local Ollama Provider for local desktop execution
    return OllamaProvider(
        base_url=ollama_base_url,
        default_model=ollama_model
    )

