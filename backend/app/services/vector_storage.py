import json
import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.chroma import get_chroma_client, get_or_create_collection
from app.models.document import Document
from app.models.document_chunk import DocumentChunk

logger = logging.getLogger("app")


class VectorStorageService:
    """
    Module 07: ChromaDB Vector Storage Service.
    Handles storing vector embeddings, chunk texts, and metadata in ChromaDB,
    deleting document vectors, syncing SQLite status to 'indexed', and collection management.
    """

    @staticmethod
    def _clean_metadata_for_chroma(meta_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        ChromaDB metadata requires values to be primitive types (str, int, float, bool).
        Flattens or stringifies nested dictionaries/lists.
        """
        clean_meta = {}
        for key, val in meta_dict.items():
            if isinstance(val, (str, int, float, bool)):
                clean_meta[key] = val
            elif isinstance(val, (dict, list)):
                clean_meta[key] = json.dumps(val)
            elif val is None:
                clean_meta[key] = ""
            else:
                clean_meta[key] = str(val)
        return clean_meta

    def store_document_vectors(self, db: Session, document_id: int) -> int:
        """
        Stores embeddings, chunk texts, and metadata for a document into ChromaDB.
        Updates SQLite document status to 'indexed'.
        """
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError(f"Document ID {document_id} not found in SQLite.")

        chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .all()
        )

        if not chunks:
            raise ValueError(f"No chunks found for document ID {document_id}. Run Module 06 embedding engine first.")

        collection = get_or_create_collection()

        ids: List[str] = []
        embeddings: List[List[float]] = []
        documents_text: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        doc_base_meta = {}
        if doc.metadata_json:
            try:
                doc_base_meta = json.loads(doc.metadata_json)
            except Exception:
                doc_base_meta = {}

        for c in chunks:
            chunk_id = f"doc_{doc.id}_chunk_{c.chunk_index}"
            
            # Parse vector embedding
            if not c.embedding_json:
                continue
            emb_vec = json.loads(c.embedding_json)
            if not emb_vec or not isinstance(emb_vec, list):
                continue

            # Parse chunk metadata
            chunk_meta = {}
            if c.metadata_json:
                try:
                    chunk_meta = json.loads(c.metadata_json)
                except Exception:
                    chunk_meta = {}

            # Combine and clean metadata for ChromaDB
            meta_combined = {
                "document_id": doc.id,
                "workspace_id": getattr(doc, "workspace_id", 1) or 1,
                "filename": doc.filename,
                "original_filename": doc.original_filename,
                "filetype": doc.filetype,
                "chunk_index": c.chunk_index,
                "start_char": c.start_char,
                "end_char": c.end_char,
                "word_count": c.word_count,
                "character_count": c.character_count,
                **doc_base_meta,
                **chunk_meta
            }

            clean_meta = self._clean_metadata_for_chroma(meta_combined)

            ids.append(chunk_id)
            embeddings.append(emb_vec)
            documents_text.append(c.chunk_text)
            metadatas.append(clean_meta)

        if not ids:
            logger.info(f"No vector embeddings available for document ID {document_id}. Marking document as indexed for SQLite lexical search.")
            doc.status = "indexed"
            doc.error_message = None
            db.commit()
            return 0

        logger.info(f"Upserting {len(ids)} vectors for document ID {document_id} into ChromaDB collection...")
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents_text,
            metadatas=metadatas
        )

        # Update SQLite document status to 'indexed'
        doc.status = "indexed"
        doc.error_message = None
        db.commit()

        logger.info(f"Successfully stored vectors in ChromaDB and updated status to 'indexed' for doc ID {document_id}.")
        return len(ids)

    def delete_document_vectors(self, document_id: int) -> bool:
        """
        Removes all vectors belonging to a document from ChromaDB.
        """
        try:
            collection = get_or_create_collection()
            
            # ChromaDB delete by metadata filter
            logger.info(f"Deleting ChromaDB vectors for document_id={document_id}...")
            collection.delete(where={"document_id": document_id})
            return True
        except Exception as e:
            logger.warning(f"Failed to delete ChromaDB vectors for document ID {document_id}: {e}")
            return False

    def sync_all_embedded_documents(self, db: Session) -> Dict[str, Any]:
        """
        Finds all documents in 'embedded' status in SQLite and upserts them to ChromaDB.
        """
        docs = db.query(Document).filter(Document.status == "embedded").all()
        synced_count = 0
        total_vectors = 0
        failed_ids = []

        for doc in docs:
            try:
                vec_count = self.store_document_vectors(db, doc.id)
                synced_count += 1
                total_vectors += vec_count
            except Exception as e:
                logger.error(f"Sync failed for document ID {doc.id}: {e}")
                failed_ids.append(doc.id)

        return {
            "synced_documents_count": synced_count,
            "total_vectors_stored": total_vectors,
            "failed_document_ids": failed_ids
        }

    def get_storage_stats(self, db: Session, workspace_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Returns stats about ChromaDB storage, collections, and SQLite indexed document counts,
        optionally scoped to a specific workspace_id.
        """
        client = get_chroma_client()
        collection = get_or_create_collection()

        total_vectors = collection.count()
        collections_list = [c.name for c in client.list_collections()]

        doc_query = db.query(Document)
        chunk_query = db.query(DocumentChunk)

        if workspace_id is not None:
            doc_query = doc_query.filter(Document.workspace_id == workspace_id)
            total_chunks = (
                db.query(func.count(DocumentChunk.id))
                .join(Document, Document.id == DocumentChunk.document_id)
                .filter(Document.workspace_id == workspace_id)
                .scalar()
                or 0
            )
        else:
            total_chunks = chunk_query.count()

        total_docs = doc_query.count()
        indexed_docs = doc_query.filter(Document.status == "indexed").count()
        embedded_docs = doc_query.filter(Document.status == "embedded").count()
        processed_docs = doc_query.filter(Document.status.in_(["processed", "indexed", "embedded"])).count()

        return {
            "chroma_collection_name": collection.name,
            "total_vectors_in_collection": total_vectors,
            "all_collections": collections_list,
            "workspace_id": workspace_id,
            "total_documents": total_docs,
            "total_chunks": total_chunks,
            "indexed_documents_count": indexed_docs,
            "embedded_documents_count": embedded_docs,
            "processed_documents_count": processed_docs,
            "persist_dir": getattr(settings, "CHROMA_PERSIST_DIR", "../vector_db")
        }

    def get_document_vectors(self, document_id: int) -> Dict[str, Any]:
        """
        Fetches stored ChromaDB records (IDs, documents, metadatas) for a document.
        """
        collection = get_or_create_collection()
        results = collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas", "embeddings"]
        )

        ids = results.get("ids", [])
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
        embs = results.get("embeddings", [])

        chunk_items = []
        for i in range(len(ids)):
            emb_dim = len(embs[i]) if embs is not None and i < len(embs) and embs[i] is not None else 0
            chunk_items.append({
                "id": ids[i],
                "text": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) else {},
                "embedding_dimension": emb_dim
            })

        return {
            "document_id": document_id,
            "total_vectors": len(ids),
            "vectors": chunk_items
        }


vector_storage = VectorStorageService()
