import sys
import uuid
from pathlib import Path
import pytest

backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.flashcard import FlashcardDeck, Flashcard

client = TestClient(app)


def test_get_flashcard_decks_empty_or_list():
    response = client.get("/api/v1/flashcards/decks")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)


def test_generate_flashcards_from_document():
    db = SessionLocal()
    unique_fn = f"test_flashcard_doc_{uuid.uuid4().hex[:8]}.txt"
    try:
        # Create a test document with chunks
        test_doc = Document(
            filename=unique_fn,
            original_filename="SQL_Fundamentals_Guide.txt",
            filepath=f"/tmp/{unique_fn}",
            filetype="txt",
            filesize=2048,
            status="embedded",
            chunks=2,
            page_count=1,
            word_count=200,
            cleaned_text=(
                "Structured Query Language (SQL) is a standard database language used to manage relational databases. "
                "The SELECT statement is used to retrieve data from a database. "
                "The WHERE clause filters records based on specified conditions. "
                "JOIN operations combine rows from two or more tables based on a related column between them."
            ),
        )
        db.add(test_doc)
        db.commit()
        db.refresh(test_doc)

        chunk1 = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=1,
            chunk_text="Structured Query Language (SQL) is a standard database language used to manage relational databases.",
            start_char=0,
            end_char=100,
            word_count=15,
            character_count=100,
        )
        chunk2 = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=2,
            chunk_text="The SELECT statement is used to retrieve data from a database. JOIN operations combine rows from two or more tables.",
            start_char=101,
            end_char=220,
            word_count=20,
            character_count=119,
        )
        db.add_all([chunk1, chunk2])
        db.commit()

        # Generate 10 flashcards
        gen_res = client.post(
            "/api/v1/flashcards/generate",
            json={"document_id": test_doc.id, "count": 10},
        )
        assert gen_res.status_code == 201
        deck = gen_res.json()["data"]

        assert deck["document_id"] == test_doc.id
        assert deck["total_cards"] == 10
        assert len(deck["cards"]) == 10
        assert deck["completed_cards"] == 0
        assert deck["correct_count"] == 0

        first_card = deck["cards"][0]
        assert "question" in first_card and len(first_card["question"]) > 0
        assert "answer" in first_card and len(first_card["answer"]) > 0
        assert first_card["source_filename"] == "SQL_Fundamentals_Guide.txt"
        assert "citation" in first_card and "SQL_Fundamentals_Guide.txt" in first_card["citation"]
        assert first_card["user_answer_status"] == "unanswered"

        deck_id = deck["id"]
        card_id = first_card["id"]

        # Test card progress update: mark as correct
        prog_res = client.post(
            f"/api/v1/flashcards/cards/{card_id}/progress",
            json={"status": "correct"},
        )
        assert prog_res.status_code == 200
        prog_data = prog_res.json()["data"]
        assert prog_data["user_answer_status"] == "correct"
        assert prog_data["deck_stats"]["correct_count"] == 1
        assert prog_data["deck_stats"]["completed_cards"] == 1
        assert prog_data["deck_stats"]["accuracy"] == 100

        # Mark another card as incorrect if available
        if len(deck["cards"]) > 1:
            second_card_id = deck["cards"][1]["id"]
            prog2_res = client.post(
                f"/api/v1/flashcards/cards/{second_card_id}/progress",
                json={"status": "incorrect"},
            )
            assert prog2_res.status_code == 200
            prog2_data = prog2_res.json()["data"]
            assert prog2_data["deck_stats"]["correct_count"] == 1
            assert prog2_data["deck_stats"]["incorrect_count"] == 1
            assert prog2_data["deck_stats"]["completed_cards"] == 2
            assert prog2_data["deck_stats"]["accuracy"] == 50

        # Test Reset Progress
        reset_res = client.post(f"/api/v1/flashcards/decks/{deck_id}/reset")
        assert reset_res.status_code == 200
        reset_deck = reset_res.json()["data"]
        assert reset_deck["completed_cards"] == 0
        assert reset_deck["correct_count"] == 0
        assert all(c["user_answer_status"] == "unanswered" for c in reset_deck["cards"])

        # Test Delete Deck
        del_res = client.delete(f"/api/v1/flashcards/decks/{deck_id}")
        assert del_res.status_code == 200

        # Verify 404 on deleted deck
        get_res = client.get(f"/api/v1/flashcards/decks/{deck_id}")
        assert get_res.status_code == 404

    finally:
        db.close()
