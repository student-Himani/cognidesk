import json
import logging
from typing import Generator, Dict, Any, Optional, List
import httpx

from app.services.providers.base import BaseLLMProvider, LLMResponse, CloudProviderError

logger = logging.getLogger("app")


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI and OpenAI-compatible Cloud AI Provider.
    Supports GPT-4o, GPT-4o-mini, o3-mini, and custom OpenAI-compatible endpoints.
    Never logs or leaks API keys.
    """

    DEFAULT_MODEL = "gpt-4o-mini"
    SUPPORTED_MODELS = [
        "gpt-4o-mini",
        "gpt-4o",
        "o3-mini",
        "gpt-4-turbo",
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
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "openai"

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise CloudProviderError(
                "OpenAI API key is not configured. Please set your API key in Settings.",
                status_code=401,
                provider=self.provider_name
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _sanitize_error(self, err_text: str) -> str:
        if self.api_key and self.api_key in err_text:
            return err_text.replace(self.api_key, "sk-••••••••")
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

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }

        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                res = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    answer_text = choices[0].get("message", {}).get("content", "").strip() if choices else ""
                    return LLMResponse(
                        text=answer_text,
                        model=target_model,
                        provider=self.provider_name,
                        finish_reason=choices[0].get("finish_reason") if choices else None,
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
                        f"OpenAI API Error (HTTP {res.status_code}): {clean_msg}",
                        status_code=res.status_code,
                        provider=self.provider_name
                    )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"OpenAI Network Error: Could not connect to {self.base_url} ({e}).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"OpenAI Timeout: Request timed out after {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )
        except CloudProviderError:
            raise
        except Exception as e:
            clean_e = self._sanitize_error(str(e))
            raise CloudProviderError(
                f"OpenAI Generation Error: {clean_e}",
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

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)
        try:
            with httpx.Client(timeout=custom_timeout) as client:
                with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code == 200:
                        for line in response.iter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                    choices = chunk.get("choices", [])
                                    if choices:
                                        delta = choices[0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content:
                                            yield content
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
                            f"OpenAI API Error (HTTP {response.status_code}): {clean_err}",
                            status_code=response.status_code,
                            provider=self.provider_name
                        )
        except httpx.ConnectError as e:
            raise CloudProviderError(
                f"OpenAI Network Error: Could not connect to {self.base_url} ({e}).",
                status_code=503,
                provider=self.provider_name
            )
        except httpx.TimeoutException:
            raise CloudProviderError(
                f"OpenAI Stream Timeout: Request exceeded {self.timeout}s.",
                status_code=504,
                provider=self.provider_name
            )

    def test_connection(self) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": "No OpenAI API key provided or configured."
            }

        headers = self._get_headers()
        try:
            with httpx.Client(timeout=6.0) as client:
                res = client.get(f"{self.base_url}/models", headers=headers)
                if res.status_code == 200:
                    return {
                        "connected": True,
                        "provider": self.provider_name,
                        "model": self.model,
                        "message": f"Successfully connected to OpenAI API ({self.model})!"
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
                        "message": f"OpenAI API Error (HTTP {res.status_code}): {self._sanitize_error(err_msg)}"
                    }
        except Exception as e:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": f"Connection error reaching OpenAI ({self.base_url}): {self._sanitize_error(str(e))}"
            }
