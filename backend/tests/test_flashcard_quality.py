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
from app.services.flashcards_service import flashcards_service

client = TestClient(app)


def test_card_validation_rejects_ellipses_and_truncated_snippets():
    """
    Regression Test:
    Never accept questions or answers ending in '...', or snippet-quoting boilerplate.
    """
    seen = set()

    # 1. Reject questions ending in '...'
    card1 = {
        "question": "What is the primary function of database indexing...?",
        "answer": "Database indexing creates fast lookup pointers to table rows.",
        "topic": "Databases",
    }
    is_valid, reason = flashcards_service._is_valid_card(card1, seen)
    # The question ends in '...?' or contains ellipses
    # If ends in ellipses:
    card1_dots = {
        "question": "What is the primary function of database indexing...",
        "answer": "Database indexing creates fast lookup pointers to table rows.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card1_dots, seen)
    assert not is_valid
    assert "ellipses" in reason or "question mark" in reason

    # 2. Reject answers ending in '...'
    card2 = {
        "question": "How does asymmetric cryptography secure communication?",
        "answer": "It uses a mathematically linked public and private key pair to encrypt...",
        "topic": "Security",
    }
    is_valid, reason = flashcards_service._is_valid_card(card2, seen)
    assert not is_valid
    assert "ellipses" in reason

    # 3. Reject legacy template questions quoting truncated snippets
    card3 = {
        "question": 'According to SQL_Guide.txt, what is the significance of: "Structured Query Language..."?',
        "answer": "Structured Query Language manages relational databases.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card3, seen)
    assert not is_valid
    assert "banned placeholder" in reason or "truncated snippet" in reason

    card4 = {
        "question": 'What key information is detailed regarding: "The SELECT statement..."?',
        "answer": "The SELECT statement retrieves data from relational tables.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card4, seen)
    assert not is_valid
    assert "banned placeholder" in reason or "truncated snippet" in reason


def test_card_validation_rejects_schema_leakage_and_placeholders():
    """
    Regression Test:
    Ensure schema examples, dummy text, and generic non-questions are rejected.
    """
    seen = set()

    # Schema placeholder example
    card1 = {
        "question": "...",
        "answer": "...",
    }
    is_valid, _ = flashcards_service._is_valid_card(card1, seen)
    assert not is_valid

    # Dummy text fallback
    card2 = {
        "question": "Review Question",
        "answer": "See document content.",
    }
    is_valid, _ = flashcards_service._is_valid_card(card2, seen)
    assert not is_valid

    # Generic section question
    card3 = {
        "question": "What is discussed in Chunk 1 of the document?",
        "answer": "Chunk 1 explains the system architecture.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card3, seen)
    assert not is_valid
    assert "banned placeholder" in reason

    # Valid card should pass
    card_valid = {
        "question": "What is the primary role of the ACID properties in relational databases?",
        "answer": "ACID properties ensure reliable and predictable database transactions despite errors or crashes.",
        "topic": "Databases",
    }
    is_valid, reason = flashcards_service._is_valid_card(card_valid, seen)
    assert is_valid, f"Expected valid card to pass, but got reason: {reason}"


def test_card_validation_rejects_duplicates():
    """
    Regression Test:
    Duplicate or near-duplicate cards must be detected and rejected.
    """
    seen = set()
    card1 = {
        "question": "What is the function of a neural network activation function?",
        "answer": "It introduces non-linearity to help the model learn complex data patterns.",
    }
    is_valid, _ = flashcards_service._is_valid_card(card1, seen)
    assert is_valid
    norm = flashcards_service._normalize_for_duplicate_check(card1["question"])
    seen.add(norm)

    # Identical question
    card_dup = {
        "question": "What is the function of a neural network activation function?",
        "answer": "An activation function introduces non-linearity.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card_dup, seen)
    assert not is_valid
    assert "Duplicate" in reason or "similar" in reason

    # Near-duplicate with punctuation difference
    card_near_dup = {
        "question": "What is the function of a neural network activation function???",
        "answer": "Non-linear transformations.",
    }
    is_valid, reason = flashcards_service._is_valid_card(card_near_dup, seen)
    assert not is_valid


def test_extract_cards_json_resilient_parsing():
    """
    Regression Test:
    Parsing must handle markdown code blocks, bracket substrings, and regex objects.
    """
    markdown_payload = """
    Here are the generated flashcards:
    ```json
    [
      {
        "question": "What is the primary role of a database index?",
        "answer": "A database index creates a specialized data structure that speeds up query retrieval operations.",
        "topic": "Database Architecture",
        "chunk_index": 1,
        "citation": "Chunk #1"
      },
      {
        "question": "How do B-tree indexes balance search performance?",
        "answer": "B-tree indexes maintain a sorted balanced tree structure to provide logarithmic search and insertion times.",
        "topic": "Index Types",
        "chunk_index": 2,
        "citation": "Chunk #2"
      }
    ]
    ```
    I hope this helps!
    """
    cards = flashcards_service._extract_cards_json(markdown_payload)
    assert len(cards) == 2
    assert cards[0]["question"].endswith("?")
    assert not cards[0]["answer"].endswith("...")


def test_empty_or_failed_document_raises_informative_error():
    """
    Regression Test:
    If a document extraction failed or extracted text is empty, the system must explain
    the issue with a clear error rather than generating fake placeholder cards.
    """
    db = SessionLocal()
    try:
        # Document with status="failed"
        failed_doc = Document(
            filename=f"failed_{uuid.uuid4().hex[:6]}.pdf",
            original_filename="corrupted_scan.pdf",
            filepath="/tmp/fake.pdf",
            filetype="pdf",
            filesize=1024,
            status="failed",
            error_message="OCR engine timed out reading scanned PDF pages.",
        )
        db.add(failed_doc)
        db.commit()
        db.refresh(failed_doc)

        with pytest.raises(ValueError) as excinfo:
            flashcards_service.generate_deck(db, failed_doc.id, count=10)
        assert "failed extraction" in str(excinfo.value).lower()
        assert "ocr engine timed out" in str(excinfo.value).lower()

        # Document with empty text
        empty_doc = Document(
            filename=f"empty_{uuid.uuid4().hex[:6]}.txt",
            original_filename="empty_whitepaper.txt",
            filepath="/tmp/empty.txt",
            filetype="txt",
            filesize=10,
            status="indexed",
            cleaned_text="   \n\n  ",
            extracted_text="   \n\n  ",
        )
        db.add(empty_doc)
        db.commit()
        db.refresh(empty_doc)

        with pytest.raises(ValueError) as excinfo2:
            flashcards_service.generate_deck(db, empty_doc.id, count=10)
        assert "insufficient extracted text" in str(excinfo2.value).lower() or "no extractable text" in str(excinfo2.value).lower()

    finally:
        db.close()


def test_rule_based_substantive_card_generation():
    """
    Regression Test:
    Rule-based extraction must extract complete, declarative concept sentences into
    grammatically correct questions ending with '?' and complete answers without ellipses.
    """
    chunks = [
        {
            "index": 1,
            "text": (
                "Kubernetes is defined as an open-source container orchestration system for automating application deployment. "
                "The primary purpose of Pods is to serve as the smallest deployable units in a Kubernetes cluster. "
                "Namespaces provide a mechanism for isolating groups of resources within a single physical cluster."
            ),
            "citation": "Chunk #1",
        }
    ]
    seen = set()
    cards = flashcards_service._generate_substantive_rule_based_cards(
        chunks=chunks,
        count=3,
        doc_filename="Kubernetes_Architecture.txt",
        seen_questions=seen,
    )
    assert len(cards) >= 2
    for c in cards:
        assert c["question"].endswith("?"), f"Question '{c['question']}' must end with '?'"
        assert not c["question"].endswith("..."), "Question must not end with '...'"
        assert not c["answer"].endswith("..."), "Answer must not end with '...'"
        assert len(c["question"]) >= 15
        assert len(c["answer"]) >= 20
        assert "According to" not in c["question"]
        assert "What key information is detailed regarding" not in c["question"]


def test_deck_regeneration_preserves_deck_identity():
    """
    Regression Test:
    POST /decks/{deck_id}/regenerate must preserve deck ID, document ID, and title structure
    while replacing existing cards with valid flashcards.
    """
    db = SessionLocal()
    try:
        doc = Document(
            filename=f"regen_{uuid.uuid4().hex[:6]}.txt",
            original_filename="Network_Protocols.txt",
            filepath="/tmp/net.txt",
            filetype="txt",
            filesize=1024,
            status="embedded",
            cleaned_text=(
                "Transmission Control Protocol (TCP) is a connection-oriented protocol that ensures reliable byte stream delivery. "
                "User Datagram Protocol (UDP) is a connectionless transport protocol that prioritizes speed over guaranteed delivery. "
                "Domain Name System (DNS) is defined as a hierarchical naming system that translates human-readable hostnames into IP addresses."
            ),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        chunk = DocumentChunk(
            document_id=doc.id,
            chunk_index=1,
            chunk_text=doc.cleaned_text,
            start_char=0,
            end_char=len(doc.cleaned_text),
            word_count=50,
            character_count=len(doc.cleaned_text),
        )
        db.add(chunk)
        db.commit()

        # Create deck with a legacy bad card
        deck = FlashcardDeck(
            workspace_id=1,
            title="Legacy Bad Deck",
            document_id=doc.id,
            document_name="Network_Protocols.txt",
            total_cards=1,
            completed_cards=0,
        )
        db.add(deck)
        db.commit()
        db.refresh(deck)

        bad_card = Flashcard(
            deck_id=deck.id,
            document_id=doc.id,
            question='According to Network_Protocols.txt, what is the significance of: "Transmission Control Protocol..."?',
            answer="Transmission Control Protocol (TCP) is a connection-oriented protocol...",
            topic="Review",
            source_filename="Network_Protocols.txt",
            chunk_index=1,
            citation="Network_Protocols.txt • Chunk #1",
        )
        db.add(bad_card)
        db.commit()

        original_deck_id = deck.id

        # Call regenerate endpoint
        res = client.post(f"/api/v1/flashcards/decks/{original_deck_id}/regenerate")
        assert res.status_code == 200
        regen_data = res.json()["data"]

        # Assert deck identity is preserved
        assert regen_data["id"] == original_deck_id
        assert regen_data["document_id"] == doc.id
        assert len(regen_data["cards"]) >= 1

        # Assert no regenerated card has ellipses or old boilerplate
        for card in regen_data["cards"]:
            assert card["deck_id"] == original_deck_id
            assert not card["question"].endswith("...")
            assert not card["answer"].endswith("...")
            assert card["question"].endswith("?")
            assert "According to" not in card["question"]
            assert "What key information is detailed regarding" not in card["question"]

    finally:
        db.close()


def test_card_regeneration_updates_single_card():
    """
    Regression Test:
    POST /cards/{card_id}/regenerate must update a specific card's question and answer.
    """
    db = SessionLocal()
    try:
        doc = Document(
            filename=f"card_regen_{uuid.uuid4().hex[:6]}.txt",
            original_filename="Operating_Systems.txt",
            filepath="/tmp/os.txt",
            filetype="txt",
            filesize=1024,
            status="embedded",
            cleaned_text=(
                "A process is defined as an instance of a program in execution containing program code and current activity. "
                "Virtual memory provides an idealized abstraction of storage resources for each process."
            ),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        chunk = DocumentChunk(
            document_id=doc.id,
            chunk_index=1,
            chunk_text=doc.cleaned_text,
            start_char=0,
            end_char=len(doc.cleaned_text),
            word_count=35,
            character_count=len(doc.cleaned_text),
        )
        db.add(chunk)

        deck = FlashcardDeck(
            workspace_id=1,
            title="OS Concepts",
            document_id=doc.id,
            document_name="Operating_Systems.txt",
            total_cards=1,
        )
        db.add(deck)
        db.commit()
        db.refresh(deck)

        card = Flashcard(
            deck_id=deck.id,
            document_id=doc.id,
            question="What is the significance of: 'A process is defined as an instance...'?",
            answer="A process is an instance of a program...",
            source_filename="Operating_Systems.txt",
            chunk_index=1,
        )
        db.add(card)
        db.commit()
        db.refresh(card)

        original_card_id = card.id

        # Call card regenerate endpoint
        res = client.post(f"/api/v1/flashcards/cards/{original_card_id}/regenerate")
        assert res.status_code == 200
        card_data = res.json()["data"]

        assert card_data["id"] == original_card_id
        assert card_data["deck_id"] == deck.id
        assert card_data["question"].endswith("?")
        assert not card_data["question"].endswith("...")
        assert not card_data["answer"].endswith("...")
        assert "significance of:" not in card_data["question"]

    finally:
        db.close()
