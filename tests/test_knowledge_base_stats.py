import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal
from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.workspace_service import workspace_service

client = TestClient(app)


def test_knowledge_base_stats_workspace_1():
    """Verify live knowledge base stats for Workspace 1."""
    response = client.get("/api/v1/vector-db/stats?workspace_id=1")
    assert response.status_code == 200
    data = response.json().get("data", {})

    assert data["workspace_id"] == 1
    assert "workspace_name" in data
    assert isinstance(data["total_documents"], int)
    assert isinstance(data["total_chunks"], int)
    assert data["embedding_model"] == "all-MiniLM-L6-v2"
    assert data["embedding_dimension"] == 384
    assert data["embedding_provider"] == "Local SentenceTransformers (PyTorch)"
    assert data["chunk_size"] == 1000
    assert data["chunk_overlap"] == 150
    assert data["distance_metric"] == "cosine"
    assert data["chroma_collection_name"] == "cognidesk_documents"
    assert isinstance(data["collections"], list)
    assert len(data["collections"]) >= 1

    # Check collection properties
    primary_col = data["collections"][0]
    assert "name" in primary_col
    assert "count" in primary_col
    assert "docs" in primary_col
    assert "tags" in primary_col


def test_knowledge_base_stats_isolation_two_workspaces():
    """Verify stats isolation between 2 distinct workspaces."""
    db = SessionLocal()
    try:
        # Create a new isolated workspace
        ws2 = Workspace(
            name="Isolated Knowledge Workspace",
            description="Testing workspace stats isolation",
            category="Research",
            is_active=False
        )
        db.add(ws2)
        db.commit()
        db.refresh(ws2)

        ws2_id = ws2.id

        # Query stats for Workspace 2 via query param
        res_ws2 = client.get(f"/api/v1/vector-db/stats?workspace_id={ws2_id}")
        assert res_ws2.status_code == 200
        data_ws2 = res_ws2.json().get("data", {})

        assert data_ws2["workspace_id"] == ws2_id
        assert data_ws2["workspace_name"] == "Isolated Knowledge Workspace"
        assert data_ws2["total_documents"] == 0
        assert data_ws2["total_chunks"] == 0

        # Query stats for Workspace 2 via X-Workspace-Id header
        res_header = client.get("/api/v1/vector-db/stats", headers={"X-Workspace-Id": str(ws2_id)})
        assert res_header.status_code == 200
        data_header = res_header.json().get("data", {})
        assert data_header["workspace_id"] == ws2_id
        assert data_header["total_documents"] == 0
        assert data_header["total_chunks"] == 0

        # Query stats for Workspace 1 to confirm isolation
        res_ws1 = client.get("/api/v1/vector-db/stats?workspace_id=1")
        assert res_ws1.status_code == 200
        data_ws1 = res_ws1.json().get("data", {})

        assert data_ws1["workspace_id"] == 1
        if data_ws1["total_documents"] > 0:
            assert data_ws1["total_documents"] > data_ws2["total_documents"]

        # Clean up ws2
        db.delete(ws2)
        db.commit()
    finally:
        db.close()
