import sys
import json
import uuid
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
import httpx
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal, Base, engine
from app.models.setting import AppSetting
from app.models.document import Document
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.providers import (
    BaseLLMProvider,
    LLMResponse,
    OllamaProvider,
    AnthropicProvider,
    OpenAIProvider,
    OfflineModeEnforcedError,
    CloudProviderError,
    get_llm_provider,
)
from app.services.rag_service import rag_service


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_db_settings():
    """Ensure database has clean default Ollama settings before and after each test."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if not setting:
            setting = AppSetting(id=1)
            db.add(setting)
        setting.ai_provider = "ollama"
        setting.ollama_base_url = "http://127.0.0.1:11434"
        setting.ollama_model = "qwen2.5:3b"
        setting.cloud_provider = "anthropic"
        setting.cloud_model = "claude-sonnet-4-5"
        setting.cloud_api_key = None
        setting.cloud_base_url = "https://api.anthropic.com"
        setting.is_offline_mode = True
        db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if setting:
            setting.ai_provider = "ollama"
            setting.is_offline_mode = True
            setting.cloud_api_key = None
            db.commit()
    finally:
        db.close()


# 1. Test AnthropicProvider Non-Streaming (Claude Sonnet 4.5)
def test_anthropic_provider_non_streaming():
    provider = AnthropicProvider(
        api_key="sk-ant-mock-key-12345",
        model="claude-sonnet-4-5"
    )

    mock_resp_data = {
        "content": [{"type": "text", "text": "Anthropic Claude Sonnet 4.5 response."}],
        "model": "claude-sonnet-4-5",
        "stop_reason": "end_turn"
    }

    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = mock_resp_data

    with patch("app.services.providers.anthropic_provider.httpx.Client.post", return_value=mock_response) as mock_post:
        result = provider.generate(
            prompt="Hello Claude",
            system="You are a helpful assistant"
        )
        assert result.text == "Anthropic Claude Sonnet 4.5 response."
        assert result.model == "claude-sonnet-4-5"
        assert result.provider == "anthropic"

        called_args, called_kwargs = mock_post.call_args
        assert "x-api-key" in called_kwargs["headers"]
        assert called_kwargs["headers"]["x-api-key"] == "sk-ant-mock-key-12345"
        assert called_kwargs["headers"]["anthropic-version"] == "2023-06-01"
        assert called_kwargs["json"]["model"] == "claude-sonnet-4-5"
        assert called_kwargs["json"]["messages"][0]["content"] == "Hello Claude"


# 2. Test AnthropicProvider Streaming
def test_anthropic_provider_streaming():
    provider = AnthropicProvider(
        api_key="sk-ant-mock-key-12345",
        model="claude-sonnet-4-5"
    )

    sse_lines = [
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hello "}}\n',
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "from "}}\n',
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Sonnet 4.5!"}}\n',
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.iter_lines.return_value = sse_lines

    stream_ctx = MagicMock()
    stream_ctx.__enter__.return_value = mock_response
    stream_ctx.__exit__.return_value = False

    with patch("app.services.providers.anthropic_provider.httpx.Client.stream", return_value=stream_ctx):
        tokens = list(provider.stream_generate(prompt="Stream test"))
        assert tokens == ["Hello ", "from ", "Sonnet 4.5!"]


# 3. Test Offline Mode Strict Rejection
def test_offline_mode_rejects_cloud_requests(client):
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        setting.is_offline_mode = True
        setting.ai_provider = "cloud"
        db.commit()
    finally:
        db.close()

    # Non-streaming RAG query must be rejected with HTTP 400
    res_query = client.post("/api/v1/rag/query", json={"query": "Test query offline"})
    assert res_query.status_code == 400
    err_detail = res_query.json().get("detail") or res_query.json().get("error", {}).get("message", "")
    assert "offline" in err_detail.lower()

    # Streaming RAG query must be rejected with HTTP 400
    res_stream = client.post("/api/v1/rag/stream", json={"query": "Test stream offline"})
    assert res_stream.status_code == 400
    stream_err = res_stream.json().get("detail") or res_stream.json().get("error", {}).get("message", "")
    assert "offline" in stream_err.lower()


# 4. Test Online Mode Allows Cloud AI with ChromaDB Citations
def test_online_mode_cloud_rag_and_citations(client):
    db = SessionLocal()
    unique_fn = f"cloud_test_doc_{uuid.uuid4().hex[:8]}.txt"
    doc = Document(
        filename=unique_fn,
        original_filename="cloud_knowledge.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=300,
        status="processed",
        extracted_text="CogniDesk supports Anthropic Claude Sonnet 4.5 in Online Mode with full document citations.",
        cleaned_text="CogniDesk supports Anthropic Claude Sonnet 4.5 in Online Mode with full document citations."
    )
    db.add(doc)

    setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
    setting.is_offline_mode = False
    setting.ai_provider = "cloud"
    setting.cloud_provider = "anthropic"
    setting.cloud_model = "claude-sonnet-4-5"
    setting.cloud_api_key = "sk-ant-test-key-mock"
    db.commit()
    db.refresh(doc)
    db.close()

    try:
        db = SessionLocal()
        embedding_engine.process_document_embedding(db, doc.id)
        vector_storage.store_document_vectors(db, doc.id)
        db.close()

        # Mock Anthropic non-streaming response at provider level
        mock_llm_response = LLMResponse(
            text="According to the document, CogniDesk supports Anthropic Claude Sonnet 4.5.",
            model="claude-sonnet-4-5",
            provider="anthropic"
        )

        with patch.object(AnthropicProvider, "generate", return_value=mock_llm_response):
            res = client.post("/api/v1/rag/query", json={
                "query": "Does CogniDesk support Sonnet 4.5?",
                "top_k": 3
            })
            assert res.status_code == 200
            data = res.json()["data"]
            assert "According to the document, CogniDesk supports Anthropic Claude Sonnet 4.5." in data["answer"]
            assert data["model"] == "claude-sonnet-4-5"
            assert data["provider"] == "anthropic"
            assert isinstance(data["citations"], list)
            assert data["context_used_count"] > 0

    finally:
        vector_storage.delete_document_vectors(doc.id)
        db = SessionLocal()
        del_doc = db.query(Document).filter(Document.id == doc.id).first()
        if del_doc:
            db.delete(del_doc)
            db.commit()
        db.close()


# 5. Test API Key Masking and Protection
def test_api_key_security_and_masking(client):
    # Enable online mode first so cloud key updates are accepted
    client.put("/api/v1/settings", json={"is_offline_mode": False, "ai_provider": "cloud"})

    secret_key = "sk-ant-api03-my-real-secret-token-7777"
    update_res = client.put("/api/v1/settings", json={
        "cloud_api_key": secret_key,
        "cloud_provider": "anthropic",
        "cloud_model": "claude-sonnet-4-5"
    })
    assert update_res.status_code == 200

    # Never expose raw key in response
    assert secret_key not in update_res.text
    masked_key = update_res.json()["cloud_api_key"]
    assert "••••" in masked_key
    assert update_res.json()["has_api_key"] is True

    # Subsequent GET must also mask key
    get_res = client.get("/api/v1/settings")
    assert secret_key not in get_res.text
    assert "••••" in get_res.json()["cloud_api_key"]

    # Resubmitting masked key preserves stored secret in SQLite
    client.put("/api/v1/settings", json={"cloud_api_key": masked_key, "chunk_size": 550})
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        assert setting.cloud_api_key == secret_key
    finally:
        db.close()


# 6. Test Real Cloud API Errors Surfaced Without Fake Fallbacks
def test_cloud_api_error_surfaced_no_fake_answers():
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        setting.is_offline_mode = False
        setting.ai_provider = "cloud"
        setting.cloud_provider = "anthropic"
        setting.cloud_model = "claude-sonnet-4-5"
        setting.cloud_api_key = "sk-ant-invalid-key"
        db.commit()

        mock_err_response = MagicMock(spec=httpx.Response)
        mock_err_response.status_code = 401
        mock_err_response.text = '{"error": {"type": "authentication_error", "message": "invalid x-api-key"}}'
        mock_err_response.json.return_value = {"error": {"type": "authentication_error", "message": "invalid x-api-key"}}

        with patch("app.services.providers.anthropic_provider.httpx.Client.post", return_value=mock_err_response):
            rag_res = rag_service.generate_response(
                db=db,
                query="What is quantum mechanics?",
                mode="normal"
            )
            # Must show REAL error code and message, NEVER a hallucinated or fake response
            assert "Anthropic API Error (HTTP 401)" in rag_res["answer"]
            assert "invalid x-api-key" in rag_res["answer"]
            assert rag_res["ollama_online"] is False
    finally:
        db.close()


# 7. Test Cloud Connection Probe Endpoint
def test_test_cloud_connection_endpoint(client):
    # 1. When offline, probe must reject with offline message
    client.put("/api/v1/settings", json={"is_offline_mode": True})
    res_offline = client.post("/api/v1/settings/test-cloud", json={"provider": "anthropic"})
    assert res_offline.status_code == 200
    assert res_offline.json()["connected"] is False
    assert "Offline Mode" in res_offline.json()["message"]

    # 2. When online, probe with successful mock at provider level
    client.put("/api/v1/settings", json={"is_offline_mode": False})
    mock_probe_result = {
        "connected": True,
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
        "message": "Successfully connected to Anthropic Claude (claude-sonnet-4-5)!"
    }

    with patch.object(AnthropicProvider, "test_connection", return_value=mock_probe_result):
        res_online = client.post("/api/v1/settings/test-cloud", json={
            "provider": "anthropic",
            "api_key": "sk-ant-test-probe",
            "model": "claude-sonnet-4-5"
        })
        assert res_online.status_code == 200
        assert res_online.json()["connected"] is True
        assert "Successfully connected" in res_online.json()["message"]


# 8. Test Provider Switching Back to Local Ollama
def test_provider_switching_back_to_ollama(client):
    # Enable Cloud AI
    client.put("/api/v1/settings", json={
        "is_offline_mode": False,
        "ai_provider": "cloud",
        "cloud_provider": "anthropic",
        "cloud_model": "claude-sonnet-4-5"
    })

    db = SessionLocal()
    prov_cloud = get_llm_provider(db=db)
    assert prov_cloud.provider_name == "anthropic"
    db.close()

    # Switch back to Ollama and enforce Offline Mode
    client.put("/api/v1/settings", json={
        "is_offline_mode": True,
        "ai_provider": "ollama",
        "ollama_model": "qwen2.5:3b"
    })

    db = SessionLocal()
    prov_ollama = get_llm_provider(db=db)
    assert prov_ollama.provider_name == "ollama"
    assert isinstance(prov_ollama, OllamaProvider)
    db.close()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
