import sys
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal, Base, engine
from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def setup_test_data():
    """Seeds two workspaces and test documents for MCP testing."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Ensure Workspace 1 exists
        ws1 = db.query(Workspace).filter(Workspace.id == 1).first()
        if not ws1:
            ws1 = Workspace(id=1, name="Workspace Alpha", description="Test WS 1", is_active=True)
            db.add(ws1)
            db.commit()

        # 2. Ensure Workspace 2 exists
        ws2 = db.query(Workspace).filter(Workspace.id == 2).first()
        if not ws2:
            ws2 = Workspace(id=2, name="Workspace Beta", description="Test WS 2", is_active=False)
            db.add(ws2)
            db.commit()

        # 3. Create Document in Workspace 1
        doc1 = db.query(Document).filter(Document.filename == "mcp_alpha_doc.txt").first()
        if not doc1:
            doc1 = Document(
                workspace_id=1,
                filename="mcp_alpha_doc.txt",
                original_filename="Alpha Confidential Policy.txt",
                filepath="uploads/mcp_alpha_doc.txt",
                filetype="txt",
                filesize=1024,
                status="embedded",
                chunks=2,
                page_count=1,
                word_count=120,
                extracted_text="Alpha secret document regarding clinical audit policies.",
                cleaned_text="Alpha secret document regarding clinical audit policies."
            )
            db.add(doc1)
            db.commit()
            db.refresh(doc1)

            # Add chunks
            c1 = DocumentChunk(
                document_id=doc1.id,
                chunk_index=0,
                chunk_text="Section 1: Alpha clinical audit policies mandate annual reviews.",
                start_char=0,
                end_char=65,
                word_count=9
            )
            c2 = DocumentChunk(
                document_id=doc1.id,
                chunk_index=1,
                chunk_text="Section 2: Records must be archived for seven years securely.",
                start_char=66,
                end_char=128,
                word_count=10
            )
            db.add_all([c1, c2])
            db.commit()

        yield {"ws1": ws1, "ws2": ws2, "doc1": doc1}
    finally:
        db.close()


def test_mcp_initialize(client):
    """Verify standard MCP JSON-RPC initialize handshake."""
    payload = {
        "jsonrpc": "2.0",
        "id": "init-1",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0"}
        }
    }
    response = client.post("/api/v1/mcp", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["jsonrpc"] == "2.0"
    assert data["id"] == "init-1"
    res = data["result"]
    assert res["protocolVersion"] == "2024-11-05"
    assert res["serverInfo"]["name"] == "cognidesk-mcp-server"
    assert "tools" in res["capabilities"]


def test_mcp_ping(client):
    """Verify MCP ping method."""
    payload = {
        "jsonrpc": "2.0",
        "id": "ping-99",
        "method": "ping"
    }
    response = client.post("/api/v1/mcp", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "ping-99"
    assert data["result"] == {}


def test_mcp_tools_list(client):
    """Verify MCP tools/list returns both search_documents and get_document_summary."""
    payload = {
        "jsonrpc": "2.0",
        "id": "tools-1",
        "method": "tools/list"
    }
    response = client.post("/api/v1/mcp", json=payload)
    assert response.status_code == 200
    data = response.json()
    tools = data["result"]["tools"]
    tool_names = [t["name"] for t in tools]
    assert "search_documents" in tool_names
    assert "get_document_summary" in tool_names

    search_tool = next(t for t in tools if t["name"] == "search_documents")
    assert "query" in search_tool["inputSchema"]["required"]

    summary_tool = next(t for t in tools if t["name"] == "get_document_summary")
    assert "document_id" in summary_tool["inputSchema"]["required"]


def test_mcp_search_documents_tool(client, setup_test_data):
    """Verify tools/call for search_documents."""
    payload = {
        "jsonrpc": "2.0",
        "id": "call-1",
        "method": "tools/call",
        "params": {
            "name": "search_documents",
            "arguments": {
                "query": "clinical audit",
                "top_k": 3,
                "workspace_id": 1
            }
        }
    }
    response = client.post("/api/v1/mcp", json=payload)
    assert response.status_code == 200
    data = response.json()
    res = data["result"]
    assert res["isError"] is False
    assert len(res["content"]) > 0
    parsed_output = json.loads(res["content"][0]["text"])
    assert parsed_output["query"] == "clinical audit"
    assert parsed_output["workspace_id"] == 1


def test_mcp_get_document_summary_and_workspace_isolation(client, setup_test_data):
    """Verify tools/call for get_document_summary and strict workspace boundary isolation."""
    doc1 = setup_test_data["doc1"]

    # 1. Querying with correct workspace (WS 1) must succeed
    payload_ws1 = {
        "jsonrpc": "2.0",
        "id": "call-summary-1",
        "method": "tools/call",
        "params": {
            "name": "get_document_summary",
            "arguments": {
                "document_id": doc1.id,
                "workspace_id": 1
            }
        }
    }
    response1 = client.post("/api/v1/mcp", json=payload_ws1)
    assert response1.status_code == 200
    data1 = response1.json()["result"]
    assert data1["isError"] is False
    parsed_summary = json.loads(data1["content"][0]["text"])
    assert parsed_summary["document_id"] == doc1.id
    assert parsed_summary["workspace_id"] == 1
    assert parsed_summary["filename"] == "Alpha Confidential Policy.txt"
    assert len(parsed_summary["sample_chunk_previews"]) > 0

    # 2. Querying with wrong workspace (WS 2) MUST FAIL to enforce isolation
    payload_ws2 = {
        "jsonrpc": "2.0",
        "id": "call-summary-2",
        "method": "tools/call",
        "params": {
            "name": "get_document_summary",
            "arguments": {
                "document_id": doc1.id,
                "workspace_id": 2
            }
        }
    }
    response2 = client.post("/api/v1/mcp", json=payload_ws2)
    assert response2.status_code == 200
    data2 = response2.json()["result"]
    assert data2["isError"] is True
    assert "was not found in workspace 2" in data2["content"][0]["text"]


def test_mcp_error_handling(client):
    """Verify error responses for missing method, invalid tool name, and missing params."""
    # Method not found
    res1 = client.post("/api/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "invalid/method"})
    assert res1.status_code == 200
    assert res1.json()["error"]["code"] == -32601

    # Missing tool name in tools/call
    res2 = client.post("/api/v1/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {}})
    assert res2.status_code == 200
    assert res2.json()["error"]["code"] == -32602

    # Non-existent tool name in tools/call
    res3 = client.post("/api/v1/mcp", json={
        "jsonrpc": "2.0", "id": 3, "method": "tools/call",
        "params": {"name": "fake_tool", "arguments": {}}
    })
    assert res3.status_code == 200
    assert res3.json()["result"]["isError"] is True
    assert "Unknown MCP tool" in res3.json()["result"]["content"][0]["text"]


def test_mcp_rest_endpoints(client, setup_test_data):
    """Verify REST discovery and execution endpoints."""
    # GET /api/v1/mcp/status
    res_status = client.get("/api/v1/mcp/status")
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert status_data["status"] == "active"
    assert status_data["protocol_version"] == "2024-11-05"
    assert "search_documents" in status_data["active_tools"]
    assert status_data["cloud_mcp"]["status"] == "planned"

    # GET /api/v1/mcp/tools
    res_tools = client.get("/api/v1/mcp/tools")
    assert res_tools.status_code == 200
    assert len(res_tools.json()["tools"]) == 2

    # POST /api/v1/mcp/tools/search_documents (direct execution)
    res_exec = client.post("/api/v1/mcp/tools/search_documents", json={"query": "policy", "top_k": 2})
    assert res_exec.status_code == 200
    assert res_exec.json()["success"] is True
