import os
import sys
import json
import uuid
import subprocess
from pathlib import Path

# Auto-bootstrap: If executed with system Python without required dependencies,
# automatically relaunch with the project's backend virtual environment Python.
_root_dir = Path(__file__).resolve().parent.parent
_venv_python = _root_dir / "backend" / "venv" / "Scripts" / "python.exe"
if _venv_python.exists() and Path(sys.executable).resolve() != _venv_python.resolve():
    try:
        import pytest
        import easyocr
    except ImportError:
        # Transparently re-exec in the project virtualenv
        _res = subprocess.run([str(_venv_python)] + sys.argv)
        sys.exit(_res.returncode)

import pytest
from PIL import Image, ImageDraw, ImageFont

# Add backend to sys.path
backend_path = _root_dir / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.core.db import engine, Base, SessionLocal
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.workspace import Workspace
from app.services.document_processor import document_processor
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.search_service import search_service
from app.services.rag_service import rag_service


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Ensure default workspace exists
    ws = db.query(Workspace).filter(Workspace.id == 1).first()
    if not ws:
        ws = Workspace(id=1, name="Default Workspace", description="Default")
        db.add(ws)
        db.commit()
    yield db
    db.close()


@pytest.fixture
def sample_ocr_image(tmp_path):
    """Generates a high-contrast synthetic image containing clear English text."""
    img_path = str(tmp_path / "offline_ocr_sample.png")
    width, height = 700, 200
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Render high-contrast text
    text_line1 = "COGNIDESK OFFLINE DOCUMENT OCR"
    text_line2 = "LOCAL VECTOR EMBEDDINGS AND SEMANTIC SEARCH"
    draw.text((30, 40), text_line1, fill=(0, 0, 0))
    draw.text((30, 100), text_line2, fill=(0, 0, 0))

    img.save(img_path, "PNG")
    yield img_path
    if os.path.exists(img_path):
        try:
            os.remove(img_path)
        except Exception:
            pass


def test_offline_ocr_direct_processing(sample_ocr_image):
    """Test that DocumentProcessor correctly reads and extracts text from an image."""
    raw_text, cleaned_text, metadata, page_count, word_count = document_processor.process_file(
        sample_ocr_image, "png"
    )

    assert metadata["file_type"] == "IMAGE_OCR"
    assert metadata["image_width"] == 700
    assert metadata["image_height"] == 200
    assert metadata["image_format"] == "PNG"
    assert page_count == 1
    assert word_count > 0

    # Verify extracted text contains key words
    upper_text = cleaned_text.upper()
    assert "COGNIDESK" in upper_text or "OFFLINE" in upper_text or "DOCUMENT" in upper_text
    assert metadata.get("ocr_engine") == "EasyOCR (Offline)"
    assert metadata.get("ocr_confidence", 0) > 0


def test_offline_ocr_database_pipeline_and_search(setup_db, sample_ocr_image):
    """
    Test full end-to-end pipeline:
    Image File -> SQLite extract_and_process -> Embedding Engine -> ChromaDB -> Semantic Search -> RAG context
    """
    db = setup_db
    unique_fn = f"ocr_test_{uuid.uuid4().hex[:8]}.png"

    # 1. Create Document record in DB
    doc = Document(
        workspace_id=1,
        filename=unique_fn,
        original_filename="offline_test_diagram.png",
        filepath=sample_ocr_image,
        filetype="png",
        filesize=os.path.getsize(sample_ocr_image),
        status="uploaded",
        chunks=0,
        page_count=0,
        word_count=0
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        # 2. Extract and Process via DocumentProcessor (Module 05 / 19)
        processed_doc = document_processor.extract_and_process(db, doc.id)
        assert processed_doc.status == "processed"
        assert processed_doc.word_count > 0
        assert processed_doc.cleaned_text is not None
        meta = json.loads(processed_doc.metadata_json)
        assert meta["ocr_engine"] == "EasyOCR (Offline)"

        # 3. Generate Embeddings (Module 06)
        num_chunks, num_embeddings = embedding_engine.process_document_embedding(db, doc.id)
        assert num_chunks > 0
        assert num_embeddings == num_chunks
        db.refresh(doc)
        assert doc.status == "embedded"

        # 4. Upsert Vectors to ChromaDB (Module 07)
        num_vectors = vector_storage.store_document_vectors(db, doc.id)
        assert num_vectors == num_chunks
        db.refresh(doc)
        assert doc.status == "indexed"

        # 5. Semantic Search verification (Module 08)
        search_res = search_service.execute_search(
            db=db,
            query="CogniDesk Offline OCR semantic search",
            workspace_id=1,
            top_k=5,
            search_mode="semantic"
        )
        assert len(search_res["results"]) > 0
        matched_filenames = [r["citation"]["filename"] for r in search_res["results"]]
        assert "offline_test_diagram.png" in matched_filenames or unique_fn in matched_filenames

        # 6. Verify Workspace Isolation
        # Searching in another workspace (workspace_id=999) should NOT find this document
        search_res_isolated = search_service.execute_search(
            db=db,
            query="CogniDesk Offline OCR semantic search",
            workspace_id=999,
            top_k=5,
            search_mode="semantic"
        )
        isolated_filenames = [r["citation"]["filename"] for r in search_res_isolated["results"]]
        assert "offline_test_diagram.png" not in isolated_filenames and unique_fn not in isolated_filenames

    finally:
        # Cleanup vectors and document
        vector_storage.delete_document_vectors(doc.id)
        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()
        db.query(Document).filter(Document.id == doc.id).delete()
        db.commit()


def run_standalone():
    """Direct standalone runner allowing manual or CI invocation without pytest CLI."""
    import tempfile
    print("\n" + "=" * 72)
    print("  COGNIDESK OFFLINE OCR DIAGNOSTIC & VERIFICATION RUNNER")
    print("  Engine: EasyOCR (100% Local / Offline)")
    print("=" * 72)

    # 1. Setup DB
    print("\n[Step 1/3] Initializing Database & Ensuring Workspace #1...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    ws = db.query(Workspace).filter(Workspace.id == 1).first()
    if not ws:
        ws = Workspace(id=1, name="Default Workspace", description="Default")
        db.add(ws)
        db.commit()
    print("  -> Database tables verified. Default workspace active.")

    # 2. Generate synthetic image
    print("\n[Step 2/3] Generating synthetic high-contrast test image...")
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "offline_ocr_sample.png")
        width, height = 700, 200
        img = Image.new("RGB", (width, height), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((30, 40), "COGNIDESK OFFLINE DOCUMENT OCR", fill=(0, 0, 0))
        draw.text((30, 100), "LOCAL VECTOR EMBEDDINGS AND SEMANTIC SEARCH", fill=(0, 0, 0))
        img.save(img_path, "PNG")
        print(f"  -> Generated test image at {img_path}")

        # Run direct OCR
        print("\n  -> Executing EasyOCR text extraction...")
        test_offline_ocr_direct_processing(img_path)
        print("  [PASS] Direct EasyOCR extraction passed.")

        # Run end-to-end pipeline
        print("\n[Step 3/3] Executing End-to-End Image Ingestion -> Vector Indexing -> Search...")
        test_offline_ocr_database_pipeline_and_search(db, img_path)
        print("  [PASS] Full SQLite -> ChromaDB -> Semantic Search pipeline passed.")

    db.close()
    print("\n" + "=" * 72)
    print("  [SUCCESS] All Offline OCR tests passed successfully!")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    if "--standalone" in sys.argv:
        run_standalone()
    else:
        print("\n" + "=" * 72)
        print("  Running tests/test_offline_ocr.py via pytest...")
        print("=" * 72)
        exit_code = pytest.main([__file__, "-v", "-s"])
        if exit_code != 0:
            print(f"Pytest exited with status code: {exit_code}")
        sys.exit(exit_code)

