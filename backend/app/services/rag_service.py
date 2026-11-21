import os
import json
import time
import logging
from typing import List, Dict, Any, Optional, Tuple, Generator
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.search_service import search_service
from app.services.providers import get_llm_provider, OfflineModeEnforcedError, CloudProviderError

logger = logging.getLogger("app")


class RAGPipelineService:
    """
    Module 09: RAG Pipeline Service.
    Integrates ChromaDB vector retrieval, top-K context selection, token limit management,
    system prompt building, source citation mapping, local Ollama LLM inference,
    and streaming responses.
    """

    def _get_unavailable_reason(self, db: Session, document_ids: Optional[List[int]] = None) -> str:
        from app.models.document import Document
        if document_ids and len(document_ids) == 1:
            doc = db.query(Document).filter(Document.id == document_ids[0]).first()
            if not doc:
                return f"Document ID {document_ids[0]} was not found in database."
            if doc.status == "failed":
                return f"Document '{doc.original_filename}' failed processing with error: {doc.error_message or 'Unknown extraction error'}."
            if doc.status in ("uploaded", "processing"):
                return f"Document '{doc.original_filename}' is currently processing (status: '{doc.status}'). Please wait a moment and try again."
            if not (doc.cleaned_text or doc.extracted_text or "").strip():
                return f"Document '{doc.original_filename}' was uploaded but contains no extractable text content."
            if doc.status not in ("embedded", "indexed"):
                return f"Document '{doc.original_filename}' has status '{doc.status}' and has not been indexed into ChromaDB vector storage."
            return f"No matching vector content could be retrieved from document '{doc.original_filename}'."
        
        total_docs = db.query(Document).count()
        if total_docs == 0:
            return "No documents found in workspace. Please upload a PDF or DOCX file to use Document Chat."
        return "No relevant document context found in your workspace for this query."

    def retrieve_context(
        self,
        db: Session,
        query: str,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        min_score: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves semantically relevant document chunks from ChromaDB.
        Automatically boosts top_k when a specific document is selected or an analysis query is asked.
        """
        analytical_keywords = ["analyze", "summarize", "summary", "overview", "explain", "everything", "what is in", "content", "tell me about", "describe", "detail", "takeaway"]
        query_lower = query.lower()
        is_analysis = any(kw in query_lower for kw in analytical_keywords)

        effective_top_k = top_k
        if document_ids or is_analysis:
            effective_top_k = max(top_k, 25)

        results = search_service.search_semantic(
            db=db,
            query_text=query,
            top_k=effective_top_k,
            filetype=filetype,
            document_ids=document_ids,
            min_score=min_score
        )

        # Fallback to exact keyword / full-text search in SQLite chunks if semantic search returned no results
        if not results:
            results = search_service.search_fulltext(
                db=db,
                query_text=query,
                top_k=effective_top_k,
                filetype=filetype,
                document_ids=document_ids
            )
            for r in results:
                r["score"] = "Lexical Full-Text Match"

        # If a single document is targeted and still no results, retrieve the document's top chunks directly
        if not results and document_ids and len(document_ids) == 1:
            logger.info(f"Retrieving top chunks directly for target document ID {document_ids[0]}.")
            doc = db.query(Document).filter(Document.id == document_ids[0]).first()
            if doc:
                doc_chunks = (
                    db.query(DocumentChunk)
                    .filter(DocumentChunk.document_id == doc.id)
                    .order_by(DocumentChunk.chunk_index.asc())
                    .limit(effective_top_k)
                    .all()
                )
                for dc in doc_chunks:
                    results.append({
                        "id": f"chunk_{dc.id}",
                        "document_id": doc.id,
                        "title": doc.original_filename or doc.filename,
                        "snippet": dc.chunk_text,
                        "score": "Direct Match",
                        "similarity_score": 1.0,
                        "distance": 0.0,
                        "chunkIndex": f"Chunk #{dc.chunk_index + 1}",
                        "docType": (doc.filetype or "").upper(),
                        "citation": {
                            "document_id": doc.id,
                            "filename": doc.original_filename or doc.filename,
                            "filetype": (doc.filetype or "").upper(),
                            "chunk_index": f"Chunk #{dc.chunk_index + 1}"
                        }
                    })

        return results

    @staticmethod
    def manage_token_limits(chunks: List[Dict[str, Any]], max_chars: int = 16000) -> List[Dict[str, Any]]:
        """
        Truncates/filters context chunks so total character count stays within prompt token budget.
        Approx 4 chars per token -> 16000 chars ~ 4000 tokens.
        """
        selected_chunks = []
        current_chars = 0

        for chunk in chunks:
            text_len = len(chunk.get("snippet", ""))
            if current_chars + text_len > max_chars and selected_chunks:
                break
            selected_chunks.append(chunk)
            current_chars += text_len

        return selected_chunks

    def map_citations(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Maps retrieved ChromaDB chunks into structured source citation metadata.
        """
        citations = []
        for c in chunks:
            cit = c.get("citation", {})
            filename = cit.get("filename") or c.get("title") or "Unknown Document"
            chunk_idx = cit.get("chunk_index") or c.get("chunkIndex") or "Chunk #1"
            score_str = c.get("score") or "90% Match"

            citations.append({
                "docName": filename,
                "page": chunk_idx,
                "score": score_str,
                "documentId": c.get("document_id"),
                "startChar": cit.get("start_char", 0),
                "endChar": cit.get("end_char", 0),
                "similarityScore": c.get("similarity_score", 0.0),
                "vectorDistance": c.get("distance", 0.0)
            })
        return citations

    def build_prompt(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        custom_system_prompt: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[str, str]:
        """
        Constructs system prompt and RAG context prompt for Ollama LLM inference.
        Incorporates recent conversation history for accurate follow-up comprehension.
        """
        system_prompt = (
            custom_system_prompt or
            "You are CogniDesk AI, an offline privacy-first AI workspace assistant.\n"
            "Answer the user's question accurately and thoroughly using ONLY the provided document context below.\n"
            "Do not invent facts, extrapolate, or assume information not present in the context.\n"
            "Always cite the source document filename and chunk number (e.g. [Source 1: document.docx (Chunk #1)]) when detailing information.\n"
            "If the document context does not contain enough information to answer the question, state that clearly and accurately based on the context."
        )

        context_blocks = []
        for idx, chunk in enumerate(context_chunks, 1):
            title = chunk.get("title", "Document")
            chunk_idx = chunk.get("chunkIndex", "Chunk #1")
            score = chunk.get("score", "")
            snippet = chunk.get("snippet", "").strip()

            header = f"[Source {idx}: {title} ({chunk_idx}, {score})]"
            context_blocks.append(f"{header}\n{snippet}")

        context_str = "\n\n".join(context_blocks) if context_blocks else "No relevant document context found."

        history_str = ""
        if conversation_history:
            recent_turns = []
            for m in conversation_history[-6:]:
                role = "User" if m.get("sender") == "user" or m.get("role") == "user" else "Assistant"
                txt = str(m.get("text") or m.get("content") or "").strip()
                if txt:
                    recent_turns.append(f"{role}: {txt}")
            if recent_turns:
                history_str = "=== RECENT CONVERSATION HISTORY ===\n" + "\n".join(recent_turns) + "\n=== END HISTORY ===\n\n"

        full_prompt = (
            f"=== RETRIEVED DOCUMENT CONTEXT ===\n"
            f"{context_str}\n"
            f"=== END CONTEXT ===\n\n"
            f"{history_str}"
            f"USER QUESTION: {query.strip()}\n\n"
            f"ANSWER:"
        )

        return system_prompt, full_prompt

    def check_ollama_status(self, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        Checks local Ollama service connectivity and fetches available models.
        Prefers 127.0.0.1 to prevent Windows IPv6 resolution latency/timeouts.
        Consults persistent AppSetting if database session is provided.
        """
        configured_url = None
        configured_model = None
        if db is not None:
            try:
                from app.models.setting import AppSetting
                app_setting = db.query(AppSetting).filter(AppSetting.id == 1).first()
                if app_setting:
                    configured_url = app_setting.ollama_base_url
                    configured_model = app_setting.ollama_model
            except Exception:
                pass

        urls_to_try = []
        if configured_url:
            urls_to_try.append(configured_url)
        urls_to_try.extend([
            "http://127.0.0.1:11434",
            getattr(settings, "OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
            "http://localhost:11434"
        ])
        
        # Deduplicate while preserving order
        seen = set()
        base_urls = [url for url in urls_to_try if not (url in seen or seen.add(url))]

        default_model = configured_model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")

        for base_url in base_urls:
            try:
                with httpx.Client(timeout=3.0) as client:
                    res = client.get(f"{base_url}/api/tags")
                    if res.status_code == 200:
                        models_data = res.json().get("models", [])
                        model_names = [m.get("name") for m in models_data if m.get("name")]
                        return {
                            "online": True,
                            "is_hosted": False,
                            "base_url": base_url,
                            "models": model_names or [default_model],
                            "mode_label": "Local Ollama"
                        }
            except Exception:
                pass

        has_hosted = getattr(settings, "is_hosted", lambda: False)()

        # Check for DB custom key
        db_has_key = False
        db_provider = "openai"
        db_model = "gpt-4o-mini"
        if db is not None:
            try:
                from app.models.setting import AppSetting
                st = db.query(AppSetting).filter(AppSetting.id == 1).first()
                if st and st.cloud_api_key and st.cloud_api_key.strip():
                    db_has_key = True
                    db_provider = st.cloud_provider or "openai"
                    db_model = st.cloud_model or "gpt-4o-mini"
            except Exception:
                pass

        has_keys = bool(
            getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or
            getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY") or
            getattr(settings, "OPENAI_API_KEY", None) or os.environ.get("OPENAI_API_KEY") or
            getattr(settings, "ANTHROPIC_API_KEY", None) or os.environ.get("ANTHROPIC_API_KEY") or
            getattr(settings, "OPENROUTER_API_KEY", None) or os.environ.get("OPENROUTER_API_KEY") or
            db_has_key
        )

        if has_hosted or db_has_key:
            if not has_keys:
                return {
                    "online": False,
                    "is_hosted": True,
                    "unconfigured": True,
                    "provider": "unconfigured",
                    "base_url": "",
                    "models": [],
                    "mode_label": "Cloud AI (Key Required)",
                    "setup_message": "No hosted AI provider API key is configured. Add GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in Render environment variables or configure in Settings."
                }
            provider_name = (
                db_provider if db_has_key else (
                    getattr(settings, "HOSTED_LLM_PROVIDER", None) or (
                        "gemini" if (getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")) else (
                            "groq" if getattr(settings, "GROQ_API_KEY", None) else (
                                "openrouter" if getattr(settings, "OPENROUTER_API_KEY", None) else (
                                    "openai" if getattr(settings, "OPENAI_API_KEY", None) else (
                                        "anthropic" if getattr(settings, "ANTHROPIC_API_KEY", None) else "cloud"
                                    )
                                )
                            )
                        )
                    )
                )
            )
            model_name = (
                db_model if db_has_key else (
                    getattr(settings, "HOSTED_LLM_MODEL", None) or (
                        "gemini-3.8-flash" if provider_name == "gemini" else (
                            "llama-3.3-70b-versatile" if provider_name == "groq" else (
                                "gpt-4o-mini" if provider_name == "openai" else (
                                    "claude-3-5-sonnet-20241022" if provider_name == "anthropic" else "hosted-model"
                                )
                            )
                        )
                    )
                )
            )
            return {
                "online": True,
                "is_hosted": True,
                "unconfigured": False,
                "provider": provider_name,
                "base_url": getattr(settings, "HOSTED_LLM_BASE_URL", None) or ("https://generativelanguage.googleapis.com" if provider_name == "gemini" else f"https://api.{provider_name}.com"),
                "models": [model_name, "default"],
                "mode_label": f"Cloud AI ({provider_name.title()})"
            }

        default_base = configured_url or getattr(settings, "OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        return {
            "online": False,
            "is_hosted": False,
            "base_url": default_base,
            "models": [default_model],
            "mode_label": "Local Ollama Required"
        }

    def generate_response(
        self,
        db: Session,
        query: str,
        mode: Optional[str] = "document",
        model: Optional[str] = None,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Executes non-streaming response for Normal Chat or Document RAG Chat.
        Incorporates conversation history for accurate follow-up comprehension.
        """
        start_time = time.time()
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")

        if mode in ("normal", "general"):
            selected_chunks = []
            citations = []
            sys_prompt = (
                system_prompt or
                "You are CogniDesk AI, a helpful, intelligent offline privacy-first AI assistant. "
                "Answer the user's question clearly, accurately, and politely."
            )
            if messages:
                recent_turns = []
                for m in messages[-6:]:
                    role = "User" if m.get("sender") == "user" or m.get("role") == "user" else "Assistant"
                    txt = str(m.get("text") or m.get("content") or "").strip()
                    if txt:
                        recent_turns.append(f"{role}: {txt}")
                if recent_turns:
                    user_prompt = "=== RECENT CONVERSATION HISTORY ===\n" + "\n".join(recent_turns) + "\n=== END HISTORY ===\n\nUser: " + query
                else:
                    user_prompt = query
            else:
                user_prompt = query
        else:
            try:
                # 1. Retrieve Context from ChromaDB
                raw_chunks = self.retrieve_context(
                    db=db,
                    query=query,
                    top_k=top_k,
                    filetype=filetype,
                    document_ids=document_ids
                )
                # 2. Token Limit Management (Truncation)
                selected_chunks = self.manage_token_limits(raw_chunks, max_chars=10000)
                # 3. Source Citation Mapping
                citations = self.map_citations(selected_chunks)
                # 4. Prompt Builder with Conversation History
                sys_prompt, user_prompt = self.build_prompt(
                    query,
                    selected_chunks,
                    custom_system_prompt=system_prompt,
                    conversation_history=messages
                )
            except Exception as e:
                logger.error(f"Error preparing RAG context: {e}", exc_info=True)
                selected_chunks = []
                citations = []
                sys_prompt, user_prompt = self.build_prompt(
                    query,
                    [],
                    custom_system_prompt=system_prompt,
                    conversation_history=messages
                )

        # 5. Resolve LLM Provider & Execute Inference
        try:
            provider = get_llm_provider(db=db, force_model=model)
        except OfflineModeEnforcedError:
            raise

        try:
            llm_res = provider.generate(
                prompt=user_prompt,
                system=sys_prompt,
                model=model,
                temperature=0.3
            )
            answer_text = llm_res.text
            target_model = llm_res.model
            used_ollama = (provider.provider_name == "ollama")
        except CloudProviderError as cpe:
            logger.warning(f"Provider '{provider.provider_name}' error: {cpe}")
            answer_text = str(cpe)
            target_model = model or getattr(provider, "model", "unknown")
            used_ollama = False
        except OfflineModeEnforcedError:
            raise
        except Exception as e:
            logger.error(f"Unexpected generation error ({provider.provider_name}): {e}")
            answer_text = f"LLM Generation Error ({provider.provider_name}): {str(e)}"
            target_model = model or getattr(provider, "model", "unknown")
            used_ollama = False

        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "query": query,
            "answer": answer_text,
            "model": target_model,
            "citations": citations,
            "context_used_count": len(selected_chunks),
            "execution_time_ms": elapsed_ms,
            "ollama_online": used_ollama,
            "provider": provider.provider_name
        }

    def generate_streaming_response(
        self,
        db: Session,
        query: str,
        mode: Optional[str] = "document",
        model: Optional[str] = None,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None
    ) -> Generator[str, None, None]:
        """
        Executes streaming response yielding SSE events for Normal or Document Chat.
        Preserves token streaming, ChromaDB context citations, and real provider errors.
        Incorporates conversation history for accurate follow-up comprehension.
        """
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")

        if mode in ("normal", "general"):
            selected_chunks = []
            citations = []
            sys_prompt = (
                system_prompt or
                "You are CogniDesk AI, a helpful, intelligent offline privacy-first AI assistant. "
                "Answer the user's question clearly, accurately, and politely."
            )
            if messages:
                recent_turns = []
                for m in messages[-6:]:
                    role = "User" if m.get("sender") == "user" or m.get("role") == "user" else "Assistant"
                    txt = str(m.get("text") or m.get("content") or "").strip()
                    if txt:
                        recent_turns.append(f"{role}: {txt}")
                if recent_turns:
                    user_prompt = "=== RECENT CONVERSATION HISTORY ===\n" + "\n".join(recent_turns) + "\n=== END HISTORY ===\n\nUser: " + query
                else:
                    user_prompt = query
            else:
                user_prompt = query
        else:
            try:
                # 1. Retrieve & Format Context from ChromaDB
                raw_chunks = self.retrieve_context(
                    db=db,
                    query=query,
                    top_k=top_k,
                    filetype=filetype,
                    document_ids=document_ids
                )
                selected_chunks = self.manage_token_limits(raw_chunks, max_chars=10000)
                citations = self.map_citations(selected_chunks)
                sys_prompt, user_prompt = self.build_prompt(
                    query,
                    selected_chunks,
                    custom_system_prompt=system_prompt,
                    conversation_history=messages
                )
            except Exception as e:
                logger.error(f"Error retrieving streaming context: {e}", exc_info=True)
                selected_chunks = []
                citations = []
                sys_prompt, user_prompt = self.build_prompt(
                    query,
                    [],
                    custom_system_prompt=system_prompt,
                    conversation_history=messages
                )

        # 2. Resolve LLM Provider & Enforce Offline Mode
        try:
            provider = get_llm_provider(db=db, force_model=model)
            resolved_model = getattr(provider, "model", getattr(provider, "default_model", target_model))
        except OfflineModeEnforcedError as ome:
            header_meta = {
                "type": "metadata",
                "model": target_model,
                "citations": citations,
                "context_used_count": len(selected_chunks),
                "provider": "offline_rejection"
            }
            yield f"data: {json.dumps(header_meta)}\n\n"
            yield f"data: {json.dumps({'type': 'token', 'token': f'Offline Mode Rejection: {str(ome)}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        header_meta = {
            "type": "metadata",
            "model": resolved_model,
            "citations": citations,
            "context_used_count": len(selected_chunks),
            "provider": provider.provider_name
        }
        yield f"data: {json.dumps(header_meta)}\n\n"

        tokens_yielded = 0
        try:
            for token in provider.stream_generate(
                prompt=user_prompt,
                system=sys_prompt,
                model=model,
                temperature=0.3
            ):
                if token:
                    tokens_yielded += 1
                    chunk_event = {"type": "token", "token": token}
                    yield f"data: {json.dumps(chunk_event)}\n\n"
            if tokens_yielded == 0:
                logger.info(f"Streaming yielded 0 tokens for {provider.provider_name}, generating complete answer as fallback...")
                res = provider.generate(
                    prompt=user_prompt,
                    system=sys_prompt,
                    model=model,
                    temperature=0.3
                )
                if res.text:
                    yield f"data: {json.dumps({'type': 'token', 'token': res.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except CloudProviderError as cpe:
            logger.warning(f"Provider {provider.provider_name} streaming error: {cpe}, attempting non-streaming generate fallback...")
            try:
                res = provider.generate(
                    prompt=user_prompt,
                    system=sys_prompt,
                    model=model,
                    temperature=0.3
                )
                if res.text:
                    yield f"data: {json.dumps({'type': 'token', 'token': res.text})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            except Exception as gen_err:
                logger.warning(f"Generate fallback also failed: {gen_err}")
            error_event = {
                "type": "error",
                "error": str(cpe),
                "status_code": getattr(cpe, "status_code", 503) or 503,
                "provider": getattr(cpe, "provider", provider.provider_name)
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.error(f"Unexpected streaming error ({provider.provider_name}): {e}")
            error_event = {
                "type": "error",
                "error": f"Error: {str(e)}",
                "status_code": 500,
                "provider": provider.provider_name
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"


    def get_context_only(
        self,
        db: Session,
        query: str,
        top_k: int = 5,
        filetype: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves context chunks from ChromaDB, applies token limit management,
        maps citations, and formats system/user prompts without calling Ollama inference.
        Useful for inspecting RAG context preparation.
        """
        start_time = time.time()
        raw_chunks = self.retrieve_context(
            db=db,
            query=query,
            top_k=top_k,
            filetype=filetype,
            document_ids=document_ids
        )
        selected_chunks = self.manage_token_limits(raw_chunks, max_chars=16000)
        citations = self.map_citations(selected_chunks)
        sys_prompt, user_prompt = self.build_prompt(query, selected_chunks, custom_system_prompt=system_prompt)
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "query": query,
            "system_prompt": sys_prompt,
            "full_prompt": user_prompt,
            "citations": citations,
            "context_chunks": selected_chunks,
            "raw_chunks_count": len(raw_chunks),
            "selected_chunks_count": len(selected_chunks),
            "estimated_tokens": sum(len(c.get("snippet", "")) for c in selected_chunks) // 4,
            "execution_time_ms": elapsed_ms
        }


rag_service = RAGPipelineService()

