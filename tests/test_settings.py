import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal
from app.models.setting import AppSetting


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def reset_settings():
    """Ensure database has standard default settings before and after tests."""
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if not setting:
            setting = AppSetting(id=1)
            db.add(setting)
        setting.ai_provider = "ollama"
        setting.ollama_base_url = "http://127.0.0.1:11434"
        setting.ollama_model = "qwen2.5:3b"
        setting.cloud_provider = "openai"
        setting.cloud_model = "gpt-4o-mini"
        setting.cloud_api_key = None
        setting.is_offline_mode = True
        setting.chunk_size = 500
        setting.chunk_overlap = 50
        db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        if setting:
            setting.ai_provider = "ollama"
            setting.ollama_base_url = "http://127.0.0.1:11434"
            setting.is_offline_mode = True
            setting.cloud_api_key = None
            db.commit()
    finally:
        db.close()


def test_get_settings_default(client, reset_settings):
    """Verify GET /api/v1/settings returns seeded defaults with offline mode enabled."""
    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["ai_provider"] == "ollama"
    assert data["ollama_base_url"] == "http://127.0.0.1:11434"
    assert data["is_offline_mode"] is True
    assert data["embedding_model"] == "all-MiniLM-L6-v2"
    assert data["chunk_size"] == 500
    assert data["chunk_overlap"] == 50
    assert data["has_api_key"] is False


def test_update_settings_ollama_config(client, reset_settings):
    """Verify updating Ollama model and base URL."""
    payload = {
        "ollama_base_url": "http://127.0.0.1:11434",
        "ollama_model": "mistral:7b",
        "chunk_size": 600,
        "chunk_overlap": 60
    }
    response = client.put("/api/v1/settings", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["ollama_model"] == "mistral:7b"
    assert data["chunk_size"] == 600
    assert data["chunk_overlap"] == 60

    # Verify persistence on subsequent GET
    get_res = client.get("/api/v1/settings")
    assert get_res.status_code == 200
    assert get_res.json()["ollama_model"] == "mistral:7b"


def test_api_key_security_masking(client, reset_settings):
    """Verify API keys are never returned in plaintext."""
    # First set online mode so cloud keys are allowed
    client.put("/api/v1/settings", json={"is_offline_mode": False, "ai_provider": "cloud"})

    secret_key = "sk-proj-super-secret-key-12345678"
    response = client.put("/api/v1/settings", json={"cloud_api_key": secret_key})
    assert response.status_code == 200
    data = response.json()
    
    # Must NOT return secret_key in plaintext
    assert secret_key not in response.text
    assert data["cloud_api_key"] != secret_key
    assert "••••" in data["cloud_api_key"]
    assert data["has_api_key"] is True

    # Resubmitting the masked key must preserve the real secret without overwriting
    resubmit_res = client.put("/api/v1/settings", json={"cloud_api_key": data["cloud_api_key"], "chunk_size": 700})
    assert resubmit_res.status_code == 200
    assert resubmit_res.json()["has_api_key"] is True

    # Check database directly to verify real key was preserved intact
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        assert setting.cloud_api_key == secret_key
    finally:
        db.close()


def test_offline_mode_constraint(client, reset_settings):
    """Verify that Cloud AI cannot be selected while Offline Mode is enforced."""
    # Attempt to enable Cloud AI while is_offline_mode is True
    response = client.put("/api/v1/settings", json={"is_offline_mode": True, "ai_provider": "cloud"})
    assert response.status_code == 400
    err_msg = response.json().get("detail") or response.json().get("error", {}).get("message", "")
    assert "Cannot enable Cloud AI while in Offline Mode" in err_msg


def test_invalid_url_validation(client, reset_settings):
    """Verify validation error on malformed URL."""
    response = client.put("/api/v1/settings", json={"ollama_base_url": "ftp://invalid-server"})
    assert response.status_code == 400
    err_msg = response.json().get("detail") or response.json().get("error", {}).get("message", "")
    assert "must begin with http:// or https://" in err_msg


def test_test_ollama_endpoint(client):
    """Verify /api/v1/settings/test-ollama returns structured probe response."""
    response = client.post("/api/v1/settings/test-ollama", json={"base_url": "http://127.0.0.1:11434"})
    assert response.status_code == 200
    data = response.json()
    assert "connected" in data
    assert "base_url" in data
    assert "models" in data
    assert "message" in data


def test_system_status_endpoint(client, reset_settings):
    """Verify /api/v1/settings/system-status returns comprehensive health diagnostics."""
    response = client.get("/api/v1/settings/system-status")
    assert response.status_code == 200
    data = response.json()
    
    # Subsystems check
    assert "backend" in data
    assert data["backend"]["status"] == "healthy"
    
    assert "database" in data
    assert data["database"]["engine"] == "SQLite"
    assert data["database"]["status"] == "healthy"
    
    assert "vector_store" in data
    assert data["vector_store"]["engine"] == "ChromaDB"
    
    assert "ocr_engine" in data
    assert data["ocr_engine"]["engine"] == "EasyOCR"
    assert ".png" in data["ocr_engine"]["supported_formats"]
    
    assert "embedding_engine" in data
    assert data["embedding_engine"]["dimensions"] == 384
    
    assert "mcp" in data
    assert data["mcp"]["is_implemented"] is True
    assert data["mcp"]["status"] == "active"
    assert "search_documents" in data["mcp"]["active_tools"]
    assert data["mcp"]["cloud_mcp"] == "planned"
