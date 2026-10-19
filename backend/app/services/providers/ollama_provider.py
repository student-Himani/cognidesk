import json
import logging
from typing import Generator, Dict, Any, Optional, List
import httpx

from app.services.providers.base import BaseLLMProvider, LLMResponse, CloudProviderError
from app.core.config import settings

logger = logging.getLogger("app")


class OllamaProvider(BaseLLMProvider):
    """
    Local Ollama LLM Provider.
    Zero external internet dependency; operates strictly on local host/daemon.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout: float = 300.0
    ):
        self.base_url = (base_url or getattr(settings, "OLLAMA_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
        self.default_model = default_model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "ollama"

    def _resolve_model(self, requested_model: Optional[str] = None) -> str:
        """Resolve model, falling back to first installed model if requested model isn't installed."""
        target_model = requested_model or self.default_model
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models = [m.get("name") for m in res.json().get("models", []) if m.get("name")]
                    if models and target_model not in models:
                        logger.info(f"Ollama model '{target_model}' not installed. Falling back to '{models[0]}'.")
                        return models[0]
        except Exception:
            pass
        return target_model

    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> LLMResponse:
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "prompt": prompt,
            "system": system or "",
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": 8192
            }
        }
        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                res = client.post(f"{self.base_url}/api/generate", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    answer_text = data.get("response", "").strip()
                    return LLMResponse(
                        text=answer_text,
                        model=resolved_model,
                        provider=self.provider_name,
                        raw_response=data
                    )
                else:
                    err_msg = res.text.strip()
                    try:
                        err_msg = res.json().get("error", err_msg)
                    except Exception:
                        pass
                    raise CloudProviderError(
                        f"Ollama Error (HTTP {res.status_code}): {err_msg}",
                        status_code=res.status_code,
                        provider=self.provider_name
                    )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"Ollama Connection Error: Could not connect to local Ollama daemon at {self.base_url} ({e}). Please ensure Ollama is running (`ollama serve`).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"Ollama Timeout: Local inference at {self.base_url} timed out after {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )
        except CloudProviderError:
            raise
        except Exception as e:
            raise CloudProviderError(
                f"Ollama Generation Error: {str(e)}",
                status_code=500,
                provider=self.provider_name
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
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "prompt": prompt,
            "system": system or "",
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": 8192
            }
        }
        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                with client.stream("POST", f"{self.base_url}/api/generate", json=payload) as response:
                    if response.status_code == 200:
                        for line in response.iter_lines():
                            if line.strip():
                                try:
                                    json_chunk = json.loads(line)
                                    token = json_chunk.get("response", "")
                                    if token:
                                        yield token
                                except Exception:
                                    pass
                    else:
                        err_text = response.read().decode("utf-8", errors="replace")
                        raise CloudProviderError(
                            f"Ollama Error (HTTP {response.status_code}): {err_text}",
                            status_code=response.status_code,
                            provider=self.provider_name
                        )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"Ollama Connection Error: Could not reach {self.base_url} ({e}).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"Ollama Stream Timeout: inference exceeded {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )

    def test_connection(self) -> Dict[str, Any]:
        try:
            with httpx.Client(timeout=3.5) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models_list = [m.get("name") for m in res.json().get("models", []) if m.get("name")]
                    return {
                        "connected": True,
                        "provider": self.provider_name,
                        "base_url": self.base_url,
                        "models": models_list or [self.default_model],
                        "message": f"Successfully connected to Ollama! Found {len(models_list)} model(s)."
                    }
                return {
                    "connected": False,
                    "provider": self.provider_name,
                    "base_url": self.base_url,
                    "models": [],
                    "message": f"Ollama returned HTTP {res.status_code}: {res.text[:100]}"
                }
        except Exception as e:
            return {
                "connected": False,
                "provider": self.provider_name,
                "base_url": self.base_url,
                "models": [],
                "message": f"Error connecting to Ollama at {self.base_url}: {str(e)}"
            }
