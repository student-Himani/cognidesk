import json
import logging
from typing import Generator, Dict, Any, Optional, List
import httpx

from app.services.providers.base import BaseLLMProvider, LLMResponse, CloudProviderError

logger = logging.getLogger("app")


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic Claude Cloud AI Provider.
    Supports Claude Sonnet 4.5, Claude 3.7 Sonnet, Claude 3.5 Sonnet, and Claude 3.5 Haiku.
    Strictly requires Online Mode. Never logs or leaks API keys.
    """

    DEFAULT_MODEL = "claude-sonnet-4-5"
    SUPPORTED_MODELS = [
        "claude-sonnet-4-5",
        "claude-3-7-sonnet-latest",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-latest",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-latest",
        "claude-3-5-haiku-20241022",
    ]

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 120.0
    ):
        self.api_key = (api_key or "").strip()
        self.model = model or self.DEFAULT_MODEL
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "anthropic"

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise CloudProviderError(
                "Anthropic API key is not configured. Please set your Anthropic API key in Settings.",
                status_code=401,
                provider=self.provider_name
            )
        return {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

    def _sanitize_error(self, err_text: str) -> str:
        """Strip raw API key if somehow echoed back in error strings."""
        if self.api_key and self.api_key in err_text:
            return err_text.replace(self.api_key, "sk-ant-••••••••")
        return err_text

    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        **kwargs
    ) -> LLMResponse:
        headers = self._get_headers()
        target_model = model or self.model

        payload: Dict[str, Any] = {
            "model": target_model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if system:
            payload["system"] = system

        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                res = client.post(f"{self.base_url}/v1/messages", headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    content_blocks = data.get("content", [])
                    answer_text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text").strip()
                    return LLMResponse(
                        text=answer_text,
                        model=target_model,
                        provider=self.provider_name,
                        finish_reason=data.get("stop_reason"),
                        raw_response=data
                    )
                else:
                    err_msg = res.text.strip()
                    try:
                        err_json = res.json()
                        err_msg = err_json.get("error", {}).get("message", err_msg)
                    except Exception:
                        pass
                    clean_msg = self._sanitize_error(err_msg)
                    raise CloudProviderError(
                        f"Anthropic API Error (HTTP {res.status_code}): {clean_msg}",
                        status_code=res.status_code,
                        provider=self.provider_name
                    )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"Anthropic Network Error: Could not connect to {self.base_url} ({e}).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"Anthropic Timeout: Cloud API request timed out after {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )
        except CloudProviderError:
            raise
        except Exception as e:
            clean_e = self._sanitize_error(str(e))
            raise CloudProviderError(
                f"Anthropic Generation Error: {clean_e}",
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
        headers = self._get_headers()
        target_model = model or self.model

        payload: Dict[str, Any] = {
            "model": target_model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "stream": True,
        }
        if system:
            payload["system"] = system

        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                with client.stream("POST", f"{self.base_url}/v1/messages", headers=headers, json=payload) as response:
                    if response.status_code == 200:
                        for line in response.iter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if not data_str:
                                    continue
                                try:
                                    event = json.loads(data_str)
                                    ev_type = event.get("type")
                                    if ev_type == "content_block_delta":
                                        delta = event.get("delta", {})
                                        if delta.get("type") == "text_delta":
                                            text_chunk = delta.get("text", "")
                                            if text_chunk:
                                                yield text_chunk
                                    elif ev_type == "error":
                                        err_obj = event.get("error", {})
                                        err_msg = err_obj.get("message", "Unknown Anthropic stream error")
                                        raise CloudProviderError(
                                            f"Anthropic Stream Error: {self._sanitize_error(err_msg)}",
                                            status_code=500,
                                            provider=self.provider_name
                                        )
                                except json.JSONDecodeError:
                                    pass
                    else:
                        err_text = response.read().decode("utf-8", errors="replace")
                        try:
                            err_json = json.loads(err_text)
                            err_text = err_json.get("error", {}).get("message", err_text)
                        except Exception:
                            pass
                        clean_err = self._sanitize_error(err_text)
                        raise CloudProviderError(
                            f"Anthropic API Error (HTTP {response.status_code}): {clean_err}",
                            status_code=response.status_code,
                            provider=self.provider_name
                        )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"Anthropic Network Error: Could not connect to {self.base_url} ({e}).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"Anthropic Stream Timeout: Request exceeded {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )

    def test_connection(self) -> Dict[str, Any]:
        """
        Validates API key and connectivity with a lightweight ping without streaming.
        Never logs or exposes the key.
        """
        if not self.api_key:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": "No Anthropic API key provided or configured."
            }

        headers = self._get_headers()
        payload = {
            "model": self.model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "ping"}]
        }
        try:
            with httpx.Client(timeout=6.0) as client:
                res = client.post(f"{self.base_url}/v1/messages", headers=headers, json=payload)
                if res.status_code == 200:
                    return {
                        "connected": True,
                        "provider": self.provider_name,
                        "model": self.model,
                        "message": f"Successfully connected to Anthropic Claude ({self.model})!"
                    }
                else:
                    err_msg = res.text.strip()
                    try:
                        err_json = res.json()
                        err_msg = err_json.get("error", {}).get("message", err_msg)
                    except Exception:
                        pass
                    return {
                        "connected": False,
                        "provider": self.provider_name,
                        "model": self.model,
                        "message": f"Anthropic API Error (HTTP {res.status_code}): {self._sanitize_error(err_msg)}"
                    }
        except Exception as e:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": f"Connection error reaching Anthropic ({self.base_url}): {self._sanitize_error(str(e))}"
            }
