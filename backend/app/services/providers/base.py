from abc import ABC, abstractmethod
from typing import Generator, Dict, Any, Optional, List
from pydantic import BaseModel, Field


class LLMResponse(BaseModel):
    text: str
    model: str
    provider: str
    finish_reason: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None
    fallback_occurred: bool = False
    original_model: Optional[str] = None
    fallback_reason: Optional[str] = None
    attempted_models: Optional[List[str]] = None


class OfflineModeEnforcedError(Exception):
    """Raised when an external cloud API call is attempted while Offline Mode is enforced."""
    pass


class CloudProviderError(Exception):
    """Raised when an external cloud provider returns an error."""
    def __init__(self, message: str, status_code: Optional[int] = None, provider: str = "cloud"):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


class BaseLLMProvider(ABC):
    """
    Abstract Base Class for LLM Providers in CogniDesk.
    Supports both local offline inference (Ollama) and cloud APIs (Anthropic Claude, OpenAI).
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Identifier of the provider e.g. 'ollama', 'anthropic', 'openai'."""
        pass

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> LLMResponse:
        """
        Executes non-streaming text generation.
        Returns LLMResponse containing generated text and metadata.
        """
        pass

    @abstractmethod
    def stream_generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> Generator[str, None, None]:
        """
        Executes streaming text generation.
        Yields individual token strings in real-time.
        """
        pass

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """
        Tests connectivity to the provider endpoint without leaking credentials.
        Returns a dict with {"connected": bool, "message": str, ...}.
        """
        pass
