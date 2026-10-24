import json
import time
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.chroma import get_or_create_collection
from app.services.embedding_engine import embedding_engine
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.search_history import SearchHistory

logger = logging.getLogger("app")


class SearchService:
    """
    Module 08: Semantic Search Service.
    Handles query embedding generation, ChromaDB vector similarity search, exact full-text search,
    top-K document chunk retrieval with citation metadata, similarity score calculation, search filters,
    and search history logging in SQLite.
    """

    def generate_query_embedding(self, query_text: str) -> List[float]:
        """
        Generates vector embedding for search query using SentenceTransformer model.
        """
        if not query_text or not query_text.strip():
            raise ValueError("Search query string cannot be empty.")
        
        embeddings = embedding_engine.generate_embeddings_batch([query_text.strip()])
        if not embeddings or embeddings[0] is None:
            raise RuntimeError("Failed to generate embedding for search query.")
        return embeddings[0]

    @staticmethod
    def _compute_similarity_score(distance: float) -> Tuple[float, str]:
        """
        Converts vector distance into similarity score (0.0 to 1.0) and display percentage.
        Cosine distance in Chroma: distance in [0, 2].
        """
        # Clamp cosine distance
        dist = max(0.0, float(distance))
        # Similarity conversion
        similarity = max(0.0, min(1.0, 1.0 - dist))
        percentage = round(similarity * 100, 1)
        return similarity, f"{percentage}% Similarity"

    def _build_chroma_filter(
        self,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        workspace_id: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Constructs ChromaDB metadata query filter (`where` parameter).
        """
        conditions = []

        if workspace_id is not None:
            conditions.append({"workspace_id": int(workspace_id)})

        if filetype and filetype.strip():
            conditions.append({"filetype": filetype.strip().lower()})

        if document_ids:
            clean_ids = []
            for d in document_ids:
                try:
                    clean_ids.append(int(d))
                except (ValueError, TypeError):
                    pass
            if len(clean_ids) == 1:
                conditions.append({"document_id": clean_ids[0]})
            elif len(clean_ids) > 1:
                conditions.append({"document_id": {"$in": clean_ids}})

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def search_semantic(
        self,
        db: Session,
        query_text: str,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        min_score: Optional[float] = None,
        workspace_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Performs vector similarity search against ChromaDB collection.
        """
        # 1. Generate Query Vector Embedding
        try:
            query_vector = self.generate_query_embedding(query_text)
        except Exception as e:
            logger.error(f"Failed to generate embedding for query '{query_text}': {e}")
            return []

        # 2. Get ChromaDB Collection
        try:
            collection = get_or_create_collection()
            total_count = collection.count()
            if total_count == 0:
                logger.info("ChromaDB collection is empty. Returning empty search results.")
                return []
        except Exception as e:
            logger.error(f"Failed to access ChromaDB collection: {e}")
            return []

        # 3. Build metadata filters
        where_filter = self._build_chroma_filter(
            filetype=filetype,
            document_ids=document_ids,
            workspace_id=workspace_id
        )

        # If document_ids is provided, expand fetch_k to retrieve complete document context
        if document_ids:
            fetch_k = max(top_k, 30)
        else:
            fetch_k = max(top_k, 15)

        fetch_k = min(fetch_k, total_count)
        if fetch_k <= 0:
            return []

        kwargs: Dict[str, Any] = {
            "query_embeddings": [query_vector],
            "n_results": fetch_k,
            "include": ["documents", "metadatas", "distances"]
        }
        if where_filter:
            kwargs["where"] = where_filter

        try:
            query_res = collection.query(**kwargs)
        except Exception as query_err:
            logger.info(f"ChromaDB query returned no matches or error for filter ({query_err}). Returning empty results.")
            return []

        ids = query_res.get("ids", [[]])[0]
        docs = query_res.get("documents", [[]])[0]
        metas = query_res.get("metadatas", [[]])[0]
        distances = query_res.get("distances", [[]])[0]

        results = []
        for i in range(len(ids)):
            dist = distances[i] if i < len(distances) else 0.0
            similarity_score, similarity_label = self._compute_similarity_score(dist)

            if min_score is not None and similarity_score < min_score:
                continue

            meta = metas[i] if i < len(metas) else {}
            doc_id = meta.get("document_id")
            filename = meta.get("original_filename") or meta.get("filename") or "Unknown Document"
            doc_type = meta.get("filetype", "").upper() or "FILE"
            chunk_idx = meta.get("chunk_index", 0)

            # Strict post-filtering verification
            if filetype and filetype.strip():
                req_ft = filetype.strip().lower()
                rec_ft = str(meta.get("filetype") or meta.get("file_type") or "").lower()
                if rec_ft != req_ft:
                    continue

            if document_ids:
                clean_ids = [int(d) for d in document_ids if isinstance(d, (int, str)) and str(d).isdigit()]
                if clean_ids and (doc_id is None or int(doc_id) not in clean_ids):
                    continue

            # Build Citation Metadata
            citation = {
                "document_id": doc_id,
                "filename": filename,
                "filetype": doc_type,
                "chunk_index": f"Chunk #{chunk_idx + 1}",
                "start_char": meta.get("start_char", 0),
                "end_char": meta.get("end_char", 0),
                "word_count": meta.get("word_count", 0)
            }

            results.append({
                "id": ids[i],
                "document_id": doc_id,
                "title": filename,
                "snippet": docs[i] if i < len(docs) else "",
                "score": similarity_label,
                "similarity_score": round(similarity_score, 4),
                "distance": round(float(dist), 4),
                "chunkIndex": f"Chunk #{chunk_idx + 1}",
                "docType": doc_type,
                "metadata": meta,
                "citation": citation
            })

        # If a single document is targeted, sort chunks sequentially by chunk_index for coherent reading
        if document_ids and len(document_ids) == 1:
            results.sort(key=lambda x: x.get("metadata", {}).get("chunk_index", 0))

        return results[:top_k]

    def search_fulltext(
        self,
        db: Session,
        query_text: str,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        workspace_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Performs exact keyword full-text search over SQLite document_chunks table.
        """
        query_clean = query_text.strip()
        if not query_clean:
            return []

        # Join DocumentChunk with Document
        q = db.query(DocumentChunk, Document).join(Document, DocumentChunk.document_id == Document.id)

        if workspace_id is not None:
            q = q.filter(Document.workspace_id == int(workspace_id))
        
        # Apply case-insensitive LIKE search
        q = q.filter(DocumentChunk.chunk_text.ilike(f"%{query_clean}%"))

        if filetype and filetype.strip():
            q = q.filter(Document.filetype == filetype.strip().lower())

        if document_ids:
            clean_ids = [int(d) for d in document_ids if isinstance(d, (int, str)) and str(d).isdigit()]
            if clean_ids:
                q = q.filter(Document.id.in_(clean_ids))

        chunks_and_docs = q.limit(top_k).all()

        results = []
        for chunk, doc in chunks_and_docs:
            filename = doc.original_filename or doc.filename or "Unknown Document"
            doc_type = (doc.filetype or "").upper() or "FILE"

            meta = {}
            if chunk.metadata_json:
                try:
                    meta = json.loads(chunk.metadata_json)
                except Exception:
                    meta = {}

            citation = {
                "document_id": doc.id,
                "filename": filename,
                "filetype": doc_type,
                "chunk_index": f"Chunk #{chunk.chunk_index + 1}",
                "start_char": chunk.start_char,
                "end_char": chunk.end_char,
                "word_count": chunk.word_count
            }

            results.append({
                "id": f"doc_{doc.id}_chunk_{chunk.chunk_index}",
                "document_id": doc.id,
                "title": filename,
                "snippet": chunk.chunk_text,
                "score": "100% Match",
                "similarity_score": 1.0,
                "distance": 0.0,
                "chunkIndex": f"Chunk #{chunk.chunk_index + 1}",
                "docType": doc_type,
                "metadata": meta,
                "citation": citation
            })

        return results

    def execute_search(
        self,
        db: Session,
        query: str,
        top_k: int = 5,
        search_mode: str = "semantic",
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        min_score: Optional[float] = None,
        workspace_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Executes search, measures performance, logs query to SQLite history, and returns payload.
        """
        start_time = time.time()
        query_text = query.strip()

        if search_mode == "fulltext":
            results = self.search_fulltext(
                db=db,
                query_text=query_text,
                top_k=top_k,
                filetype=filetype,
                document_ids=document_ids,
                workspace_id=workspace_id
            )
        else:
            results = self.search_semantic(
                db=db,
                query_text=query_text,
                top_k=top_k,
                filetype=filetype,
                document_ids=document_ids,
                min_score=min_score,
                workspace_id=workspace_id
            )

        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        # Log search query to SQLite SearchHistory table
        filters_dict = {}
        if workspace_id is not None:
            filters_dict["workspace_id"] = workspace_id
        if filetype:
            filters_dict["filetype"] = filetype
        if document_ids:
            filters_dict["document_ids"] = document_ids
        if min_score is not None:
            filters_dict["min_score"] = min_score

        try:
            history_entry = SearchHistory(
                query_text=query_text,
                search_mode=search_mode,
                filters_json=json.dumps(filters_dict) if filters_dict else None,
                results_count=len(results),
                execution_time_ms=elapsed_ms
            )
            db.add(history_entry)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to record search history: {e}")
            db.rollback()

        return {
            "query": query_text,
            "search_mode": search_mode,
            "top_k": top_k,
            "execution_time_ms": elapsed_ms,
            "results_count": len(results),
            "results": results
        }

    def get_history(self, db: Session, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Returns recent search history entries from SQLite.
        """
        records = db.query(SearchHistory).order_by(SearchHistory.created_at.desc()).limit(limit).all()
        history_list = []
        for r in records:
            filters = None
            if r.filters_json:
                try:
                    filters = json.loads(r.filters_json)
                except Exception:
                    filters = None
            history_list.append({
                "id": r.id,
                "query_text": r.query_text,
                "search_mode": r.search_mode,
                "filters": filters,
                "results_count": r.results_count,
                "execution_time_ms": r.execution_time_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return history_list

    def clear_history(self, db: Session) -> int:
        """
        Deletes all search history entries from SQLite.
        """
        deleted_count = db.query(SearchHistory).delete()
        db.commit()
        return deleted_count

    def delete_history_item(self, db: Session, history_id: int) -> bool:
        """
        Deletes a single search history entry by ID.
        """
        item = db.query(SearchHistory).filter(SearchHistory.id == history_id).first()
        if not item:
            return False
        db.delete(item)
        db.commit()
        return True


search_service = SearchService()
