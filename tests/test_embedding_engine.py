import os
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
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


def test_text_chunker_basic():
    text = (
        "Artificial Intelligence (AI) is intelligence demonstrated by machines, "
        "as opposed to intelligence of humans. AI applications include advanced web search engines, "
        "recommendation systems, understanding human speech, self-driving cars, and automated decision-making. "
        "Machine learning is a field of study devoted to understanding and building methods that 'learn'.\n\n"
        "Deep learning is a subset of machine learning based on artificial neural networks. "
        "Learning can be supervised, semi-supervised or unsupervised."
    )
    chunks = embedding_engine.chunk_text(text, chunk_size=100, chunk_overlap=20)
    assert len(chunks) > 1
    for c in chunks:
        assert "chunk_index" in c
        assert "text" in c
        assert "start_char" in c
        assert "end_char" in c
        assert c["character_count"] > 0
        assert c["word_count"] > 0


def test_embedding_generation_and_caching():
    texts = [
        "CogniDesk is an offline AI knowledge workspace.",
        "Sentence Transformers provide dense vector embeddings."
    ]
    vecs1 = embedding_engine.generate_embeddings_batch(texts, batch_size=2)
    assert len(vecs1) == 2
    assert isinstance(vecs1[0], list)
    assert len(vecs1[0]) > 0

    # Test cache hit
    initial_cache_size = len(embedding_engine._cache)
    vecs2 = embedding_engine.generate_embeddings_batch(texts, batch_size=2)
    assert vecs1 == vecs2
    assert len(embedding_engine._cache) == initial_cache_size


def test_document_embedding_process(setup_db):
    db = setup_db
    unique_fn = f"test_embedding_doc_{uuid.uuid4().hex[:8]}.txt"
    # 1. Create a mock document in SQLite
    doc = Document(
        filename=unique_fn,
        original_filename="test_embedding_doc.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=250,
        status="processed",
        extracted_text="This is test extracted text. Module 06 generates embeddings for processed documents.",
        cleaned_text="This is test extracted text. Module 06 generates embeddings for processed documents.",
        metadata_json=json.dumps({"author": "Test User", "page_count": 1})
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # 2. Execute process_document_embedding
        chunk_count, emb_count = embedding_engine.process_document_embedding(db, doc.id)
        assert chunk_count > 0
        assert emb_count == chunk_count

        # 3. Verify SQLite DB status update
        db.refresh(doc)
        assert doc.status == "embedded"
        assert doc.chunks == chunk_count

        # 4. Check DocumentChunk rows in DB
        chunks_in_db = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).all()
        assert len(chunks_in_db) == chunk_count
        for c in chunks_in_db:
            assert c.chunk_text is not None
            assert c.embedding_json is not None
            emb_list = json.loads(c.embedding_json)
            assert isinstance(emb_list, list)
            assert len(emb_list) > 0
    finally:
        db.delete(doc)
        db.commit()


def test_embeddings_api_endpoints(setup_db):
    db = setup_db
    unique_fn = f"api_test_doc_{uuid.uuid4().hex[:8]}.txt"
    doc = Document(
        filename=unique_fn,
        original_filename="api_test_doc.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=300,
        status="processed",
        extracted_text="FastAPI endpoint test for embedding engine module 06.",
        cleaned_text="FastAPI endpoint test for embedding engine module 06."
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # Test status endpoint
        response = client.get("/api/v1/embeddings/status")
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["success"] is True
        assert "model_name" in res_data["data"]

        # Test process document via engine directly then fetch chunks endpoint
        embedding_engine.process_document_embedding(db, doc.id)

        response_chunks = client.get(f"/api/v1/embeddings/documents/{doc.id}/chunks")
        assert response_chunks.status_code == 200
        chunks_data = response_chunks.json()
        assert chunks_data["success"] is True
        assert chunks_data["data"]["total_chunks"] > 0
        assert len(chunks_data["data"]["chunks"]) > 0
    finally:
        db.delete(doc)
        db.commit()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
