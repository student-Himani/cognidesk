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
from app.models.document_chunk import DocumentChunk
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.search_service import search_service
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


def test_query_embedding_generation():
    query_text = "What is quantum superposition in computing?"
    embedding = search_service.generate_query_embedding(query_text)
    assert embedding is not None
    assert isinstance(embedding, list)
    assert len(embedding) == 384  # MiniLM dimension


def test_semantic_search_pipeline(setup_db):
    db = setup_db
    unique_fn = f"search_test_doc_{uuid.uuid4().hex[:8]}.txt"
    
    # 1. Create document
    doc = Document(
        filename=unique_fn,
        original_filename="quantum_paper.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=600,
        status="processed",
        extracted_text="Quantum computing leverages superposition and entanglement to perform complex linear algebra calculations at unprecedented speed.",
        cleaned_text="Quantum computing leverages superposition and entanglement to perform complex linear algebra calculations at unprecedented speed.",
        metadata_json=json.dumps({"domain": "Quantum Physics"})
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # 2. Process embeddings & store vectors
        embedding_engine.process_document_embedding(db, doc.id)
        vector_storage.store_document_vectors(db, doc.id)

        # 3. Perform semantic search
        search_res = search_service.execute_search(
            db=db,
            query="superposition quantum calculations",
            top_k=3,
            search_mode="semantic"
        )

        assert search_res["query"] == "superposition quantum calculations"
        assert search_res["search_mode"] == "semantic"
        assert search_res["results_count"] > 0
        assert len(search_res["results"]) > 0

        first_item = search_res["results"][0]
        assert "superposition" in first_item["snippet"].lower()
        assert first_item["document_id"] == doc.id
        assert first_item["similarity_score"] > 0.0
        assert "citation" in first_item
        assert first_item["citation"]["filename"] == "quantum_paper.txt"

        # 4. Perform full-text search
        ft_res = search_service.execute_search(
            db=db,
            query="entanglement",
            top_k=3,
            search_mode="fulltext"
        )
        assert ft_res["results_count"] > 0
        assert ft_res["results"][0]["score"] == "100% Match"

    finally:
        vector_storage.delete_document_vectors(doc.id)
        db.delete(doc)
        db.commit()


def test_search_filters(setup_db):
    db = setup_db
    unique_fn = f"filter_test_doc_{uuid.uuid4().hex[:8]}.pdf"
    
    doc = Document(
        filename=unique_fn,
        original_filename="filter_spec.pdf",
        filepath=f"uploads/{unique_fn}",
        filetype="pdf",
        filesize=500,
        status="processed",
        extracted_text="Filtered query test specification document for Module 08.",
        cleaned_text="Filtered query test specification document for Module 08."
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        embedding_engine.process_document_embedding(db, doc.id)
        vector_storage.store_document_vectors(db, doc.id)

        # Search matching filetype filter
        res_matching = search_service.execute_search(
            db=db,
            query="test specification",
            filetype="pdf",
            document_ids=[doc.id]
        )
        assert res_matching["results_count"] > 0

        # Search non-matching filetype filter
        res_non_matching = search_service.execute_search(
            db=db,
            query="test specification",
            filetype="docx",
            document_ids=[doc.id]
        )
        assert res_non_matching["results_count"] == 0

    finally:
        vector_storage.delete_document_vectors(doc.id)
        db.delete(doc)
        db.commit()


def test_search_history_management(setup_db):
    db = setup_db
    
    # Execute search to record history
    search_service.execute_search(db=db, query="History query test 1", search_mode="semantic")
    search_service.execute_search(db=db, query="History query test 2", search_mode="fulltext")

    history = search_service.get_history(db, limit=10)
    assert len(history) >= 2
    queries = [h["query_text"] for h in history]
    assert "History query test 1" in queries
    assert "History query test 2" in queries

    # Delete one item
    item_id = history[0]["id"]
    deleted = search_service.delete_history_item(db, item_id)
    assert deleted is True

    # Clear history
    search_service.clear_history(db)
    post_clear_history = search_service.get_history(db, limit=10)
    assert len(post_clear_history) == 0


def test_search_api_endpoints(setup_db):
    db = setup_db
    
    # Test POST /api/v1/search/query endpoint
    payload = {
        "query": "API test search query",
        "top_k": 3,
        "search_mode": "semantic"
    }
    response = client.post("/api/v1/search/query", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["query"] == "API test search query"
    assert "execution_time_ms" in res_data["data"]

    # Test GET /api/v1/search/history endpoint
    history_res = client.get("/api/v1/search/history")
    assert history_res.status_code == 200
    h_data = history_res.json()
    assert h_data["success"] is True
    assert h_data["data"]["total_items"] > 0

    # Test DELETE /api/v1/search/history endpoint
    del_res = client.delete("/api/v1/search/history")
    assert del_res.status_code == 200
    d_data = del_res.json()
    assert d_data["success"] is True


if __name__ == "__main__":
    pytest.main(["-v", __file__])
