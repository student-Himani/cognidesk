import json
import logging
from typing import Generator, Dict, Any, Optional, List
import httpx

from app.services.providers.base import BaseLLMProvider, LLMResponse, CloudProviderError

logger = logging.getLogger("app")


class GeminiProvider(BaseLLMProvider):
    """
    Dedicated Google Gemini Cloud AI Provider.
    Supports native Google Generative Language REST API (v1beta) with automatic model fallback,
    streaming SSE, and OpenAI-compatible endpoints.
    Never logs or leaks API keys.
    """

    DEFAULT_MODEL = "gemini-3.8-flash"
    FALLBACK_MODELS = [
        "gemini-3.8-flash",
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-3.7-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
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
        # Normalize base_url to native v1beta endpoint
        raw_url = (base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
        if "googleapis.com" in raw_url:
            # Strip subpaths like /openai or /v1 or /v1main
            self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        else:
            self.base_url = raw_url
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "gemini"

    def _sanitize_error(self, err_text: str) -> str:
        if self.api_key and self.api_key in err_text:
            return err_text.replace(self.api_key, "AIzaSy••••••••")
        return err_text

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            raise CloudProviderError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in Render environment variables or Settings.",
                status_code=401,
                provider=self.provider_name
            )
        return {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def _format_gemini_payload(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        if system:
            payload["system_instruction"] = {
                "parts": [{"text": system}]
            }
        return payload

    def _get_candidate_models(self, preferred_model: Optional[str] = None) -> List[str]:
        chosen = preferred_model or self.model
        # Strip prefixes like 'models/' if passed
        clean_chosen = chosen.replace("models/", "").strip()
        # Automatically upgrade deprecated legacy models
        if clean_chosen in ("gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-pro", "default", ""):
            clean_chosen = "gemini-3.8-flash"
        candidates = [clean_chosen]
        for fb in self.FALLBACK_MODELS:
            if fb not in candidates:
                candidates.append(fb)
        return candidates

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
        candidate_models = self._get_candidate_models(model)
        payload = self._format_gemini_payload(prompt, system, temperature, max_tokens)
        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)

        last_error: Optional[Exception] = None

        with httpx.Client(timeout=custom_timeout) as client:
            for target_model in candidate_models:
                url = f"{self.base_url}/models/{target_model}:generateContent"
                try:
                    res = client.post(url, headers=headers, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        answer_text = ""
                        finish_reason = None
                        if candidates:
                            c = candidates[0]
                            parts = c.get("content", {}).get("parts", [])
                            answer_text = "".join(p.get("text", "") for p in parts).strip()
                            finish_reason = c.get("finishReason")
                        return LLMResponse(
                            text=answer_text,
                            model=target_model,
                            provider=self.provider_name,
                            finish_reason=finish_reason,
                            raw_response=data
                        )
                    elif res.status_code == 404:
                        # Model not found on this endpoint, try next candidate model
                        err_text = self._sanitize_error(res.text.strip())
                        logger.warning(f"[GeminiProvider] Model '{target_model}' returned 404 ({err_text}), trying next model...")
                        last_error = CloudProviderError(
                            f"Gemini API Error (HTTP 404): {err_text}",
                            status_code=404,
                            provider=self.provider_name
                        )
                        continue
                    else:
                        err_msg = res.text.strip()
                        try:
                            err_json = res.json()
                            err_msg = err_json.get("error", {}).get("message", err_msg)
                        except Exception:
                            pass
                        clean_msg = self._sanitize_error(err_msg)
                        raise CloudProviderError(
                            f"Gemini API Error (HTTP {res.status_code}): {clean_msg}",
                            status_code=res.status_code,
                            provider=self.provider_name
                        )
                except (httpx.ConnectError, httpx.TimeoutException) as net_err:
                    raise CloudProviderError(
                        f"Gemini Network Error: {self._sanitize_error(str(net_err))}",
                        status_code=503,
                        provider=self.provider_name
                    )

        if last_error:
            raise last_error
        raise CloudProviderError("Gemini generation failed on all candidate models.", status_code=500, provider=self.provider_name)

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
        candidate_models = self._get_candidate_models(model)
        payload = self._format_gemini_payload(prompt, system, temperature, max_tokens)
        custom_timeout = httpx.Timeout(self.timeout, connect=15.0, read=self.timeout, write=self.timeout)

        for target_model in candidate_models:
            url = f"{self.base_url}/models/{target_model}:streamGenerateContent?alt=sse"
            try:
                with httpx.Client(timeout=custom_timeout) as client:
                    with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code == 200:
                            for line in response.iter_lines():
                                if line.startswith("data: "):
                                    data_str = line[6:].strip()
                                    if not data_str or data_str == "[DONE]":
                                        continue
                                    try:
                                        chunk = json.loads(data_str)
                                        candidates = chunk.get("candidates", [])
                                        if candidates:
                                            parts = candidates[0].get("content", {}).get("parts", [])
                                            for part in parts:
                                                txt = part.get("text", "")
                                                if txt:
                                                    yield txt
                                    except json.JSONDecodeError:
                                        pass
                            return  # Stream completed successfully
                        elif response.status_code == 404:
                            err_text = response.read().decode("utf-8", errors="replace")
                            logger.warning(f"[GeminiProvider] Stream model '{target_model}' 404, trying next candidate: {err_text}")
                            continue
                        else:
                            err_text = response.read().decode("utf-8", errors="replace")
                            try:
                                err_json = json.loads(err_text)
                                err_text = err_json.get("error", {}).get("message", err_text)
                            except Exception:
                                pass
                            clean_err = self._sanitize_error(err_text)
                            raise CloudProviderError(
                                f"Gemini API Error (HTTP {response.status_code}): {clean_err}",
                                status_code=response.status_code,
                                provider=self.provider_name
                            )
            except (httpx.ConnectError, httpx.TimeoutException) as net_err:
                raise CloudProviderError(
                    f"Gemini Stream Network Error: {self._sanitize_error(str(net_err))}",
                    status_code=503,
                    provider=self.provider_name
                )

        raise CloudProviderError("Gemini streaming failed across all candidate models.", status_code=500, provider=self.provider_name)

    def test_connection(self) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": "No Gemini API key configured. Please set GEMINI_API_KEY in Render environment variables."
            }

        headers = self._get_headers()
        try:
            with httpx.Client(timeout=10.0) as client:
                # Probe models endpoint
                res = client.get(f"{self.base_url}/models", headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    models_list = [m.get("name", "").replace("models/", "") for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
                    first_model = models_list[0] if models_list else self.model
                    return {
                        "connected": True,
                        "provider": self.provider_name,
                        "model": first_model,
                        "message": f"Successfully connected to Google Gemini API! Found {len(models_list)} supported models."
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
                        "message": f"Gemini API Error (HTTP {res.status_code}): {self._sanitize_error(err_msg)}"
                    }
        except Exception as e:
            return {
                "connected": False,
                "provider": self.provider_name,
                "model": self.model,
                "message": f"Connection error reaching Gemini API: {self._sanitize_error(str(e))}"
            }
