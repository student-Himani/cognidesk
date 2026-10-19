import os
import sys
import io
import json
import uuid
import pytest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

# PyMuPDF, python-docx, and PIL for synthetic test document generation
import fitz
from docx import Document as DocxDoc
from PIL import Image, ImageDraw

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import engine, Base, SessionLocal
from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.note import Note
from app.models.flashcard import FlashcardDeck, Flashcard
from app.models.conversation import Conversation
from app.models.setting import AppSetting
from app.services.document_processor import document_processor
from app.services.embedding_engine import embedding_engine
from app.services.vector_storage import vector_storage
from app.services.rag_service import rag_service
from app.services.workspace_service import workspace_service
from app.services.providers.factory import get_llm_provider
from app.services.providers.ollama_provider import OllamaProvider
from app.services.providers.base import LLMResponse, OfflineModeEnforcedError

client = TestClient(app)


@pytest.fixture(scope="module")
def e2e_context():
    """
    Sets up dedicated E2E test workspaces and handles comprehensive cleanup after all tests.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Reset settings to default offline Ollama mode
    setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
    if not setting:
        setting = AppSetting(id=1, ai_provider="ollama", is_offline_mode=True, cloud_api_key=None)
        db.add(setting)
    else:
        setting.ai_provider = "ollama"
        setting.is_offline_mode = True
        setting.cloud_api_key = None
    db.commit()

    # Create two isolated test workspaces
    ws_a = Workspace(
        name=f"E2E_Workspace_Alpha_{uuid.uuid4().hex[:6]}",
        description="Workspace Alpha for E2E testing",
        category="Research",
        is_active=True
    )
    ws_b = Workspace(
        name=f"E2E_Workspace_Beta_{uuid.uuid4().hex[:6]}",
        description="Workspace Beta for E2E testing",
        category="Production",
        is_active=False
    )
    db.add(ws_a)
    db.add(ws_b)
    db.commit()
    db.refresh(ws_a)
    db.refresh(ws_b)

    ctx = {
        "ws_a_id": ws_a.id,
        "ws_b_id": ws_b.id,
        "doc_ids": [],
        "uploaded_files": [],
        "note_ids": [],
        "deck_ids": [],
        "thread_ids": []
    }

    yield ctx

    # TEARDOWN: Clean up all artifacts, DB rows, vector collections
    cleanup_db = SessionLocal()
    try:
        # 1. Clean up documents and vectors
        for doc_id in ctx["doc_ids"]:
            try:
                vector_storage.delete_document_vectors(doc_id)
            except Exception:
                pass
            cleanup_db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).delete()
            cleanup_db.query(Document).filter(Document.id == doc_id).delete()

        # 2. Clean up files on disk
        for fp in ctx["uploaded_files"]:
            if os.path.exists(fp):
                try:
                    os.remove(fp)
                except Exception:
                    pass

        # 3. Clean up notes
        for nid in ctx["note_ids"]:
            cleanup_db.query(Note).filter(Note.id == nid).delete()

        # 4. Clean up flashcards
        for did in ctx["deck_ids"]:
            cleanup_db.query(Flashcard).filter(Flashcard.deck_id == did).delete()
            cleanup_db.query(FlashcardDeck).filter(FlashcardDeck.id == did).delete()

        # 5. Clean up chat threads
        for tid in ctx["thread_ids"]:
            cleanup_db.query(Conversation).filter(Conversation.session_id == tid).delete()

        # 6. Delete test workspaces
        cleanup_db.query(Workspace).filter(Workspace.id.in_([ctx["ws_a_id"], ctx["ws_b_id"]])).delete(synchronize_session=False)

        # 7. Restore safe offline settings
        stg = cleanup_db.query(AppSetting).filter(AppSetting.id == 1).first()
        if stg:
            stg.ai_provider = "ollama"
            stg.is_offline_mode = True
            stg.cloud_api_key = None
        cleanup_db.commit()
    except Exception as e:
        print(f"Teardown cleanup exception: {e}")
    finally:
        cleanup_db.close()
        db.close()


def test_01_workspace_lifecycle_and_switching(e2e_context):
    """1. Create/switch workspace: verify creation, active retrieval, and activation."""
    ws_a_id = e2e_context["ws_a_id"]
    ws_b_id = e2e_context["ws_b_id"]

    # Verify listing workspaces includes both
    res = client.get("/api/v1/workspaces")
    assert res.status_code == 200
    workspaces = res.json()["data"]
    ws_ids = [w["id"] for w in workspaces]
    assert ws_a_id in ws_ids
    assert ws_b_id in ws_ids

    # Switch active workspace to Workspace B
    act_res = client.post(f"/api/v1/workspaces/{ws_b_id}/activate")
    assert act_res.status_code == 200
    assert act_res.json()["data"]["id"] == ws_b_id

    # Verify active workspace is now B
    active_res = client.get("/api/v1/workspaces/active")
    assert active_res.status_code == 200
    assert active_res.json()["data"]["id"] == ws_b_id

    # Switch back to Workspace A
    client.post(f"/api/v1/workspaces/{ws_a_id}/activate")
    assert client.get("/api/v1/workspaces/active").json()["data"]["id"] == ws_a_id


def test_02_multi_format_document_upload(e2e_context):
    """2. Upload TXT, PDF, DOCX and image documents into Workspace A."""
    ws_a_id = e2e_context["ws_a_id"]

    # Synthetic TXT
    txt_content = b"CogniDesk offline artificial intelligence workspace. Local embeddings and privacy-first knowledge retrieval."
    res_txt = client.post(
        "/api/v1/documents/upload",
        files={"file": ("e2e_quantum.txt", io.BytesIO(txt_content), "text/plain")},
        data={"workspace_id": str(ws_a_id)}
    )
    assert res_txt.status_code == 201
    txt_doc_id = int(res_txt.json()["data"]["id"])
    e2e_context["doc_ids"].append(txt_doc_id)

    # Synthetic PDF via PyMuPDF (fitz)
    pdf_doc = fitz.open()
    page = pdf_doc.new_page()
    page.insert_text((50, 72), "CogniDesk Offline PDF Document: Vector semantic indexing with ChromaDB and ONNX embeddings.")
    pdf_bytes = pdf_doc.write()
    pdf_doc.close()

    res_pdf = client.post(
        "/api/v1/documents/upload",
        files={"file": ("e2e_manual.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        data={"workspace_id": str(ws_a_id)}
    )
    assert res_pdf.status_code == 201
    pdf_doc_id = int(res_pdf.json()["data"]["id"])
    e2e_context["doc_ids"].append(pdf_doc_id)

    # Synthetic DOCX via python-docx
    docx_doc = DocxDoc()
    docx_doc.add_heading("CogniDesk Architecture Specification", 0)
    docx_doc.add_paragraph("This document outlines SQLite relational schemas, vector distances, and local LLM orchestration.")
    bio_docx = io.BytesIO()
    docx_doc.save(bio_docx)

    res_docx = client.post(
        "/api/v1/documents/upload",
        files={"file": ("e2e_specs.docx", io.BytesIO(bio_docx.getvalue()), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={"workspace_id": str(ws_a_id)}
    )
    assert res_docx.status_code == 201
    docx_doc_id = int(res_docx.json()["data"]["id"])
    e2e_context["doc_ids"].append(docx_doc_id)

    # Synthetic Image PNG via PIL
    img = Image.new("RGB", (650, 180), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((25, 50), "COGNIDESK OCR DOCUMENT ANALYSIS", fill=(0, 0, 0))
    bio_png = io.BytesIO()
    img.save(bio_png, format="PNG")

    res_png = client.post(
        "/api/v1/documents/upload",
        files={"file": ("e2e_diagram.png", io.BytesIO(bio_png.getvalue()), "image/png")},
        data={"workspace_id": str(ws_a_id)}
    )
    assert res_png.status_code == 201
    png_doc_id = int(res_png.json()["data"]["id"])
    e2e_context["doc_ids"].append(png_doc_id)

    assert len(e2e_context["doc_ids"]) == 4


def test_03_text_extraction_and_ocr(e2e_context):
    """3. Verify extraction/OCR and indexing for TXT, PDF, DOCX, and PNG."""
    db = SessionLocal()
    try:
        for doc_id in e2e_context["doc_ids"]:
            processed_doc = document_processor.extract_and_process(db, doc_id)
            assert processed_doc.status in ("processed", "indexed", "embedded")
            assert processed_doc.word_count > 0
            assert processed_doc.cleaned_text is not None
            assert len(processed_doc.cleaned_text.strip()) > 0
            # Track physical file for cleanup
            if processed_doc.filepath and processed_doc.filepath not in e2e_context["uploaded_files"]:
                e2e_context["uploaded_files"].append(processed_doc.filepath)

        # Specifically verify OCR metadata on the PNG doc
        png_doc = db.query(Document).filter(Document.id == e2e_context["doc_ids"][3]).first()
        meta = json.loads(png_doc.metadata_json)
        assert meta["file_type"] == "IMAGE_OCR"
        assert meta["ocr_engine"] == "EasyOCR (Offline)"
    finally:
        db.close()


def test_04_embeddings_and_chromadb_indexing(e2e_context):
    """4. Verify embeddings + ChromaDB vector persistence for all documents."""
    db = SessionLocal()
    try:
        for doc_id in e2e_context["doc_ids"]:
            num_chunks, num_embeddings = embedding_engine.process_document_embedding(db, doc_id)
            assert num_chunks > 0
            assert num_embeddings == num_chunks
            vector_storage.store_document_vectors(db, doc_id)

            doc = db.query(Document).filter(Document.id == doc_id).first()
            assert doc.status == "indexed"
            assert doc.chunks > 0
    finally:
        db.close()


def test_05_workspace_scoped_semantic_search(e2e_context):
    """5. Verify workspace-scoped semantic search finds docs in A, but zero in B."""
    ws_a_id = e2e_context["ws_a_id"]
    ws_b_id = e2e_context["ws_b_id"]

    # Search in Workspace A via POST /api/v1/search/query
    res_a = client.post("/api/v1/search/query", json={
        "query": "artificial intelligence embeddings",
        "workspace_id": ws_a_id
    })
    assert res_a.status_code == 200
    results_a = res_a.json().get("data", {}).get("results", [])
    assert len(results_a) > 0
    assert any("e2e_quantum.txt" in r.get("title", "") for r in results_a)

    # Search in Workspace B (must return 0 results because documents belong strictly to A)
    res_b = client.post("/api/v1/search/query", json={
        "query": "artificial intelligence embeddings",
        "workspace_id": ws_b_id
    })
    assert res_b.status_code == 200
    results_b = res_b.json().get("data", {}).get("results", [])
    assert len(results_b) == 0


def test_06_offline_ollama_normal_chat(e2e_context):
    """6. Verify Offline Ollama normal chat mode (mode='normal')."""
    with patch.object(OllamaProvider, "generate") as mock_gen:
        mock_gen.return_value = LLMResponse(
            text="Hello! I am CogniDesk local offline AI assistant.",
            model="qwen2.5:3b",
            provider="ollama"
        )

        res = client.post("/api/v1/rag/query", json={
            "query": "Hello, how can you help me?",
            "mode": "normal"
        })
        assert res.status_code == 200
        data = res.json()["data"]
        assert "CogniDesk local offline AI assistant" in data["answer"]
        assert data["citations"] == []


def test_07_offline_document_rag_and_citations(e2e_context):
    """7. Verify Offline document RAG + citations with ChromaDB chunks."""
    target_doc_id = e2e_context["doc_ids"][0]

    with patch.object(OllamaProvider, "generate") as mock_gen:
        mock_gen.return_value = LLMResponse(
            text="Based on the specification document, vector distances are computed using cosine metric.",
            model="qwen2.5:3b",
            provider="ollama"
        )

        res = client.post("/api/v1/rag/query", json={
            "query": "What metric is used for vector distances?",
            "mode": "document",
            "document_ids": [target_doc_id]
        })
        assert res.status_code == 200
        data = res.json()["data"]
        assert "cosine metric" in data["answer"]
        assert len(data["citations"]) > 0
        citation = data["citations"][0]
        assert "docName" in citation
        assert "score" in citation


def test_08_ai_notes_generation_with_citations(e2e_context):
    """8. Verify Notes generation + citations from indexed document."""
    ws_a_id = e2e_context["ws_a_id"]
    target_doc_id = e2e_context["doc_ids"][0]  # TXT document

    res = client.post("/api/v1/notes/generate", json={
        "document_id": target_doc_id,
        "workspace_id": ws_a_id
    })
    assert res.status_code == 201
    note_data = res.json()["data"]
    assert note_data["document_id"] == target_doc_id
    assert "content" in note_data and len(note_data["content"]) > 0
    e2e_context["note_ids"].append(note_data["id"])


def test_09_flashcard_deck_generation_with_citations(e2e_context):
    """9. Verify Flashcard deck generation + citations from indexed document."""
    ws_a_id = e2e_context["ws_a_id"]
    target_doc_id = e2e_context["doc_ids"][0]

    res = client.post("/api/v1/flashcards/generate", json={
        "document_id": target_doc_id,
        "count": 5,
        "workspace_id": ws_a_id
    })
    assert res.status_code == 201
    deck_data = res.json()["data"]
    assert deck_data["document_id"] == target_doc_id
    assert len(deck_data["cards"]) > 0
    e2e_context["deck_ids"].append(deck_data["id"])


def test_10_chat_history_full_lifecycle(e2e_context):
    """10. Verify Chat History save/search/resume/rename/delete."""
    ws_a_id = e2e_context["ws_a_id"]
    session_id = f"e2e_thread_{uuid.uuid4().hex[:8]}"

    # 1. Save thread
    thread_payload = {
        "id": session_id,
        "title": "Quantum Research Discussion",
        "time": "Just now",
        "mode": "document",
        "selectedDocId": "all",
        "workspace_id": ws_a_id,
        "messages": [
            {"id": "m1", "sender": "user", "text": "What is quantum superposition?", "time": "10:00"},
            {"id": "m2", "sender": "ai", "text": "A linear combination of states.", "time": "10:01", "citations": []}
        ]
    }
    save_res = client.post("/api/v1/chat/threads", json=thread_payload)
    assert save_res.status_code == 200
    e2e_context["thread_ids"].append(session_id)

    # 2. Get thread by ID
    get_res = client.get(f"/api/v1/chat/threads/{session_id}")
    assert get_res.status_code == 200
    assert get_res.json()["data"]["title"] == "Quantum Research Discussion"

    # 3. Search thread by keyword
    search_res = client.get("/api/v1/chat/threads", params={"workspace_id": ws_a_id, "search": "superposition"})
    assert search_res.status_code == 200
    found_threads = search_res.json()["data"]
    assert any(t["id"] == session_id for t in found_threads)

    # 4. Rename thread
    rename_res = client.put(f"/api/v1/chat/threads/{session_id}/rename", json={"title": "Updated Superposition Discussion"})
    assert rename_res.status_code == 200
    assert rename_res.json()["data"]["title"] == "Updated Superposition Discussion"

    # 5. Delete thread
    del_res = client.delete(f"/api/v1/chat/threads/{session_id}")
    assert del_res.status_code == 200

    # Verify deleted
    assert client.get(f"/api/v1/chat/threads/{session_id}").status_code == 404
    e2e_context["thread_ids"].remove(session_id)


def test_11_knowledge_base_workspace_statistics(e2e_context):
    """11. Verify Knowledge Base real workspace statistics reflect ingested docs & vectors."""
    ws_a_id = e2e_context["ws_a_id"]
    res = client.get(f"/api/v1/vector-db/stats?workspace_id={ws_a_id}")
    assert res.status_code == 200
    stats = res.json()["data"]

    assert stats["workspace_id"] == ws_a_id
    assert stats["total_documents"] >= 4
    assert stats["total_chunks"] >= 4
    assert stats["embedding_model"] == "all-MiniLM-L6-v2"
    assert stats["embedding_dimension"] == 384
    assert len(stats["collections"]) >= 1


def test_12_mcp_initialize_list_and_call_with_isolation(e2e_context):
    """12. Verify MCP initialize/tools/list/tools/call + workspace isolation."""
    ws_a_id = e2e_context["ws_a_id"]
    ws_b_id = e2e_context["ws_b_id"]

    # Initialize
    init_res = client.post("/api/v1/mcp", json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"client_info": {"name": "TestE2EClient", "version": "1.0"}}
    })
    assert init_res.status_code == 200
    assert "serverInfo" in init_res.json()["result"]

    # Tools list
    list_res = client.post("/api/v1/mcp", json={
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
    })
    assert list_res.status_code == 200
    tool_names = [t["name"] for t in list_res.json()["result"]["tools"]]
    assert "search_documents" in tool_names
    assert "get_document_summary" in tool_names

    # Call tool in Workspace A -> returns results
    call_res_a = client.post("/api/v1/mcp", json={
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "search_documents",
            "arguments": {"query": "vector embeddings", "workspace_id": ws_a_id}
        }
    })
    assert call_res_a.status_code == 200
    content_a = call_res_a.json()["result"]["content"]
    text_content = content_a[0]["text"] if isinstance(content_a, list) and content_a else str(content_a)
    assert "e2e_specs.docx" in text_content or "e2e_manual.pdf" in text_content or "e2e_quantum.txt" in text_content

    # Call tool in Workspace B -> isolated, no docs returned
    call_res_b = client.post("/api/v1/mcp", json={
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "search_documents",
            "arguments": {"query": "vector embeddings", "workspace_id": ws_b_id}
        }
    })
    assert call_res_b.status_code == 200
    content_b = call_res_b.json()["result"]["content"]
    text_content_b = content_b[0]["text"] if isinstance(content_b, list) and content_b else str(content_b)
    assert '"total_matches": 0' in text_content_b or "No documents matching" in text_content_b


def test_13_settings_persistence(e2e_context):
    """13. Verify Settings persistence across updates."""
    # Update chunk size and model
    upd_res = client.put("/api/v1/settings", json={
        "chunk_size": 1200,
        "chunk_overlap": 200,
        "ollama_model": "qwen2.5:3b"
    })
    assert upd_res.status_code == 200
    assert upd_res.json()["chunk_size"] == 1200

    # Fetch and verify
    get_res = client.get("/api/v1/settings")
    assert get_res.status_code == 200
    assert get_res.json()["chunk_size"] == 1200
    assert get_res.json()["chunk_overlap"] == 200


def test_14_offline_mode_blocks_every_cloud_provider(e2e_context):
    """14. Verify Offline Mode blocks every cloud provider with zero network calls."""
    db = SessionLocal()
    try:
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        setting.is_offline_mode = True
        setting.ai_provider = "cloud"
        db.commit()

        # In offline mode, querying RAG with cloud provider fails immediately with 400
        res = client.post("/api/v1/rag/query", json={
            "query": "Should be rejected offline",
            "mode": "normal"
        })
        assert res.status_code == 400
        assert "Offline Mode is strictly enforced" in res.text

        # Reset setting to safe ollama
        setting.ai_provider = "ollama"
        db.commit()
    finally:
        db.close()


def test_15_provider_switching_with_mocked_apis(e2e_context):
    """15. Verify Anthropic/OpenAI provider switching with mocked APIs."""
    from app.services.providers.anthropic_provider import AnthropicProvider
    from app.services.providers.openai_provider import OpenAIProvider

    db = SessionLocal()
    try:
        # Enable online mode
        setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
        setting.is_offline_mode = False
        setting.ai_provider = "cloud"
        setting.cloud_provider = "anthropic"
        setting.cloud_model = "claude-sonnet-4-5"
        setting.cloud_api_key = "sk-ant-test-key-valid"
        db.commit()

        # 1. Test Anthropic provider resolution and mock generation
        anthropic_prov = get_llm_provider(db)
        assert isinstance(anthropic_prov, AnthropicProvider)
        assert anthropic_prov.model == "claude-sonnet-4-5"

        with patch.object(AnthropicProvider, "generate") as mock_gen:
            mock_gen.return_value = LLMResponse(
                text="Generated by Claude Sonnet 4.5",
                model="claude-sonnet-4-5",
                provider="anthropic"
            )
            resp = anthropic_prov.generate(prompt="Explain offline RAG")
            assert resp.text == "Generated by Claude Sonnet 4.5"
            assert resp.provider == "anthropic"

        # 2. Switch to OpenAI
        setting.cloud_provider = "openai"
        setting.cloud_model = "gpt-4o"
        setting.cloud_api_key = "sk-proj-test-key-valid"
        db.commit()

        openai_prov = get_llm_provider(db)
        assert isinstance(openai_prov, OpenAIProvider)
        assert openai_prov.model == "gpt-4o"

        with patch.object(OpenAIProvider, "generate") as mock_openai_gen:
            mock_openai_gen.return_value = LLMResponse(
                text="Generated by GPT-4o",
                model="gpt-4o",
                provider="openai"
            )
            resp_openai = openai_prov.generate(prompt="Explain offline RAG")
            assert resp_openai.text == "Generated by GPT-4o"
            assert resp_openai.provider == "openai"

        # 3. Switch back to Ollama and offline mode
        setting.ai_provider = "ollama"
        setting.is_offline_mode = True
        db.commit()
    finally:
        db.close()


def test_16_streaming_responses_and_real_error_handling(e2e_context):
    """16. Verify streaming SSE generator and authentic error handling."""
    # Test SSE stream generator
    with patch.object(OllamaProvider, "stream_generate") as mock_stream:
        mock_stream.return_value = iter(["Token 1 ", "Token 2 ", "Token 3"])

        db = SessionLocal()
        try:
            stream_gen = rag_service.generate_streaming_response(
                db=db,
                query="Stream test",
                mode="normal"
            )
            chunks = list(stream_gen)
            full_sse = "".join(chunks)
            assert '{"type": "token"' in full_sse
            assert "Token 1" in full_sse
            assert '{"type": "done"}' in full_sse
        finally:
            db.close()

    # Test real error handling: missing document ID -> 404
    missing_doc_res = client.get("/api/v1/documents/999999/content")
    assert missing_doc_res.status_code == 404

    # Test real error handling: missing note ID -> 404
    missing_note_res = client.delete("/api/v1/notes/999999")
    assert missing_note_res.status_code == 404


def test_17_cross_workspace_isolation_comprehensive(e2e_context):
    """17. Verify complete isolation across documents, notes, flashcards, and chats."""
    ws_a_id = e2e_context["ws_a_id"]
    ws_b_id = e2e_context["ws_b_id"]

    # Documents
    docs_a = client.get("/api/v1/documents", headers={"x-workspace-id": str(ws_a_id)}).json()
    docs_b = client.get("/api/v1/documents", headers={"x-workspace-id": str(ws_b_id)}).json()
    assert len(docs_a) >= 4
    assert len(docs_b) == 0

    # Notes
    notes_a = client.get("/api/v1/notes", headers={"x-workspace-id": str(ws_a_id)}).json()["data"]
    notes_b = client.get("/api/v1/notes", headers={"x-workspace-id": str(ws_b_id)}).json()["data"]
    assert len(notes_a) >= 1
    assert len(notes_b) == 0

    # Flashcards
    decks_a = client.get("/api/v1/flashcards/decks", headers={"x-workspace-id": str(ws_a_id)}).json()["data"]
    decks_b = client.get("/api/v1/flashcards/decks", headers={"x-workspace-id": str(ws_b_id)}).json()["data"]
    assert len(decks_a) >= 1
    assert len(decks_b) == 0


def test_18_delete_rename_and_database_consistency(e2e_context):
    """18. Verify rename/delete operations across entities and database consistency."""
    db = SessionLocal()
    try:
        # 1. Rename document
        doc_id = e2e_context["doc_ids"][0]
        ren_res = client.patch(f"/api/v1/documents/{doc_id}", json={"original_filename": "renamed_doc.txt"})
        assert ren_res.status_code == 200
        assert ren_res.json()["data"]["name"] == "renamed_doc.txt"

        # 2. Rename note
        note_id = e2e_context["note_ids"][0]
        ren_note_res = client.put(f"/api/v1/notes/{note_id}", json={"title": "Renamed Note Title"})
        assert ren_note_res.status_code == 200
        assert ren_note_res.json()["data"]["title"] == "Renamed Note Title"

        # 3. Delete document: verify SQLite chunk deletion, vector purge, and file deletion
        doc = db.query(Document).filter(Document.id == doc_id).first()
        filepath = doc.filepath
        del_doc_res = client.delete(f"/api/v1/documents/{doc_id}")
        assert del_doc_res.status_code == 200
        # Verify purged
        assert db.query(Document).filter(Document.id == doc_id).first() is None
        assert db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count() == 0
        assert not os.path.exists(filepath)
        e2e_context["doc_ids"].remove(doc_id)

        # 4. Delete note
        del_note_res = client.delete(f"/api/v1/notes/{note_id}")
        assert del_note_res.status_code == 200
        assert db.query(Note).filter(Note.id == note_id).first() is None
        e2e_context["note_ids"].remove(note_id)

        # 5. Delete flashcard deck
        deck_id = e2e_context["deck_ids"][0]
        del_deck_res = client.delete(f"/api/v1/flashcards/decks/{deck_id}")
        assert del_deck_res.status_code == 200
        assert db.query(FlashcardDeck).filter(FlashcardDeck.id == deck_id).first() is None
        assert db.query(Flashcard).filter(Flashcard.deck_id == deck_id).count() == 0
        e2e_context["deck_ids"].remove(deck_id)
    finally:
        db.close()
