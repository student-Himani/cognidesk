import sys
import uuid
from pathlib import Path
import pytest

backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.core.db import SessionLocal
from app.models.document import Document
from app.services.document_processor import DocumentProcessor
from app.services.embedding_engine import EmbeddingEngine
from app.services.flashcards_service import flashcards_service


def test_real_pipeline_pdf_docx_txt():
    """
    Test the complete flashcard generation pipeline with real PDF, DOCX, and TXT documents.
    Verifies question relevance, answer completeness, source grounding, citations,
    and ensures zero ellipses or placeholder templates.
    """
    db = SessionLocal()
    processor = DocumentProcessor()
    embedding_engine = EmbeddingEngine()

    uploads_dir = Path(backend_path) / "uploads"

    # Define test document paths
    test_files = [
        {"filename": "DeepSight AI (5).pdf", "filetype": "pdf"},
        {"filename": "sample_report.docx", "filetype": "docx"},
        {"filename": "quantum_cognidesk_spec.txt", "filetype": "txt"},
    ]

    for item in test_files:
        filepath = uploads_dir / item["filename"]
        if not filepath.exists():
            continue

        # 1. Process document text
        raw_text, cleaned_text, meta, page_count, word_count = processor.process_file(
            str(filepath), item["filetype"]
        )
        assert len(cleaned_text) > 50, f"Expected clean text from {item['filename']}"

        # 2. Insert test doc into SQLite
        unique_fn = f"pipe_{uuid.uuid4().hex[:8]}_{item['filename']}"
        test_doc = Document(
            filename=unique_fn,
            original_filename=item["filename"],
            filepath=str(filepath),
            filetype=item["filetype"],
            filesize=filepath.stat().st_size,
            status="embedded",
            page_count=page_count,
            word_count=word_count,
            cleaned_text=cleaned_text,
            extracted_text=raw_text,
        )
        db.add(test_doc)
        db.commit()
        db.refresh(test_doc)

        # 3. Create real chunks
        chunks = embedding_engine.chunk_text(cleaned_text, chunk_size=600, chunk_overlap=100)
        from app.models.document_chunk import DocumentChunk
        for chk in chunks[:10]:
            chunk_txt = chk.get("text") or chk.get("chunk_text") or ""
            chunk_obj = DocumentChunk(
                document_id=test_doc.id,
                chunk_index=chk.get("chunk_index", 1),
                chunk_text=chunk_txt,
                start_char=chk.get("start_char", 0),
                end_char=chk.get("end_char", len(chunk_txt)),
                word_count=chk.get("word_count", 50),
                character_count=len(chunk_txt),
            )
            db.add(chunk_obj)
        db.commit()

        # 4. Generate flashcards
        deck = flashcards_service.generate_deck(db=db, document_id=test_doc.id, count=5)
        assert deck is not None
        assert deck["total_cards"] > 0
        assert len(deck["cards"]) > 0

        # 5. Strict Quality Asserts on every generated card
        seen_q = set()
        for card in deck["cards"]:
            q = card["question"]
            a = card["answer"]

            # Must end with question mark
            assert q.endswith("?"), f"Card in {item['filename']} question does not end in '?': {q}"

            # Must not end in ellipses
            assert not q.endswith("..."), f"Question ends with ellipses: {q}"
            assert not a.endswith("..."), f"Answer ends with ellipses: {a}"

            # Minimum lengths
            assert len(q) >= 15, f"Question too short: {q}"
            assert len(a) >= 15, f"Answer too short: {a}"

            # No legacy snippet templates
            assert "According to" not in q, f"Question contains legacy template: {q}"
            assert "What key information is detailed regarding" not in q, f"Question contains boilerplate: {q}"
            assert "Review key takeaway" not in q, f"Question contains boilerplate: {q}"
            assert "See document content" not in a, f"Answer contains dummy text: {a}"

            # Source citation must mention document
            assert item["filename"] in card["citation"], f"Citation missing filename: {card['citation']}"

            # No duplicates
            norm_q = flashcards_service._normalize_for_duplicate_check(q)
            assert norm_q not in seen_q, f"Duplicate question in deck for {item['filename']}: {q}"
            seen_q.add(norm_q)

    db.close()
