import sys
from pathlib import Path
import pytest

backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal
from app.models.document import Document
from app.models.note import Note

client = TestClient(app)


def test_get_notes_endpoint():
    response = client.get("/api/v1/notes")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)


def test_create_and_get_note():
    payload = {
        "title": "Quantum Physics Summary Note",
        "content": "# Executive Summary\n- Superposition is a core quantum principle.",
        "category": "Manual Note"
    }
    create_res = client.post("/api/v1/notes", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()["data"]
    note_id = created_data["id"]
    assert created_data["title"] == payload["title"]

    # Fetch by ID
    get_res = client.get(f"/api/v1/notes/{note_id}")
    assert get_res.status_code == 200
    fetched_data = get_res.json()["data"]
    assert fetched_data["id"] == note_id
    assert fetched_data["content"] == payload["content"]


def test_update_note():
    payload = {
        "title": "Initial Title",
        "content": "Initial Content",
        "category": "Draft"
    }
    create_res = client.post("/api/v1/notes", json=payload)
    note_id = create_res.json()["data"]["id"]

    update_payload = {
        "title": "Updated Title",
        "content": "Updated Content"
    }
    update_res = client.put(f"/api/v1/notes/{note_id}", json=update_payload)
    assert update_res.status_code == 200
    updated_data = update_res.json()["data"]
    assert updated_data["title"] == "Updated Title"
    assert updated_data["content"] == "Updated Content"


def test_delete_note():
    payload = {
        "title": "Note to Delete",
        "content": "Will be deleted soon.",
        "category": "Temporary"
    }
    create_res = client.post("/api/v1/notes", json=payload)
    note_id = create_res.json()["data"]["id"]

    delete_res = client.delete(f"/api/v1/notes/{note_id}")
    assert delete_res.status_code == 200

    # Verify 404 on get
    get_res = client.get(f"/api/v1/notes/{note_id}")
    assert get_res.status_code == 404


def test_generate_ai_note():
    import uuid
    # Insert test document into database
    db = SessionLocal()
    unique_fn = f"test_doc_{uuid.uuid4().hex[:8]}.txt"
    try:
        test_doc = Document(
            filename=unique_fn,
            original_filename="Quantum_Computing_Overview.txt",
            filepath=f"/tmp/{unique_fn}",
            filetype="txt",
            filesize=1024,
            status="embedded",
            chunks=1,
            page_count=1,
            word_count=150,
            cleaned_text="Quantum computing utilizes qubits to achieve superposition and entanglement for rapid computations."
        )
        db.add(test_doc)
        db.commit()
        db.refresh(test_doc)
        doc_id = test_doc.id

        # Call generate endpoint
        gen_res = client.post("/api/v1/notes/generate", json={"document_id": doc_id})
        assert gen_res.status_code == 201
        gen_data = gen_res.json()["data"]
        assert gen_data["category"] == "AI Generated"
        assert "Quantum_Computing_Overview.txt" in gen_data["title"]
        assert isinstance(gen_data["content"], str) and len(gen_data["content"]) > 10
    finally:
        db.close()
