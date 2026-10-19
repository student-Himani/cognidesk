import os
import sys
import io
import pytest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import engine, Base, SessionLocal
from app.models.setting import AppSetting
from app.models.workspace import Workspace
from app.models.document import Document
from app.services.providers.factory import get_llm_provider
from app.services.providers.base import OfflineModeEnforcedError

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_security_state():
    """Ensure clean test state before and after each security test."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Reset settings to default offline Ollama mode
    setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
    if not setting:
        setting = AppSetting(id=1, ai_provider="ollama", is_offline_mode=True, cloud_api_key=None)
        db.add(setting)
    else:
        setting.ai_provider = "ollama"
        setting.is_offline_mode = True
        setting.cloud_api_key = None
    db.commit()

    # Ensure default workspace
    ws = db.query(Workspace).filter(Workspace.id == 1).first()
    if not ws:
        ws = Workspace(id=1, name="Default Workspace", description="Default Workspace")
        db.add(ws)
        db.commit()

    yield db

    # Cleanup any security test documents created
    db.query(Document).filter(Document.filename.like("sec_test_%")).delete(synchronize_session=False)
    # Restore safe default
    if setting:
        setting.ai_provider = "ollama"
        setting.is_offline_mode = True
        setting.cloud_api_key = None
        db.commit()
    db.close()


def test_upload_path_traversal_sanitization():
    """Test that path traversal attempts (e.g. ../../evil.txt) are sanitized to safe basenames."""
    file_bytes = io.BytesIO(b"Security test content")
    malicious_filename = "../../../traversal_test.txt"

    response = client.post(
        "/api/v1/documents/upload",
        files={"file": (malicious_filename, file_bytes, "text/plain")},
        data={"workspace_id": "1"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True

    # Check saved filename has no directory traversal components
    saved_doc = data["data"]
    assert ".." not in saved_doc["name"]
    assert "/" not in saved_doc["name"]
    assert "\\" not in saved_doc["name"]
    assert "traversal_test.txt" in saved_doc["name"]


def test_upload_disallowed_extension_rejection():
    """Test that executable and dangerous file types are rejected immediately with HTTP 400."""
    disallowed_extensions = ["evil.exe", "script.sh", "malware.bat", "exploit.py", "payload.bin"]
    for filename in disallowed_extensions:
        file_bytes = io.BytesIO(b"echo Dangerous")
        response = client.post(
            "/api/v1/documents/upload",
            files={"file": (filename, file_bytes, "application/octet-stream")},
            data={"workspace_id": "1"}
        )
        assert response.status_code == 400, f"Expected 400 for {filename}, got {response.status_code}"
        assert "Unsupported file extension" in response.text


def test_preview_outside_directory_forbidden(clean_security_state):
    """Test that attempting to preview a file outside the upload directory is rejected."""
    db = clean_security_state
    # Create a document pointing outside upload directory (e.g. system file or root)
    evil_doc = Document(
        workspace_id=1,
        filename="sec_test_evil.txt",
        original_filename="evil.txt",
        filepath="C:/Windows/System32/drivers/etc/hosts",
        filetype="txt",
        filesize=100,
        status="uploaded",
        chunks=0,
        page_count=1,
        word_count=10
    )
    db.add(evil_doc)
    db.commit()
    db.refresh(evil_doc)

    response = client.get(f"/api/v1/documents/{evil_doc.id}/preview")
    # Must reject with 404 unauthorized path / not found
    assert response.status_code == 404
    assert "unauthorized path" in response.text or "not found" in response.text.lower()


def test_api_key_masking_and_no_leakage():
    """Test that API keys saved are masked with bullets and never returned in plaintext."""
    secret_key = "sk-ant-api03-TOP_SECRET_REALLY_CONFIDENTIAL_KEY_9999"

    # 1. Update settings with cloud API key via PUT
    update_res = client.put("/api/v1/settings", json={
        "ai_provider": "cloud",
        "cloud_provider": "anthropic",
        "cloud_api_key": secret_key,
        "is_offline_mode": False
    })
    assert update_res.status_code == 200

    # 2. Get settings: verify returned key is masked
    get_res = client.get("/api/v1/settings")
    assert get_res.status_code == 200
    data = get_res.json()

    assert "••••" in data["cloud_api_key"]
    assert data["cloud_api_key"] != secret_key
    assert secret_key not in get_res.text, "Secret key was leaked in plaintext in settings response!"


def test_offline_mode_blocks_every_cloud_call(clean_security_state):
    """Verify that when Offline Mode is enabled, cloud providers cannot be instantiated or called."""
    db = clean_security_state

    # 1. Ensure offline mode is active
    setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
    setting.is_offline_mode = True
    db.commit()

    # 2. Attempting to force Anthropic provider raises OfflineModeEnforcedError
    with pytest.raises(OfflineModeEnforcedError):
        get_llm_provider(db, force_provider="anthropic")

    # 3. Attempting to force OpenAI provider raises OfflineModeEnforcedError
    with pytest.raises(OfflineModeEnforcedError):
        get_llm_provider(db, force_provider="openai")

    # 4. Attempting to hit the test-cloud endpoint in offline mode returns connected=False with offline explanation
    test_cloud_res = client.post("/api/v1/settings/test-cloud", json={
        "provider": "anthropic",
        "api_key": "test-key"
    })
    assert test_cloud_res.status_code == 200
    cloud_data = test_cloud_res.json()
    assert cloud_data["connected"] is False
    assert "Cannot test Cloud AI while in Offline Mode" in cloud_data["message"]

    # 5. RAG query with cloud provider in offline mode returns HTTP 400
    setting.ai_provider = "cloud"
    db.commit()
    rag_res = client.post("/api/v1/rag/query", json={
        "query": "Hello",
        "use_context": False
    })
    assert rag_res.status_code == 400
    assert "Offline Mode is strictly enforced" in rag_res.text


def test_workspace_isolation_unauthorized_scope(clean_security_state):
    """Verify documents and searches in Workspace 1 are completely isolated from Workspace 2."""
    db = clean_security_state

    # Ensure Workspace 2 exists
    ws2 = db.query(Workspace).filter(Workspace.id == 2).first()
    if not ws2:
        ws2 = Workspace(id=2, name="Confidential Workspace", description="Workspace 2")
        db.add(ws2)
        db.commit()

    # Upload document specifically into Workspace 2
    file_bytes = io.BytesIO(b"Confidential internal document for workspace 2 only.")
    res = client.post(
        "/api/v1/documents/upload",
        files={"file": ("sec_test_private.txt", file_bytes, "text/plain")},
        data={"workspace_id": "2"}
    )
    assert res.status_code == 201
    doc_id = str(res.json()["data"]["id"])

    # Querying documents for Workspace 1 must NOT list this document
    ws1_docs = client.get("/api/v1/documents", headers={"x-workspace-id": "1"}).json()
    assert isinstance(ws1_docs, list)
    doc_ids_in_ws1 = [str(d["id"]) for d in ws1_docs]
    assert doc_id not in doc_ids_in_ws1

    # Querying documents for Workspace 2 MUST list this document
    ws2_docs = client.get("/api/v1/documents", headers={"x-workspace-id": "2"}).json()
    assert isinstance(ws2_docs, list)
    doc_ids_in_ws2 = [str(d["id"]) for d in ws2_docs]
    assert doc_id in doc_ids_in_ws2
