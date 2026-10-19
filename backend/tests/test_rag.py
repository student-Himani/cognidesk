import sys
from pathlib import Path
import pytest

backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_rag_status_endpoint():
    response = client.get("/api/v1/rag/status")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    assert "online" in data["data"]
    assert "models" in data["data"]


def test_rag_query_normal_mode():
    payload = {
        "query": "What is polymorphism in Java?",
        "mode": "normal",
        "top_k": 5
    }
    response = client.post("/api/v1/rag/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "answer" in data["data"]
    assert data["data"]["citations"] == []


def test_rag_query_document_mode_empty():
    payload = {
        "query": "What is superposition?",
        "mode": "document",
        "top_k": 5
    }
    response = client.post("/api/v1/rag/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "answer" in data["data"]
