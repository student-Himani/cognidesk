import os
import re
import json
import hashlib
import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk

logger = logging.getLogger("app")

# Ensure HuggingFace / Transformers prefer local files without throwing network errors offline
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

# Lazy import for sentence_transformers
_SentenceTransformer = None
try:
    from sentence_transformers import SentenceTransformer as _SentenceTransformer
except ImportError:
    _SentenceTransformer = None


class EmbeddingEngine:
    """
    Module 06: Embedding Engine Service.
    Integrates SentenceTransformers, recursive text chunking, batch embedding generation,
    in-memory text-hash caching, metadata mapping, and SQLite status updates.
    """
    _model_instance = None
    _cache: Dict[str, List[float]] = {}

    @classmethod
    def get_model(cls):
        """
        Lazy singleton loader for SentenceTransformer model.
        """
        if cls._model_instance is None:
            if _SentenceTransformer is None:
                raise ImportError("sentence-transformers is not installed in the environment.")
            
            model_name = getattr(settings, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
            logger.info(f"Loading SentenceTransformer model: '{model_name}'...")
            try:
                cls._model_instance = _SentenceTransformer(model_name)
            except Exception as e:
                logger.warning(f"Standard SentenceTransformer load notice ({e}). Trying local_files_only=True...")
                try:
                    cls._model_instance = _SentenceTransformer(model_name, local_files_only=True)
                except Exception as ex:
                    logger.error(f"Failed to load SentenceTransformer model '{model_name}': {ex}")
                    raise ex
            logger.info(f"Successfully loaded SentenceTransformer model: '{model_name}'")
        return cls._model_instance

    @staticmethod
    def _compute_text_hash(text: str, model_name: str) -> str:
        """Generates SHA-256 hash string for text and model combination."""
        combined = f"{model_name}::{text.strip()}"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()

    @staticmethod
    def count_words(text: str) -> int:
        if not text:
            return 0
        return len(re.findall(r"\b\w+\b", text))

    def chunk_text(
        self,
        text: str,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Splits clean text into semantic chunks with specified size and overlap.
        Uses recursive split strategy with boundary preservation (paragraphs, sentences, words).
        """
        if not text or not text.strip():
            return []

        c_size = chunk_size or getattr(settings, "CHUNK_SIZE", 500)
        c_overlap = chunk_overlap or getattr(settings, "CHUNK_OVERLAP", 50)
        if c_overlap >= c_size:
            c_overlap = max(0, c_size - 10)

        separators = ["\n\n", "\n", ". ", "? ", "! ", "; ", " ", ""]

        def split_text_recursive(target_text: str, current_separators: List[str]) -> List[str]:
            if len(target_text) <= c_size:
                return [target_text]

            if not current_separators:
                # Force hard cut if no separators remain
                chunks = []
                for i in range(0, len(target_text), c_size - c_overlap):
                    chunks.append(target_text[i : i + c_size])
                return chunks

            sep = current_separators[0]
            next_seps = current_separators[1:]

            if sep == "":
                splits = list(target_text)
            else:
                splits = target_text.split(sep)

            result_chunks = []
            good_splits = []

            for s in splits:
                piece = s if sep in ("", "\n", "\n\n") else (s + sep if s != splits[-1] else s)
                if not piece.strip():
                    continue

                if len(piece) > c_size:
                    # Recursively split large pieces using finer separators
                    if good_splits:
                        merged = "".join(good_splits).strip()
                        if merged:
                            result_chunks.append(merged)
                        good_splits = []
                    sub_chunks = split_text_recursive(piece, next_seps)
                    result_chunks.extend(sub_chunks)
                else:
                    # Check if combining fits inside chunk_size
                    combined_len = len("".join(good_splits)) + len(piece)
                    if combined_len <= c_size:
                        good_splits.append(piece)
                    else:
                        merged = "".join(good_splits).strip()
                        if merged:
                            result_chunks.append(merged)
                        # Retain overlap from previous split
                        overlap_str = ""
                        if c_overlap > 0 and good_splits:
                            tail = "".join(good_splits)
                            overlap_str = tail[-c_overlap:]
                        good_splits = [overlap_str + piece] if overlap_str else [piece]

            if good_splits:
                merged = "".join(good_splits).strip()
                if merged:
                    result_chunks.append(merged)

            return result_chunks

        raw_chunks = split_text_recursive(text, separators)

        # Build detailed metadata structures for chunks
        formatted_chunks: List[Dict[str, Any]] = []
        current_cursor = 0

        for idx, chunk_str in enumerate(raw_chunks):
            chunk_str = chunk_str.strip()
            if not chunk_str:
                continue

            # Calculate character position mapping
            start_pos = text.find(chunk_str, current_cursor)
            if start_pos == -1:
                start_pos = current_cursor

            end_pos = start_pos + len(chunk_str)
            current_cursor = max(current_cursor, start_pos + max(1, len(chunk_str) - c_overlap))

            formatted_chunks.append({
                "chunk_index": len(formatted_chunks),
                "text": chunk_str,
                "start_char": start_pos,
                "end_char": end_pos,
                "character_count": len(chunk_str),
                "word_count": self.count_words(chunk_str)
            })

        return formatted_chunks

    def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: Optional[int] = None
    ) -> List[List[float]]:
        """
        Generates vector embeddings for a list of texts using SentenceTransformers with batching
        and in-memory caching.
        """
        if not texts:
            return []

        model_name = getattr(settings, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
        b_size = batch_size or getattr(settings, "EMBEDDING_BATCH_SIZE", 32)

        results: List[Optional[List[float]]] = [None] * len(texts)
        uncached_indices: List[int] = []
        uncached_texts: List[str] = []

        # 1. Check cache hits
        for i, t in enumerate(texts):
            text_hash = self._compute_text_hash(t, model_name)
            if text_hash in self._cache:
                results[i] = self._cache[text_hash]
            else:
                uncached_indices.append(i)
                uncached_texts.append(t)

        # 2. Compute embeddings for cache misses in batches
        if uncached_texts:
            model = self.get_model()
            logger.info(f"Computing embeddings for {len(uncached_texts)} chunk(s) (Batch Size: {b_size})...")
            
            # SentenceTransformer encode
            embeddings_array = model.encode(
                uncached_texts,
                batch_size=b_size,
                show_progress_bar=False,
                convert_to_numpy=True
            )

            for idx_in_uncached, orig_idx in enumerate(uncached_indices):
                vec = embeddings_array[idx_in_uncached].tolist()
                results[orig_idx] = vec
                
                # Store in cache
                t_hash = self._compute_text_hash(texts[orig_idx], model_name)
                self._cache[t_hash] = vec

        return [r for r in results if r is not None]

    def process_document_embedding(self, db: Session, document_id: int) -> Tuple[int, int]:
        """
        Processes a document for Module 06:
        - Validates that document has been processed (has cleaned_text).
        - Updates document status to 'embedding'.
        - Splits cleaned_text into chunks.
        - Generates embeddings for chunks in batches.
        - Deletes old document chunks for this document.
        - Stores chunks, embeddings, and metadata in SQLite `document_chunks` table.
        - Updates `doc.chunks` count and sets document status to 'embedded'.
        """
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError(f"Document ID {document_id} not found.")

        # Check cleaned text presence
        text_to_chunk = (doc.cleaned_text or doc.extracted_text or "").strip()
        if not text_to_chunk:
            logger.info(f"Document ID {document_id} has no text to chunk/embed. Marking status as processed.")
            doc.chunks = 0
            doc.status = "processed"
            db.commit()
            return 0, 0

        try:
            # Set status to 'embedding'
            doc.status = "embedding"
            db.commit()

            # 1. Chunk document text
            chunks_data = self.chunk_text(text_to_chunk)
            if not chunks_data:
                raise ValueError("Text chunking produced zero chunks.")

            chunk_texts = [c["text"] for c in chunks_data]

            # 2. Batch generate embeddings
            embeddings = self.generate_embeddings_batch(chunk_texts)

            # 3. Parse base document metadata
            doc_metadata = {}
            if doc.metadata_json:
                try:
                    doc_metadata = json.loads(doc.metadata_json)
                except Exception:
                    doc_metadata = {}

            # 4. Remove previous chunks for this document (if re-running embedding)
            db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()

            # 5. Insert new chunk records with metadata and embedding vectors
            model_name = getattr(settings, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
            new_chunk_records = []

            for idx, c in enumerate(chunks_data):
                chunk_meta = {
                    "document_id": doc.id,
                    "filename": doc.filename,
                    "original_filename": doc.original_filename,
                    "filetype": doc.filetype,
                    "chunk_index": c["chunk_index"],
                    "start_char": c["start_char"],
                    "end_char": c["end_char"],
                    "word_count": c["word_count"],
                    "character_count": c["character_count"],
                    "doc_metadata": doc_metadata
                }

                emb_vec = embeddings[idx] if idx < len(embeddings) else []

                chunk_obj = DocumentChunk(
                    document_id=doc.id,
                    chunk_index=c["chunk_index"],
                    chunk_text=c["text"],
                    start_char=c["start_char"],
                    end_char=c["end_char"],
                    word_count=c["word_count"],
                    character_count=c["character_count"],
                    embedding_json=json.dumps(emb_vec),
                    embedding_model=model_name,
                    metadata_json=json.dumps(chunk_meta)
                )
                new_chunk_records.append(chunk_obj)

            db.bulk_save_objects(new_chunk_records)

            # 6. Update SQLite document status and stats
            doc.chunks = len(new_chunk_records)
            doc.status = "embedded"
            doc.error_message = None
            db.commit()

            logger.info(
                f"Successfully completed Module 06 Embedding Engine for doc ID {document_id}. "
                f"Generated {len(new_chunk_records)} chunks and embeddings."
            )

            return len(new_chunk_records), len(embeddings)

        except Exception as e:
            logger.error(f"Error during embedding generation for document ID {document_id}: {e}")
            db.rollback()
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = f"Embedding generation failed: {str(e)}"
                db.commit()
            raise e

    def get_status(self, db: Session) -> Dict[str, Any]:
        """Returns stats about the embedding engine state and cached items."""
        total_chunks = db.query(DocumentChunk).count()
        embedded_docs = db.query(Document).filter(Document.status == "embedded").count()
        model_name = getattr(settings, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")

        return {
            "model_name": model_name,
            "model_loaded": self._model_instance is not None,
            "cache_size": len(self._cache),
            "chunk_size": getattr(settings, "CHUNK_SIZE", 500),
            "chunk_overlap": getattr(settings, "CHUNK_OVERLAP", 50),
            "batch_size": getattr(settings, "EMBEDDING_BATCH_SIZE", 32),
            "total_embedded_documents": embedded_docs,
            "total_chunks_in_db": total_chunks
        }


embedding_engine = EmbeddingEngine()
