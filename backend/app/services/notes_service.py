import time
import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings
from app.models.note import Note
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.rag_service import rag_service

logger = logging.getLogger("app")


class NotesService:
    """
    Notes Service: Handles SQLite CRUD operations for user notes
    and AI-powered note generation using ChromaDB + local Ollama LLM.
    """

    def get_notes(self, db: Session, workspace_id: Optional[int] = None) -> List[Note]:
        """Fetch all notes ordered by most recently updated, optionally filtered by workspace_id."""
        query = db.query(Note)
        if workspace_id is not None:
            query = query.filter(Note.workspace_id == workspace_id)
        return query.order_by(Note.updated_at.desc()).all()

    def get_note_by_id(self, db: Session, note_id: int) -> Optional[Note]:
        """Fetch single note by ID."""
        return db.query(Note).filter(Note.id == note_id).first()

    def create_note(
        self,
        db: Session,
        title: str,
        content: str,
        category: str = "Manual Note",
        document_id: Optional[int] = None,
        document_name: Optional[str] = None,
        workspace_id: Optional[int] = None
    ) -> Note:
        """Create a new manual or custom note scoped to a workspace."""
        if document_id and not document_name:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                document_name = doc.original_filename
                if workspace_id is None and doc.workspace_id:
                    workspace_id = doc.workspace_id

        if workspace_id is None:
            from app.services.workspace_service import workspace_service
            workspace_id = workspace_service.get_active_workspace(db)["id"]

        note = Note(
            workspace_id=workspace_id,
            title=title.strip(),
            category=category.strip(),
            content=content.strip(),
            document_id=document_id,
            document_name=document_name
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        return note

    def update_note(
        self,
        db: Session,
        note_id: int,
        title: Optional[str] = None,
        content: Optional[str] = None,
        category: Optional[str] = None
    ) -> Optional[Note]:
        """Update an existing note."""
        note = self.get_note_by_id(db, note_id)
        if not note:
            return None

        if title is not None:
            note.title = title.strip()
        if content is not None:
            note.content = content.strip()
        if category is not None:
            note.category = category.strip()

        db.commit()
        db.refresh(note)
        return note

    def delete_note(self, db: Session, note_id: int) -> bool:
        """Delete a note by ID."""
        note = self.get_note_by_id(db, note_id)
        if not note:
            return False

        db.delete(note)
        db.commit()
        return True

    def generate_ai_note(
        self,
        db: Session,
        document_id: int,
        model: Optional[str] = None,
        workspace_id: Optional[int] = None
    ) -> Note:
        """
        Generates structured AI study notes for a specific document using ChromaDB vector context
        and local Ollama LLM inference.
        """
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError(f"Document with ID {document_id} not found.")

        # 1. Retrieve document content
        doc_text = (doc.cleaned_text or doc.extracted_text or "").strip()
        if not doc_text:
            try:
                # Fallback to ChromaDB chunks retrieval
                chunks = rag_service.retrieve_context(
                    db=db,
                    query="summary key points concepts overview",
                    top_k=15,
                    document_ids=[document_id]
                )
                doc_text = "\n\n".join(c.get("snippet", "") for c in chunks if c.get("snippet"))
            except Exception as e:
                logger.warning(f"ChromaDB retrieval for doc {document_id} failed: {e}")

        if not doc_text:
            doc_text = f"Document '{doc.original_filename}' has no extractable text content."

        # 2. Retrieve ChromaDB vector chunks for citations
        retrieved_chunks = []
        try:
            retrieved_chunks = rag_service.retrieve_context(
                db=db,
                query="overview key concepts summary definitions takeaways",
                top_k=5,
                document_ids=[document_id]
            )
        except Exception as e:
            logger.warning(f"ChromaDB retrieval for doc {document_id} citations: {e}")

        # Truncate text to stay within fast prompt window (~5000 chars)
        max_prompt_chars = 5000
        truncated_text = doc_text[:max_prompt_chars]

        # 3. Build structured AI Notes prompt with citations requirement
        system_prompt = (
            "You are CogniDesk AI, an offline AI document analysis assistant.\n"
            "Generate detailed, professional executive study notes for the provided document text.\n"
            "Format your output in clean Markdown with the following section headers:\n\n"
            "# 📌 Executive Summary\n"
            "(Synthesize the document's core topic and objectives)\n\n"
            "# 💡 Key Takeaways\n"
            "(Bulleted list of core insights)\n\n"
            "# 🔑 Important Concepts & Terms\n"
            "(Technical terms defined)\n\n"
            "# 📚 Source Citations\n"
            "(Reference specific chunks, sections, or pages from the document)\n"
        )

        user_prompt = (
            f"DOCUMENT TITLE: {doc.original_filename}\n"
            f"FILE TYPE: {doc.filetype.upper()}\n"
            f"WORD COUNT: {doc.word_count}\n\n"
            f"=== DOCUMENT TEXT CONTENT ===\n"
            f"{truncated_text}\n"
            f"=== END DOCUMENT TEXT ===\n\n"
            f"Generate structured study notes with a dedicated '# 📚 Source Citations' section based strictly on the above content."
        )

        # 4. Ollama Inference
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")
        ollama_status = rag_service.check_ollama_status()
        base_url = ollama_status["base_url"]
        generated_markdown = ""

        if ollama_status["online"]:
            available_models = ollama_status.get("models", [])
            if available_models and target_model not in available_models:
                logger.info(f"Requested model '{target_model}' not installed in Ollama. Using '{available_models[0]}'.")
                target_model = available_models[0]

            try:
                payload = {
                    "model": target_model,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "num_predict": 600,
                        "num_ctx": 4096
                    }
                }
                custom_timeout = httpx.Timeout(120.0, connect=15.0, read=120.0, write=120.0)
                with httpx.Client(timeout=custom_timeout) as client:
                    res = client.post(f"{base_url}/api/generate", json=payload)
                    if res.status_code == 200:
                        generated_markdown = res.json().get("response", "").strip()
                    else:
                        logger.warning(f"Ollama returned HTTP {res.status_code}: {res.text}")
            except Exception as e:
                logger.warning(f"Failed to generate note with Ollama: {e}")

        # Ensure citations section is present in generated markdown
        if generated_markdown and "# 📚" not in generated_markdown and "Citation" not in generated_markdown:
            citations_lines = []
            if retrieved_chunks:
                for rc in retrieved_chunks:
                    c_idx = rc.get("chunkIndex") or "Chunk #1"
                    score_str = rc.get("score", "")
                    score_display = f" ({score_str})" if score_str else ""
                    snippet = (rc.get("snippet") or "")[:90].replace("\n", " ")
                    citations_lines.append(f"- **`{doc.original_filename}` • {c_idx}**{score_display}: *\"{snippet}...\"*")
            else:
                citations_lines.append(f"- **`{doc.original_filename}`**: {doc.filetype.upper()} format ({doc.page_count} pages, {doc.chunks or 1} chunks, {doc.word_count} words)")
            generated_markdown += f"\n\n# 📚 Source Citations\n" + "\n".join(citations_lines) + "\n"

        # Fallback offline structured note template if Ollama unreachable
        if not generated_markdown:
            snippets_preview = doc_text[:1000].strip()
            citation_items = []
            if retrieved_chunks:
                for rc in retrieved_chunks[:3]:
                    c_idx = rc.get("chunkIndex") or "Chunk #1"
                    citation_items.append(f"- **`{doc.original_filename}` • {c_idx}**: *\"{rc.get('snippet', '')[:80]}...\"*")
            else:
                citation_items.append(f"- **`{doc.original_filename}` • Chunk #1**: Primary document extract ({doc.word_count} words)")

            generated_markdown = (
                f"# 📌 Executive Summary\n\n"
                f"Note auto-generated for **{doc.original_filename}** ({doc.word_count} words, {doc.page_count} pages).\n\n"
                f"{snippets_preview}...\n\n"
                f"# 💡 Key Takeaways\n\n"
                f"- **Document Source:** `{doc.original_filename}`\n"
                f"- **File Format:** {doc.filetype.upper()}\n"
                f"- **Total Pages/Sections:** {doc.page_count}\n"
                f"- **Total Chunks Indexed:** {doc.chunks}\n\n"
                f"# 🔑 Important Concepts & Terms\n\n"
                f"- **Local Storage:** ChromaDB Vector Storage & SQLite database\n"
                f"- **Privacy Status:** 100% Offline Processing (No cloud APIs used)\n\n"
                f"# 📚 Source Citations\n\n"
                + "\n".join(citation_items) + "\n"
            )

        # 4. Save generated note to SQLite database
        if workspace_id is None and doc.workspace_id:
            workspace_id = doc.workspace_id
        if workspace_id is None:
            from app.services.workspace_service import workspace_service
            workspace_id = workspace_service.get_active_workspace(db)["id"]

        note_title = f"AI Notes: {doc.original_filename}"
        new_note = Note(
            workspace_id=workspace_id,
            title=note_title,
            category="AI Generated",
            content=generated_markdown,
            document_id=doc.id,
            document_name=doc.original_filename
        )
        db.add(new_note)
        db.commit()
        db.refresh(new_note)

        return new_note


notes_service = NotesService()
