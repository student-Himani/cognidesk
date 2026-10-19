import os
import sys
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal
from app.services.suggestion_service import suggestion_service
from app.services.rag_service import rag_service
from app.services.providers.base import LLMResponse, CloudProviderError


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_suggestion_cleaning():
    """Verify suggestion sanitation, stripping of numbers/bullets, and ending with '?'."""
    dirty_lines = [
        "1. What is the architecture of CogniDesk?",
        "- Can you explain vector search?",
        "* How does offline OCR work in EasyOCR?",
        "\"Is ChromaDB persistent across sessions?\"",
        "Tell me more about chunking",
        "bad"  # too short
    ]
    cleaned = []
    for line in dirty_lines:
        res = suggestion_service._clean_question(line)
        if res:
            cleaned.append(res)

    assert len(cleaned) == 5
    assert cleaned[0] == "What is the architecture of CogniDesk?"
    assert cleaned[1] == "Can you explain vector search?"
    assert cleaned[2] == "How does offline OCR work in EasyOCR?"
    assert cleaned[3] == "Is ChromaDB persistent across sessions?"
    assert cleaned[4] == "Tell me more about chunking?"
    for q in cleaned:
        assert q.endswith("?")


def test_suggestion_service_with_mocked_llm(db_session):
    """Test suggestion_service generates 2-4 questions using active LLM provider."""
    mock_llm_response = LLMResponse(
        text=(
            "What embedding model is used for 384-dimensional vectors?\n"
            "How does ChromaDB manage workspace-isolated collections?\n"
            "Can EasyOCR process handwritten notes accurately?\n"
        ),
        model="qwen2.5:3b",
        provider="ollama"
    )

    with patch("app.services.suggestion_service.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate.return_value = mock_llm_response
        mock_get_provider.return_value = mock_provider

        suggestions = suggestion_service.generate_suggestions(
            db=db_session,
            query="Tell me about CogniDesk architecture",
            answer="CogniDesk is an offline AI workspace using FastAPI, ChromaDB, and local Ollama.",
            mode="document",
            citations=[{"docName": "architecture.pdf", "score": "94% Match"}]
        )

        assert isinstance(suggestions, list)
        assert 2 <= len(suggestions) <= 4
        assert "What embedding model is used for 384-dimensional vectors?" in suggestions
        for q in suggestions:
            assert q.endswith("?")


def test_suggestion_service_fallback_on_error(db_session):
    """Verify suggestion_service gracefully returns contextual fallbacks if LLM fails."""
    with patch("app.services.suggestion_service.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate.side_effect = CloudProviderError("Ollama daemon unreachable", status_code=503)
        mock_get_provider.return_value = mock_provider

        # Document mode with citations
        doc_suggestions = suggestion_service.generate_suggestions(
            db=db_session,
            query="Explain semantic search",
            answer="Semantic search uses cosine similarity over document embeddings.",
            mode="document",
            citations=[{"docName": "search_guide.pdf"}]
        )

        assert isinstance(doc_suggestions, list)
        assert len(doc_suggestions) >= 2
        assert any("search_guide.pdf" in q for q in doc_suggestions)

        # Normal mode
        normal_suggestions = suggestion_service.generate_suggestions(
            db=db_session,
            query="Hello",
            answer="Hi! I am CogniDesk AI.",
            mode="normal"
        )
        assert isinstance(normal_suggestions, list)
        assert len(normal_suggestions) >= 2


def test_chat_suggestions_endpoint(client):
    """Test POST /api/v1/chat/suggestions HTTP endpoint."""
    payload = {
        "query": "How are embeddings stored?",
        "answer": "Embeddings are stored in ChromaDB vector storage locally on disk.",
        "mode": "document",
        "messages": [
            {"sender": "user", "text": "What is CogniDesk?"},
            {"sender": "assistant", "text": "An offline AI document assistant."}
        ],
        "citations": [{"docName": "database_design.docx", "score": "92%"}]
    }

    res = client.post("/api/v1/chat/suggestions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "suggestions" in data
    assert isinstance(data["suggestions"], list)
    assert 2 <= len(data["suggestions"]) <= 4
    for q in data["suggestions"]:
        assert isinstance(q, str)
        assert q.endswith("?")


def test_rag_pipeline_with_conversation_context(db_session):
    """Test that conversation history messages are properly integrated into prompt builder."""
    history = [
        {"sender": "user", "text": "Tell me about offline security."},
        {"sender": "assistant", "text": "CogniDesk runs completely offline with zero data leakage."}
    ]

    sys_prompt, user_prompt = rag_service.build_prompt(
        query="Can you explain that more?",
        context_chunks=[{"title": "security.pdf", "chunkIndex": "Chunk #1", "score": "95%", "snippet": "All vectors remain local."}],
        conversation_history=history
    )

    assert "=== RECENT CONVERSATION HISTORY ===" in user_prompt
    assert "User: Tell me about offline security." in user_prompt
    assert "Assistant: CogniDesk runs completely offline" in user_prompt
    assert "USER QUESTION: Can you explain that more?" in user_prompt
    assert "=== RETRIEVED DOCUMENT CONTEXT ===" in user_prompt


def test_document_citations_tailored_suggestions(db_session):
    """Verify that suggestions tailor specifically to referenced document names."""
    citations = [
        {"docName": "Distributed_Systems_Guide.pdf", "score": "98%"},
        {"docName": "Database_Internals.docx", "score": "91%"}
    ]
    suggestions = suggestion_service._get_contextual_defaults(
        query="Explain consensus algorithms",
        answer="Raft and Paxos are popular consensus protocols.",
        mode="document",
        citations=citations
    )

    assert isinstance(suggestions, list)
    assert len(suggestions) >= 2
    assert any("Distributed_Systems_Guide.pdf" in q for q in suggestions)


def test_chat_suggestions_endpoint_handles_missing_fields(client):
    """Test POST /api/v1/chat/suggestions gracefully handles minimal payload."""
    minimal_payload = {
        "query": "Tell me more"
    }
    res = client.post("/api/v1/chat/suggestions", json=minimal_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert isinstance(data["suggestions"], list)
    assert len(data["suggestions"]) >= 2


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  Running Module 27 Suggestions & Chat UX Test Suite...")
    print("=" * 70)
    sys.exit(pytest.main([__file__, "-v", "-s"]))

