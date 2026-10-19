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
from app.core.chroma import get_chroma_client, get_or_create_collection
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


def test_chroma_collection_manager():
    client_instance = get_chroma_client()
    assert client_instance is not None
    
    collection = get_or_create_collection("test_module_07_collection")
    assert collection is not None
    assert collection.name == "test_module_07_collection"


def test_store_and_fetch_document_vectors(setup_db):
    db = setup_db
    unique_fn = f"vector_test_doc_{uuid.uuid4().hex[:8]}.txt"
    
    # 1. Create document in SQLite
    doc = Document(
        filename=unique_fn,
        original_filename="vector_test_doc.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=400,
        status="processed",
        extracted_text="Module 07 tests ChromaDB Vector Storage integration. Vectors, metadata, and texts are saved.",
        cleaned_text="Module 07 tests ChromaDB Vector Storage integration. Vectors, metadata, and texts are saved.",
        metadata_json=json.dumps({"author": "ChromaDB Test", "category": "AI"})
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # 2. Run Module 06 Embedding Engine to populate SQLite DocumentChunk records
        embedding_engine.process_document_embedding(db, doc.id)
        db.refresh(doc)
        assert doc.status == "embedded"
        assert doc.chunks > 0

        # 3. Execute Module 07 Vector Storage
        stored_vector_count = vector_storage.store_document_vectors(db, doc.id)
        assert stored_vector_count > 0

        # 4. Verify SQLite status transition to 'indexed'
        db.refresh(doc)
        assert doc.status == "indexed"

        # 5. Fetch vectors info from ChromaDB
        vec_info = vector_storage.get_document_vectors(doc.id)
        assert vec_info["document_id"] == doc.id
        assert vec_info["total_vectors"] == stored_vector_count
        assert len(vec_info["vectors"]) == stored_vector_count
        assert vec_info["vectors"][0]["embedding_dimension"] == 384

        # 6. Test vector deletion from ChromaDB
        del_success = vector_storage.delete_document_vectors(doc.id)
        assert del_success is True

        post_del_info = vector_storage.get_document_vectors(doc.id)
        assert post_del_info["total_vectors"] == 0

    finally:
        db.delete(doc)
        db.commit()


def test_vector_db_api_endpoints(setup_db):
    db = setup_db
    unique_fn = f"api_vector_doc_{uuid.uuid4().hex[:8]}.txt"
    doc = Document(
        filename=unique_fn,
        original_filename="api_vector_doc.txt",
        filepath=f"uploads/{unique_fn}",
        filetype="txt",
        filesize=500,
        status="processed",
        extracted_text="FastAPI ChromaDB endpoints test for Module 07.",
        cleaned_text="FastAPI ChromaDB endpoints test for Module 07."
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # Test stats endpoint
        res_stats = client.get("/api/v1/vector-db/stats")
        assert res_stats.status_code == 200
        stats_data = res_stats.json()
        assert stats_data["success"] is True
        assert "chroma_collection_name" in stats_data["data"]

        # Test collections list endpoint
        res_colls = client.get("/api/v1/vector-db/collections")
        assert res_colls.status_code == 200
        colls_data = res_colls.json()
        assert colls_data["success"] is True
        assert colls_data["data"]["total_collections"] > 0

        # Generate embeddings and store vectors
        embedding_engine.process_document_embedding(db, doc.id)
        vector_storage.store_document_vectors(db, doc.id)

        # Test get document vectors endpoint
        res_doc_vecs = client.get(f"/api/v1/vector-db/documents/{doc.id}")
        assert res_doc_vecs.status_code == 200
        doc_vecs_data = res_doc_vecs.json()
        assert doc_vecs_data["success"] is True
        assert doc_vecs_data["data"]["total_vectors"] > 0

    finally:
        db.delete(doc)
        db.commit()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
