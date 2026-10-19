import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal
from app.models.conversation import Conversation
from app.models.workspace import Workspace

client = TestClient(app)


def test_sqlite_chat_history_lifecycle_and_scoping():
    # 1. Create a rich conversation thread with citations
    thread_id = "test-sqlite-thread-001"
    payload = {
        "id": thread_id,
        "title": "SQL Query Optimization Discussion",
        "time": "Just now",
        "mode": "document",
        "selectedDocId": "all",
        "workspace_id": 1,
        "messages": [
            {
                "id": "msg-user-1",
                "sender": "user",
                "mode": "document",
                "text": "How do I optimize nested subqueries in PostgreSQL?",
                "timestamp": "02:30 PM"
            },
            {
                "id": "msg-ai-1",
                "sender": "assistant",
                "mode": "document",
                "text": "Use CTEs (Common Table Expressions) or window functions instead of correlated subqueries.",
                "timestamp": "02:30 PM",
                "citations": [
                    {
                        "docName": "50 SQL Questions.pdf",
                        "page": "Chunk #3",
                        "score": "95% Similarity",
                        "documentId": 1,
                        "startChar": 100,
                        "endChar": 350
                    }
                ]
            }
        ]
    }

    # Save conversation via POST
    res = client.post("/api/v1/chat/threads", json=payload, headers={"X-Workspace-Id": "1"})
    assert res.status_code == 200
    saved = res.json()["data"]
    assert saved["id"] == thread_id
    assert saved["title"] == "SQL Query Optimization Discussion"
    assert saved["message_count"] == 2
    assert len(saved["messages"]) == 2
    assert len(saved["messages"][1]["citations"]) == 1
    assert saved["messages"][1]["citations"][0]["docName"] == "50 SQL Questions.pdf"

    # 2. Verify retrieval by ID
    get_res = client.get(f"/api/v1/chat/threads/{thread_id}")
    assert get_res.status_code == 200
    fetched = get_res.json()["data"]
    assert fetched["id"] == thread_id
    assert len(fetched["messages"]) == 2
    assert fetched["messages"][1]["citations"][0]["score"] == "95% Similarity"

    # 3. Rename conversation via PUT
    rename_res = client.put(f"/api/v1/chat/threads/{thread_id}/rename", json={"title": "Mastering PostgreSQL CTEs"})
    assert rename_res.status_code == 200
    renamed = rename_res.json()["data"]
    assert renamed["title"] == "Mastering PostgreSQL CTEs"

    # 4. Search conversations
    # Search by title keyword
    search_res = client.get("/api/v1/chat/search?query=PostgreSQL", headers={"X-Workspace-Id": "1"})
    assert search_res.status_code == 200
    search_data = search_res.json()["data"]
    assert any(c["id"] == thread_id for c in search_data)

    # Search by message text keyword
    search_res2 = client.get("/api/v1/chat/search?query=subqueries", headers={"X-Workspace-Id": "1"})
    assert search_res2.status_code == 200
    search_data2 = search_res2.json()["data"]
    assert any(c["id"] == thread_id for c in search_data2)

    # 5. Workspace scoping & isolation
    # Create temporary workspace 999
    db = SessionLocal()
    try:
        ws2 = db.query(Workspace).filter(Workspace.id == 999).first()
        if not ws2:
            ws2 = Workspace(id=999, name="Isolated Sandbox Workspace", category="Test", is_active=False)
            db.add(ws2)
            db.commit()
    finally:
        db.close()

    # Create thread in workspace 999
    thread_ws2_id = "test-ws2-thread-002"
    client.post("/api/v1/chat/threads", json={
        "id": thread_ws2_id,
        "title": "Isolated Sandbox Secret Thread",
        "time": "Just now",
        "mode": "normal",
        "workspace_id": 999,
        "messages": [{"id": "m1", "sender": "user", "text": "Confidential research"}]
    }, headers={"X-Workspace-Id": "999"})

    # Fetch workspace 1 threads -> thread_ws2_id must NOT be present
    ws1_threads = client.get("/api/v1/chat/threads", headers={"X-Workspace-Id": "1"}).json()["data"]
    assert not any(t["id"] == thread_ws2_id for t in ws1_threads)
    assert any(t["id"] == thread_id for t in ws1_threads)

    # Fetch workspace 999 threads -> thread_id must NOT be present, thread_ws2_id MUST be present
    ws2_threads = client.get("/api/v1/chat/threads", headers={"X-Workspace-Id": "999"}).json()["data"]
    assert any(t["id"] == thread_ws2_id for t in ws2_threads)
    assert not any(t["id"] == thread_id for t in ws2_threads)

    # 6. Delete conversation
    del_res = client.delete(f"/api/v1/chat/threads/{thread_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Confirm 404
    not_found = client.get(f"/api/v1/chat/threads/{thread_id}")
    assert not_found.status_code == 404

    # Clean up ws2
    client.delete(f"/api/v1/chat/threads/{thread_ws2_id}")
    db = SessionLocal()
    try:
        ws_cleanup = db.query(Workspace).filter(Workspace.id == 999).first()
        if ws_cleanup:
            db.delete(ws_cleanup)
            db.commit()
    finally:
        db.close()
