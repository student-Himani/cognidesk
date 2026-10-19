import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.main import app
from app.services.redis_service import redis_service

client = TestClient(app)


def test_redis_service_save_get_delete():
    test_thread = {
        "id": "test-thread-999",
        "title": "Test Redis Persistence Thread",
        "time": "Just now",
        "messages": [
            {
                "id": "msg-1",
                "sender": "user",
                "text": "Hello Redis test",
                "timestamp": "12:00 PM"
            }
        ]
    }

    # Save thread
    saved = redis_service.save_thread(test_thread)
    assert saved is True

    # Retrieve thread
    retrieved = redis_service.get_thread("test-thread-999")
    assert retrieved is not None
    assert retrieved["id"] == "test-thread-999"
    assert retrieved["title"] == "Test Redis Persistence Thread"
    assert len(retrieved["messages"]) == 1

    # Delete thread
    deleted = redis_service.delete_thread("test-thread-999")
    assert deleted is True

    retrieved_after_delete = redis_service.get_thread("test-thread-999")
    assert retrieved_after_delete is None


def test_chat_api_endpoints():
    test_payload = {
        "id": "test-api-thread-100",
        "title": "API Thread Test",
        "time": "Just now",
        "messages": [
            {
                "id": "m100",
                "sender": "user",
                "text": "API testing question",
                "timestamp": "12:05 PM"
            }
        ]
    }

    # POST /api/v1/chat/threads
    post_res = client.post("/api/v1/chat/threads", json=test_payload)
    assert post_res.status_code == 200
    assert post_res.json()["success"] is True

    # GET /api/v1/chat/threads
    get_res = client.get("/api/v1/chat/threads")
    assert get_res.status_code == 200
    assert get_res.json()["success"] is True
    threads = get_res.json()["data"]
    assert any(t["id"] == "test-api-thread-100" for t in threads)

    # DELETE /api/v1/chat/threads/{id}
    del_res = client.delete("/api/v1/chat/threads/test-api-thread-100")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True


if __name__ == "__main__":
    test_redis_service_save_get_delete()
    test_chat_api_endpoints()
    print("[PASS] All Redis chat tests passed successfully!")

