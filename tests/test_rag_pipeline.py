import sys
import json
import uuid
import pytest
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.core.db import engine, Base, SessionLocal
from app.models.document import Document
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.rag_service import rag_service
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


def test_prompt_builder_and_citations():
    mock_chunks = [
        {
            "id": "doc_1_chunk_0",
            "document_id": 1,
            "title": "quantum_physics.pdf",
            "snippet": "Qubits can exist in a linear combination of states |0> and |1> simultaneously.",
            "score": "95% Similarity",
            "chunkIndex": "Chunk #1",
            "citation": {
                "filename": "quantum_physics.pdf",
                "chunk_index": "Chunk #1",
                "start_char": 0,
                "end_char": 70
            }
        }
    ]

    sys_prompt, full_prompt = rag_service.build_prompt(
        query="What is qubit superposition?",
        context_chunks=mock_chunks
    )

    assert "CogniDesk AI" in sys_prompt
    assert "=== RETRIEVED DOCUMENT CONTEXT ===" in full_prompt
    assert "quantum_physics.pdf" in full_prompt
    assert "USER QUESTION: What is qubit superposition?" in full_prompt

    citations = rag_service.map_citations(mock_chunks)
    assert len(citations) == 1
    assert citations[0]["docName"] == "quantum_physics.pdf"
    assert citations[0]["score"] == "95% Similarity"


def test_token_limit_management():
    chunks = [
        {"snippet": "A" * 3000},
        {"snippet": "B" * 3000},
        {"snippet": "C" * 3000},
    ]
    # Limit max chars to 7000 -> should select only first 2 chunks (6000 chars)
    truncated = rag_service.manage_token_limits(chunks, max_chars=7000)
    assert len(truncated) == 2


def test_ollama_status_check():
    status = rag_service.check_ollama_status()
    assert "online" in status
    assert "base_url" in status
    assert isinstance(status["models"], list)


def test_full_rag_pipeline_execution(setup_db):
    db = setup_db
    unique_fn = f"rag_test_doc_{uuid.uuid4().hex[:8]}.txt"

    doc = Document(
        filename=unique_fn,
        original_filename="ai_architecture.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=500,
        status="processed",
        extracted_text="CogniDesk is an offline AI workspace powered by vector search and local LLMs like Qwen 2.5.",
        cleaned_text="CogniDesk is an offline AI workspace powered by vector search and local LLMs like Qwen 2.5."
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        embedding_engine.process_document_embedding(db, doc.id)
        vector_storage.store_document_vectors(db, doc.id)

        rag_result = rag_service.generate_response(
            db=db,
            query="What powers CogniDesk offline AI workspace?",
            top_k=3
        )

        assert rag_result["query"] == "What powers CogniDesk offline AI workspace?"
        assert "answer" in rag_result
        assert isinstance(rag_result["citations"], list)
        assert rag_result["context_used_count"] > 0
        assert rag_result["execution_time_ms"] > 0

    finally:
        vector_storage.delete_document_vectors(doc.id)
        db.delete(doc)
        db.commit()


def test_rag_api_endpoints(setup_db):
    # Test GET /api/v1/rag/status
    res_status = client.get("/api/v1/rag/status")
    assert res_status.status_code == 200
    st_data = res_status.json()
    assert st_data["success"] is True
    assert "online" in st_data["data"]

    # Test POST /api/v1/rag/query
    payload = {
        "query": "What is CogniDesk?",
        "top_k": 3
    }
    res_query = client.post("/api/v1/rag/query", json=payload)
    assert res_query.status_code == 200
    q_data = res_query.json()
    assert q_data["success"] is True
    assert "answer" in q_data["data"]
    assert "citations" in q_data["data"]

    # Test POST /api/v1/rag/context
    res_ctx = client.post("/api/v1/rag/context", json=payload)
    assert res_ctx.status_code == 200
    ctx_data = res_ctx.json()
    assert ctx_data["success"] is True
    assert "full_prompt" in ctx_data["data"]
    assert "estimated_tokens" in ctx_data["data"]


if __name__ == "__main__":
    pytest.main(["-v", __file__])

