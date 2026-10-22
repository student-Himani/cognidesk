import json
import re
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from datetime import datetime
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.flashcard import FlashcardDeck, Flashcard
from app.services.rag_service import rag_service

logger = logging.getLogger("app")


class FlashcardsService:
    """
    Offline Flashcards Service:
    Generates study flashcards strictly from indexed document text and chunks
    using local Ollama LLM, attaches verified chunk citations, and manages study decks & progress in SQLite.
    Never generates cards from filenames, placeholder text, schema examples, or truncated sentence snippets.
    """

    def get_all_decks(self, db: Session, workspace_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Fetch all flashcard decks ordered by most recently updated, optionally filtered by workspace_id."""
        query = db.query(FlashcardDeck)
        if workspace_id is not None:
            query = query.filter(FlashcardDeck.workspace_id == workspace_id)
        decks = query.order_by(FlashcardDeck.updated_at.desc()).all()
        result = []
        for deck in decks:
            accuracy = 0
            if deck.completed_cards > 0:
                accuracy = round((deck.correct_count / deck.completed_cards) * 100)
            result.append({
                "id": deck.id,
                "workspace_id": deck.workspace_id,
                "title": deck.title,
                "document_id": deck.document_id,
                "document_name": deck.document_name,
                "total_cards": deck.total_cards,
                "completed_cards": deck.completed_cards,
                "correct_count": deck.correct_count,
                "incorrect_count": deck.incorrect_count,
                "accuracy": accuracy,
                "created_at": deck.created_at.isoformat() if deck.created_at else None,
                "updated_at": deck.updated_at.isoformat() if deck.updated_at else None,
            })
        return result

    def get_deck_by_id(self, db: Session, deck_id: int) -> Optional[Dict[str, Any]]:
        """Fetch single deck by ID with all its cards."""
        deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == deck_id).first()
        if not deck:
            return None

        cards = (
            db.query(Flashcard)
            .filter(Flashcard.deck_id == deck_id)
            .order_by(Flashcard.id.asc())
            .all()
        )

        accuracy = 0
        if deck.completed_cards > 0:
            accuracy = round((deck.correct_count / deck.completed_cards) * 100)

        return {
            "id": deck.id,
            "workspace_id": deck.workspace_id,
            "title": deck.title,
            "document_id": deck.document_id,
            "document_name": deck.document_name,
            "total_cards": deck.total_cards,
            "completed_cards": deck.completed_cards,
            "correct_count": deck.correct_count,
            "incorrect_count": deck.incorrect_count,
            "accuracy": accuracy,
            "created_at": deck.created_at.isoformat() if deck.created_at else None,
            "updated_at": deck.updated_at.isoformat() if deck.updated_at else None,
            "cards": [
                {
                    "id": c.id,
                    "deck_id": c.deck_id,
                    "document_id": c.document_id,
                    "question": c.question,
                    "answer": c.answer,
                    "topic": c.topic or "General",
                    "source_filename": c.source_filename,
                    "chunk_index": c.chunk_index,
                    "citation": c.citation or f"Chunk #{c.chunk_index or 1}",
                    "user_answer_status": c.user_answer_status,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in cards
            ],
        }

    def delete_deck(self, db: Session, deck_id: int) -> bool:
        """Delete a deck and all associated cards."""
        deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == deck_id).first()
        if not deck:
            return False

        db.delete(deck)
        db.commit()
        return True

    def reset_deck_progress(self, db: Session, deck_id: int) -> Optional[Dict[str, Any]]:
        """Reset study progress for all cards in a deck."""
        deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == deck_id).first()
        if not deck:
            return None

        cards = db.query(Flashcard).filter(Flashcard.deck_id == deck_id).all()
        for card in cards:
            card.user_answer_status = "unanswered"

        deck.completed_cards = 0
        deck.correct_count = 0
        deck.incorrect_count = 0
        deck.updated_at = datetime.utcnow()

        db.commit()
        return self.get_deck_by_id(db, deck_id)

    def update_card_progress(
        self, db: Session, card_id: int, status: str
    ) -> Optional[Dict[str, Any]]:
        """
        Update study answer status for a single card ("correct", "incorrect", or "unanswered").
        Recalculates deck progress statistics in SQLite.
        """
        valid_statuses = ("correct", "incorrect", "unanswered")
        if status not in valid_statuses:
            raise ValueError(f"Invalid status '{status}'. Must be one of {valid_statuses}.")

        card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            return None

        card.user_answer_status = status
        card.updated_at = datetime.utcnow()

        deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == card.deck_id).first()
        if deck:
            all_cards = db.query(Flashcard).filter(Flashcard.deck_id == deck.id).all()
            correct = sum(1 for c in all_cards if c.user_answer_status == "correct")
            incorrect = sum(1 for c in all_cards if c.user_answer_status == "incorrect")
            completed = correct + incorrect

            deck.correct_count = correct
            deck.incorrect_count = incorrect
            deck.completed_cards = completed
            deck.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(card)

        return {
            "card_id": card.id,
            "deck_id": card.deck_id,
            "user_answer_status": card.user_answer_status,
            "deck_stats": {
                "total_cards": deck.total_cards if deck else 0,
                "completed_cards": deck.completed_cards if deck else 0,
                "correct_count": deck.correct_count if deck else 0,
                "incorrect_count": deck.incorrect_count if deck else 0,
                "accuracy": (
                    round((deck.correct_count / deck.completed_cards) * 100)
                    if deck and deck.completed_cards > 0
                    else 0
                ),
            },
        }

    # =========================================================================
    # Strict Card Validation & Quality Filtering
    # =========================================================================

    @staticmethod
    def _normalize_for_duplicate_check(text: str) -> str:
        """Normalizes question string for duplicate detection."""
        lowered = text.lower().strip()
        # Remove punctuation
        return re.sub(r"[^a-z0-9\s]", "", lowered).strip()

    def _is_valid_card(
        self, card: Dict[str, Any], seen_questions: Set[str]
    ) -> Tuple[bool, Optional[str]]:
        """
        Strict validation of generated flashcard.
        Rejects:
        - Incomplete questions or questions not ending in '?'
        - Questions or answers ending in '...' or '…'
        - Boilerplate/schema leakage ('...', 'question', 'answer', 'See document content.', 'Review Question')
        - Snippet-wrapping questions ('According to filename, what is the significance of...')
        - Questions shorter than 15 characters
        - Answers shorter than 15 characters
        - Duplicate or near-duplicate questions
        """
        if not isinstance(card, dict):
            return False, "Card is not a JSON object"

        q = str(card.get("question", "")).strip()
        a = str(card.get("answer", "")).strip()

        if not q or not a:
            return False, "Question or answer is empty"

        # Check for ellipses truncation
        if q.endswith("...") or q.endswith("…") or a.endswith("...") or a.endswith("…"):
            return False, "Question or answer ends with ellipses (...)"

        # Check minimum length
        if len(q) < 15:
            return False, f"Question too short ({len(q)} chars, minimum 15)"
        if len(a) < 15:
            return False, f"Answer too short ({len(a)} chars, minimum 15)"

        # Question must end in '?'
        if not q.endswith("?"):
            return False, "Question does not end with a question mark (?)"

        # Reject schema placeholders
        lower_q = q.lower()
        lower_a = a.lower()
        banned_phrases = [
            "review question",
            "see document content",
            "insert question",
            "insert answer",
            "sample question",
            "schema example",
            "what is discussed in chunk",
            "according to",  # Rejects old template quotes
            "what key information is detailed regarding",
            "review key takeaway from section",
        ]
        for phrase in banned_phrases:
            if phrase in lower_q or phrase in lower_a:
                return False, f"Contains banned placeholder/boilerplate phrase '{phrase}'"

        # Reject cards that simply wrap quotes with ellipses e.g. "snippet..."?
        if '"' in q and ("..." in q or "…" in q):
            return False, "Question contains truncated snippet in quotes"

        # Reject identical question and answer
        if lower_q.rstrip("?") == lower_a.rstrip("."):
            return False, "Question and answer are identical"

        # Duplicate check
        norm_q = self._normalize_for_duplicate_check(q)
        if norm_q in seen_questions:
            return False, "Duplicate question already exists in deck"

        # Word overlap duplicate check
        words_q = set(norm_q.split())
        for existing in seen_questions:
            existing_words = set(existing.split())
            if len(words_q) > 4 and len(existing_words) > 4:
                overlap = len(words_q & existing_words) / max(len(words_q), len(existing_words))
                if overlap > 0.85:
                    return False, "Question is too similar to an existing card in deck"

        return True, None

    def _extract_cards_json(
        self, raw_response: str, seen_questions: Optional[Set[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Robustly extracts, parses, and validates flashcards from LLM response.
        Handles markdown code blocks, bracket matching, and regex object scanning.
        Filters out invalid, truncated, placeholder, or duplicate cards.
        """
        if seen_questions is None:
            seen_questions = set()

        cleaned = raw_response.strip()

        # Remove markdown code fences if present
        if "```json" in cleaned:
            match = re.search(r"```json\s*(.*?)\s*```", cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1).strip()
        elif "```" in cleaned:
            match = re.search(r"```\s*(.*?)\s*```", cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1).strip()

        raw_items: List[Any] = []

        # 1. Try direct JSON parse
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                raw_items = parsed
            elif isinstance(parsed, dict):
                for key in ("cards", "flashcards", "deck", "data"):
                    if key in parsed and isinstance(parsed[key], list):
                        raw_items = parsed[key]
                        break
        except Exception:
            pass

        # 2. Try array bracket substring
        if not raw_items:
            start_idx = cleaned.find("[")
            end_idx = cleaned.rfind("]")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                try:
                    candidate = cleaned[start_idx : end_idx + 1]
                    parsed = json.loads(candidate)
                    if isinstance(parsed, list):
                        raw_items = parsed
                except Exception:
                    pass

        # 3. Fallback: Scan for individual JSON objects
        if not raw_items:
            obj_matches = re.finditer(
                r"\{\s*\"question\"\s*:\s*\"(?:\\.|[^\"])*\",\s*\"answer\"\s*:\s*\"(?:\\.|[^\"])*\"[^}]*\}",
                cleaned,
                re.DOTALL,
            )
            for m in obj_matches:
                try:
                    card_obj = json.loads(m.group(0))
                    if isinstance(card_obj, dict):
                        raw_items.append(card_obj)
                except Exception:
                    continue

        valid_cards: List[Dict[str, Any]] = []
        for item in raw_items:
            is_valid, reason = self._is_valid_card(item, seen_questions)
            if is_valid:
                norm_q = self._normalize_for_duplicate_check(str(item.get("question", "")))
                seen_questions.add(norm_q)
                valid_cards.append(item)
            else:
                logger.debug(f"Rejected candidate card: {reason}")

        return valid_cards

    # =========================================================================
    # High-Quality Rule-Based Fact Extraction (Offline Fallback)
    # =========================================================================

    def _generate_substantive_rule_based_cards(
        self,
        chunks: List[Dict[str, Any]],
        count: int,
        doc_filename: str,
        seen_questions: Set[str],
    ) -> List[Dict[str, Any]]:
        """
        Extracts factually grounded, complete Q&A flashcards directly from document text.
        Identifies full sentences with definitions, mechanisms, roles, capabilities, or attributes.
        Supports structured slides, lists, and prose without producing ellipses or templates.
        """
        valid_cards: List[Dict[str, Any]] = []

        metadata_ignore = {
            "this", "that", "these", "those", "it", "they", "there", "which", "what",
            "presented by", "department", "project guide", "author", "date", "page",
            "slide", "table", "figure", "section", "chapter", "version", "original",
            "manipulated", "implemented", "in development", "status", "output", "input",
        }

        # Substantive pattern rules: (regex, list_of_question_templates)
        extraction_rules = [
            # 1. Direct definitions: "Term is a / refers to / is defined as ..."
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s+(?:is defined as|is a type of|is a|is an|refers to|represents|denotes)\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "What is {term} and how is it defined?",
                    "How is {term} described in this context?",
                    "What definition or concept is associated with {term}?",
                    "What is the significance of {term} according to the text?",
                ],
            ),
            # 2. Used to / Purpose / Function: "Term is used to / for / designed to ..."
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s+(?:is used to|is used for|is designed to|serves to|helps to|is responsible for|functions as)\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "What is {term} used for according to the text?",
                    "What primary function or role is performed by {term}?",
                    "How is {term} utilized according to this context?",
                    "What operation or task is {term} responsible for?",
                ],
            ),
            # 3. Purpose/Role: "The primary purpose/function/role of Term is ..."
            (
                re.compile(
                    r"^(?:The primary purpose of|The main function of|The role of|The goal of)\s+([A-Za-z0-9\s\-_\(\)]{2,50})\s+is\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "What is the primary role or function of {term}?",
                    "What is the stated objective or goal of {term}?",
                    "How is the purpose of {term} outlined in the text?",
                    "What core responsibility does {term} have?",
                ],
            ),
            # 4. Capabilities / Actions: "Term enables / allows / provides / combines / filters / stores ..."
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s+(?:enables|allows|provides|supports|ensures|detects|analyzes|extracts|connects|integrates|contains|includes|helps|combines|combine|filters|filter|stores|manages|executes|retrieves|processes|handles|creates|defines|implements|relies on)\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "What capability or function does {term} provide?",
                    "How does {term} operate according to the document?",
                    "What action or process is carried out by {term}?",
                    "What role does {term} play in this system?",
                ],
            ),
            # 5. Key attributes: "Term is/are slow / crucial / essential / designed for ..."
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s+(?:is|are)\s+(?:slow|fast|crucial|essential|expert-dependent|designed for|responsible for|used for|dependent on|vulnerable to|effective for)\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "What are the key characteristics or requirements of {term}?",
                    "What attributes distinguish {term} according to the text?",
                    "How are the properties of {term} described in this context?",
                    "What makes {term} noteworthy in this domain?",
                ],
            ),
            # 6. Slide / Guide Key-Value Bullet: "Term: Description" or "Term - Description"
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s*[:–—\-]\s*([A-Z][^.!?\n]{15,300})",
                ),
                [
                    "How is {term} described in this context?",
                    "What key information is stated regarding {term}?",
                    "What details are provided about {term}?",
                    "What is explained concerning {term}?",
                ],
            ),
            # 7. Cause and effect: "Subject occurs/happens because/due to ..."
            (
                re.compile(
                    r"^([A-Z][A-Za-z0-9\s\-_\(\)]{2,50})\s+(?:occurs|happens|is used|is needed)\s+(?:because|due to|as a result of)\s+([^.!?\n]{15,300})",
                    re.IGNORECASE,
                ),
                [
                    "Why does {term} occur according to the text?",
                    "What causes {term} according to this context?",
                    "What reason is given for {term} in the document?",
                    "What circumstances lead to {term}?",
                ],
            ),
        ]

        # Multi-perspective passes allow concise documents with rich concepts to generate full decks
        for pass_idx in range(4):
            if len(valid_cards) >= count:
                break

            for chunk in chunks:
                if len(valid_cards) >= count:
                    break

                text = chunk.get("text", "").strip()
                chunk_idx = chunk.get("index", 1)
                citation = chunk.get("citation", f"Chunk #{chunk_idx}")

                # Extract both full sentences and structured non-empty lines
                candidate_units = []

                # 1. Split into sentence units
                sentences = [
                    s.strip()
                    for s in re.split(r"(?<=[.!?])\s+", text)
                    if len(s.strip()) >= 25 and not s.strip().startswith("---")
                ]
                candidate_units.extend(sentences)

                # 2. Add individual lines (for slide bullets or structured definitions)
                lines = [
                    ln.strip()
                    for ln in text.splitlines()
                    if len(ln.strip()) >= 25 and not ln.strip().startswith("---")
                ]
                for ln in lines:
                    if ln not in candidate_units:
                        candidate_units.append(ln)

                for unit in candidate_units:
                    if len(valid_cards) >= count:
                        break

                    # Sanitize statement: normalize whitespace and remove page delimiters/metadata prefixes
                    cleaned_statement = re.sub(r"[\r\n]+", " ", unit)
                    cleaned_statement = re.sub(r"-{2,}\s*Page\s*\d+.*$", "", cleaned_statement, flags=re.IGNORECASE)
                    cleaned_statement = re.sub(r"^(?:ORIGINAL|MANIPULATED|STATUS|OUTPUT|INPUT|PAGE\s+\d+|SLIDE\s+\d+)\s+", "", cleaned_statement, flags=re.IGNORECASE)
                    cleaned_statement = re.sub(r"\s+", " ", cleaned_statement).strip(" ,;:-")
                    if not cleaned_statement.endswith((".", "!", "?")):
                        cleaned_statement += "."

                    for pat, q_templates in extraction_rules:
                        m = pat.search(cleaned_statement)
                        if m:
                            term = m.group(1).strip()
                            term_lower = term.lower()

                            if len(term) < 3 or term_lower in metadata_ignore:
                                continue

                            q_template = q_templates[pass_idx % len(q_templates)]
                            question = q_template.format(term=term)
                            card = {
                                "question": question,
                                "answer": cleaned_statement,
                                "topic": term[:30],
                                "chunk_index": chunk_idx,
                                "citation": f"{doc_filename} • {citation}",
                            }

                            is_valid, _ = self._is_valid_card(card, seen_questions)
                            if is_valid:
                                norm = self._normalize_for_duplicate_check(question)
                                seen_questions.add(norm)
                                valid_cards.append(card)
                                break

        return valid_cards

    # =========================================================================
    # Ollama Batch Generation with Corrective Prompt Retry
    # =========================================================================

    def _generate_cards_with_llm(
        self,
        provider: Any,
        model: Optional[str],
        doc_filename: str,
        context_chunks: List[Dict[str, Any]],
        target_count: int,
        seen_questions: Set[str],
    ) -> List[Dict[str, Any]]:
        """
        Generates cards using the active LLM provider (hosted Groq/Gemini/OpenAI/Anthropic or local Ollama).
        If initial generation produces malformed JSON or fewer valid cards, retries with a corrective prompt.
        """
        context_blocks = []
        for c in context_chunks:
            chunk_idx = c.get("index", 1)
            text_snippet = c.get("text", "").strip()
            context_blocks.append(f"[Chunk #{chunk_idx}]\n{text_snippet}")
        context_str = "\n\n".join(context_blocks)

        sys_prompt = (
            "You are an expert educational AI flashcard creator for CogniDesk.\n"
            "Generate high-quality, clear, self-contained study flashcards based STRICTLY on the provided document text.\n"
            "CRITICAL RULES:\n"
            "1. Base every flashcard strictly and directly on facts, definitions, processes, or concepts in the context.\n"
            "2. NEVER fabricate, assume, or extrapolate facts not explicitly stated in the document.\n"
            "3. Every question must be a complete interrogative sentence ending in a question mark (?).\n"
            "4. Questions must test important concepts, definitions, mechanisms, or distinctions.\n"
            "5. NEVER create generic questions (e.g. do NOT ask 'What is discussed in section 1?', 'What is the significance of...', or questions quoting truncated text).\n"
            "6. Answers must be 1 to 4 complete sentences directly answering the question with factual details from the document.\n"
            "7. NEVER end questions or answers with ellipses ('...') or cut off mid-sentence.\n"
            "8. For each card, output:\n"
            "   - 'question': The full, clear question string ending with '?'.\n"
            "   - 'answer': The complete, detailed answer string.\n"
            "   - 'topic': A concise 2-4 word topic label.\n"
            "   - 'chunk_index': The integer chunk number ([Chunk #X]) where the source fact is located.\n"
            "   - 'citation': The source citation (e.g. 'Chunk #1').\n"
            "9. Output ONLY a valid JSON array of objects. No markdown explanations or preamble outside the JSON."
        )

        user_prompt = (
            f"Document Title: {doc_filename}\n\n"
            f"=== DOCUMENT CONTEXT ===\n"
            f"{context_str}\n"
            f"=== END CONTEXT ===\n\n"
            f"Generate exactly {target_count} distinct, complete, high-quality flashcards in JSON format matching this schema:\n"
            "[\n"
            '  {"question": "What is the primary function of [Concept]?", "answer": "[Complete factual statement from context]", "topic": "Concept", "chunk_index": 1, "citation": "Chunk #1"}\n'
            "]"
        )

        parsed_cards: List[Dict[str, Any]] = []
        raw_response = ""

        try:
            if hasattr(provider, "generate"):
                res = provider.generate(
                    prompt=user_prompt,
                    system=sys_prompt,
                    model=model,
                    temperature=0.2,
                    max_tokens=min(2500, max(500, target_count * 150))
                )
                raw_response = getattr(res, "text", "") or ""
                parsed_cards = self._extract_cards_json(raw_response, seen_questions)
        except Exception as e:
            logger.error(f"Error querying LLM provider for flashcards: {e}", exc_info=True)

        # Corrective Retry if failed or returned fewer than half requested cards
        if len(parsed_cards) < target_count and provider:
            logger.info(
                f"Initial LLM pass produced {len(parsed_cards)}/{target_count} valid cards. "
                "Retrying with corrective prompt..."
            )
            needed = target_count - len(parsed_cards)
            corrective_prompt = (
                f"Your previous output contained formatting errors or incomplete cards.\n"
                f"Please generate {needed} MORE distinct, valid flashcards strictly from the document context below.\n"
                "MANDATORY REQUIREMENTS:\n"
                "- Output ONLY a valid JSON array of objects.\n"
                "- Every 'question' must end with a question mark (?).\n"
                "- Every 'answer' must be a complete factual sentence (at least 15 characters).\n"
                "- DO NOT use ellipses ('...') or cut off mid-sentence.\n"
                "- DO NOT use placeholder text or schema examples.\n\n"
                f"=== DOCUMENT CONTEXT ===\n{context_str}\n=== END CONTEXT ===\n"
            )
            try:
                res2 = provider.generate(
                    prompt=corrective_prompt,
                    system=sys_prompt,
                    model=model,
                    temperature=0.2,
                    max_tokens=min(2500, max(500, needed * 150))
                )
                retry_response = getattr(res2, "text", "") or ""
                retry_cards = self._extract_cards_json(retry_response, seen_questions)
                parsed_cards.extend(retry_cards)
            except Exception as e:
                logger.warning(f"Flashcard corrective retry notice: {e}")

        return parsed_cards[:target_count]

    # =========================================================================
    # Chunk Gathering & Text Validation
    # =========================================================================

    def _get_document_chunks_and_validate(
        self, db: Session, doc: Document, count: int
    ) -> List[Dict[str, Any]]:
        """
        Validates document processing status and retrieves authentic chunks / text.
        Raises ValueError if document extraction failed or document text is empty.
        """
        if doc.status == "failed":
            raise ValueError(
                f"Document '{doc.original_filename}' failed extraction with error: "
                f"{doc.error_message or 'Text extraction failed'}. Cannot generate flashcards from failed document."
            )
        if doc.status in ("uploaded", "processing"):
            raise ValueError(
                f"Document '{doc.original_filename}' is still processing. Please wait until document processing finishes."
            )

        # 1. Fetch chunks from SQLite DocumentChunk table
        db_chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == doc.id)
            .order_by(DocumentChunk.chunk_index.asc())
            .all()
        )

        chunk_data = []
        if db_chunks:
            for chk in db_chunks:
                txt = (chk.chunk_text or "").strip()
                if len(txt) >= 30:  # Ignore empty or tiny metadata fragments
                    chunk_data.append({
                        "index": chk.chunk_index,
                        "text": txt,
                        "citation": f"Chunk #{chk.chunk_index}",
                    })

        # Supplement with any missing conceptual sentences from cleaned_text if SQLite chunks are sparse
        raw_text = (doc.cleaned_text or doc.extracted_text or "").strip()
        total_chunk_chars = sum(len(c.get("text", "")) for c in chunk_data)
        if raw_text and (total_chunk_chars < 500 or len(chunk_data) < 3):
            extra_sentences = [
                s.strip() for s in re.split(r"(?<=[.!?])\s+", raw_text)
                if len(s.strip()) >= 25 and not s.strip().startswith("---")
            ]
            existing_full_text = " ".join(c.get("text", "") for c in chunk_data)
            for s in extra_sentences:
                if s not in existing_full_text:
                    chunk_data.append({
                        "index": len(chunk_data) + 1,
                        "text": s,
                        "citation": f"Section #{len(chunk_data) + 1}",
                    })

        # 2. If no SQLite chunks, try ChromaDB vector retrieval
        if not chunk_data:
            try:
                retrieved = rag_service.retrieve_context(
                    db=db,
                    query="key concepts definitions questions answers facts overview",
                    top_k=max(20, count * 2),
                    document_ids=[doc.id],
                )
                for idx, r in enumerate(retrieved, 1):
                    snip = (r.get("snippet") or "").strip()
                    if len(snip) >= 30:
                        chunk_data.append({
                            "index": r.get("citation", {}).get("chunk_index") or idx,
                            "text": snip,
                            "citation": f"Chunk #{idx}",
                        })
            except Exception as e:
                logger.warning(f"ChromaDB retrieval for flashcards notice: {e}")

        # 3. Fallback to cleaned_text / extracted_text
        if not chunk_data:
            raw_text = (doc.cleaned_text or doc.extracted_text or "").strip()
            if not raw_text or len(raw_text) < 50:
                raise ValueError(
                    f"Document '{doc.original_filename}' contains insufficient extracted text ({len(raw_text)} chars). "
                    "Cannot generate flashcards from empty or unextracted document."
                )

            # Create semantic chunks by paragraph or sentence boundaries
            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", raw_text) if len(p.strip()) >= 30]
            if not paragraphs:
                paragraphs = [raw_text[i : i + 600] for i in range(0, len(raw_text), 500)]

            for i, p in enumerate(paragraphs, 1):
                chunk_data.append({
                    "index": i,
                    "text": p,
                    "citation": f"Section #{i}",
                })

        if not chunk_data:
            raise ValueError(
                f"Document '{doc.original_filename}' has no extractable text content. "
                "Please verify OCR and indexing status."
            )

        return chunk_data

    # =========================================================================
    # Generate Deck
    # =========================================================================

    def generate_deck(
        self,
        db: Session,
        document_id: int,
        count: int = 10,
        model: Optional[str] = None,
        workspace_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Generates a deck of N flashcards (10, 20, 50) using ONLY the content of the selected document.
        Utilizes local Ollama LLM and existing SQLite chunks / ChromaDB vector context.
        Validates every card strictly and never uses placeholder or truncated snippet text.
        """
        valid_counts = [10, 20, 50]
        if count not in valid_counts:
            count = 10 if count < 1 else min(count, 50)

        # 1. Fetch document from SQLite
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError(f"Document with ID {document_id} not found.")

        if workspace_id is not None and doc.workspace_id and doc.workspace_id != workspace_id:
            raise ValueError(f"Document '{doc.original_filename}' does not belong to active workspace.")

        # 2. Gather Document Chunks with validation
        chunk_data = self._get_document_chunks_and_validate(db, doc, count)

        # 3. Resolve Active LLM Provider (Hosted Groq/Gemini/OpenAI/Anthropic or Local Ollama)
        provider = None
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")
        try:
            from app.services.providers import get_llm_provider
            candidate_provider = get_llm_provider(db=db, force_model=model)
            if getattr(candidate_provider, "provider_name", None) != "unconfigured":
                provider = candidate_provider
        except Exception as e:
            logger.warning(f"Could not initialize active LLM provider for flashcards: {e}")
            provider = None

        seen_questions: Set[str] = set()
        final_cards_data: List[Dict[str, Any]] = []

        if provider is not None:
            # LLMs perform best when generating batches of 5-10 cards
            batch_size = 10 if count >= 10 else count
            batches_needed = (count + batch_size - 1) // batch_size

            for batch_num in range(batches_needed):
                if len(final_cards_data) >= count:
                    break

                target_batch_count = min(batch_size, count - len(final_cards_data))
                total_chunks = len(chunk_data)
                chunks_per_batch = min(5, max(3, total_chunks // batches_needed + 1))
                start_c = (batch_num * total_chunks) // batches_needed
                end_c = min(total_chunks, start_c + chunks_per_batch)
                context_subset = chunk_data[start_c:end_c] if end_c > start_c else chunk_data[:5]

                batch_cards = self._generate_cards_with_llm(
                    provider=provider,
                    model=target_model,
                    doc_filename=doc.original_filename,
                    context_chunks=context_subset,
                    target_count=target_batch_count,
                    seen_questions=seen_questions,
                )
                final_cards_data.extend(batch_cards)

        # 4. If Ollama is offline or returned fewer valid cards than requested:
        # Use clean rule-based fact extraction (never truncated snippet templates!)
        if len(final_cards_data) < count:
            needed = count - len(final_cards_data)
            logger.info(
                f"Valid cards so far: {len(final_cards_data)}/{count}. "
                f"Extracting up to {needed} factually grounded cards directly from chunks."
            )
            rule_cards = self._generate_substantive_rule_based_cards(
                chunks=chunk_data,
                count=needed,
                doc_filename=doc.original_filename,
                seen_questions=seen_questions,
            )
            final_cards_data.extend(rule_cards)

        # 5. Check if we have at least 1 valid card
        if not final_cards_data:
            if not ollama_status["online"]:
                raise ValueError(
                    f"Local Ollama AI is offline and document '{doc.original_filename}' does not contain "
                    "detectable declarative definition patterns. Please start Ollama to generate AI flashcards."
                )
            raise ValueError(
                f"Could not generate valid, factually grounded flashcards from '{doc.original_filename}'. "
                "Please verify the document contains substantive conceptual text."
            )

        # Slice to requested count
        final_cards_data = final_cards_data[:count]

        # 6. Save Deck and Flashcards to SQLite
        if workspace_id is None and doc.workspace_id:
            workspace_id = doc.workspace_id
        if workspace_id is None:
            from app.services.workspace_service import workspace_service
            workspace_id = workspace_service.get_active_workspace(db)["id"]

        deck_title = f"{doc.original_filename} Study Deck ({len(final_cards_data)} Cards)"
        new_deck = FlashcardDeck(
            workspace_id=workspace_id,
            title=deck_title,
            document_id=doc.id,
            document_name=doc.original_filename,
            total_cards=len(final_cards_data),
            completed_cards=0,
            correct_count=0,
            incorrect_count=0,
        )
        db.add(new_deck)
        db.commit()
        db.refresh(new_deck)

        # Create flashcard records with full citations
        for c in final_cards_data:
            q = str(c.get("question", "")).strip()
            a = str(c.get("answer", "")).strip()
            topic = str(c.get("topic", "Key Concept")).strip() or "Key Concept"
            raw_chunk_idx = c.get("chunk_index")
            try:
                chk_num = max(1, int(raw_chunk_idx)) if raw_chunk_idx is not None else 1
            except (ValueError, TypeError):
                chk_num = 1

            citation_str = c.get("citation")
            if not citation_str or "Chunk #0" in str(citation_str):
                citation_str = f"Chunk #{chk_num}"

            if doc.original_filename not in str(citation_str):
                full_citation = f"{doc.original_filename} • {citation_str}"
            else:
                full_citation = str(citation_str)

            card_obj = Flashcard(
                deck_id=new_deck.id,
                document_id=doc.id,
                question=q,
                answer=a,
                topic=topic,
                source_filename=doc.original_filename,
                chunk_index=chk_num,
                citation=full_citation,
                user_answer_status="unanswered",
            )
            db.add(card_obj)

        db.commit()
        return self.get_deck_by_id(db, new_deck.id)

    # =========================================================================
    # Deck & Card Regeneration (Requirement 4)
    # =========================================================================

    def regenerate_deck(
        self,
        db: Session,
        deck_id: int,
        count: Optional[int] = None,
        model: Optional[str] = None,
        workspace_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Regenerates all cards in an existing deck while preserving deck ID, title, and workspace.
        Replaces poor-quality or bad legacy cards with fresh, high-quality, validated flashcards.
        """
        deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == deck_id).first()
        if not deck:
            raise ValueError(f"Flashcard deck with ID {deck_id} not found.")

        doc = db.query(Document).filter(Document.id == deck.document_id).first()
        if not doc:
            raise ValueError(f"Underlying document (ID: {deck.document_id}) for deck {deck_id} was not found.")

        target_count = count or deck.total_cards or 10
        valid_counts = [10, 20, 50]
        if target_count not in valid_counts:
            target_count = 10 if target_count < 1 else min(target_count, 50)

        # 1. Gather chunks
        chunk_data = self._get_document_chunks_and_validate(db, doc, target_count)

        # 2. Resolve Active LLM Provider
        provider = None
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")
        try:
            from app.services.providers import get_llm_provider
            candidate_provider = get_llm_provider(db=db, force_model=model)
            if getattr(candidate_provider, "provider_name", None) != "unconfigured":
                provider = candidate_provider
        except Exception as e:
            logger.warning(f"Could not initialize active LLM provider for regenerating deck: {e}")
            provider = None

        seen_questions: Set[str] = set()
        new_cards_data: List[Dict[str, Any]] = []

        if provider is not None:
            batch_size = 10 if target_count >= 10 else target_count
            batches_needed = (target_count + batch_size - 1) // batch_size

            for batch_num in range(batches_needed):
                if len(new_cards_data) >= target_count:
                    break
                target_batch_count = min(batch_size, target_count - len(new_cards_data))
                total_chunks = len(chunk_data)
                chunks_per_batch = min(5, max(3, total_chunks // batches_needed + 1))
                start_c = (batch_num * total_chunks) // batches_needed
                end_c = min(total_chunks, start_c + chunks_per_batch)
                context_subset = chunk_data[start_c:end_c] if end_c > start_c else chunk_data[:5]

                batch_cards = self._generate_cards_with_llm(
                    provider=provider,
                    model=target_model,
                    doc_filename=doc.original_filename,
                    context_chunks=context_subset,
                    target_count=target_batch_count,
                    seen_questions=seen_questions,
                )
                new_cards_data.extend(batch_cards)

        # Fallback to substantive rule extraction if needed
        if len(new_cards_data) < target_count:
            needed = target_count - len(new_cards_data)
            rule_cards = self._generate_substantive_rule_based_cards(
                chunks=chunk_data,
                count=needed,
                doc_filename=doc.original_filename,
                seen_questions=seen_questions,
            )
            new_cards_data.extend(rule_cards)

        if not new_cards_data:
            raise ValueError(
                f"Could not regenerate valid flashcards for deck {deck_id} from '{doc.original_filename}'."
            )

        new_cards_data = new_cards_data[:target_count]

        # 3. Delete existing cards for this deck
        db.query(Flashcard).filter(Flashcard.deck_id == deck_id).delete()

        # 4. Insert new cards attached to existing deck_id
        for c in new_cards_data:
            q = str(c.get("question", "")).strip()
            a = str(c.get("answer", "")).strip()
            topic = str(c.get("topic", "Key Concept")).strip() or "Key Concept"
            raw_chunk_idx = c.get("chunk_index")
            try:
                chk_num = max(1, int(raw_chunk_idx)) if raw_chunk_idx is not None else 1
            except (ValueError, TypeError):
                chk_num = 1

            citation_str = c.get("citation")
            if not citation_str or "Chunk #0" in str(citation_str):
                citation_str = f"Chunk #{chk_num}"
            if doc.original_filename not in str(citation_str):
                full_citation = f"{doc.original_filename} • {citation_str}"
            else:
                full_citation = str(citation_str)

            card_obj = Flashcard(
                deck_id=deck.id,
                document_id=doc.id,
                question=q,
                answer=a,
                topic=topic,
                source_filename=doc.original_filename,
                chunk_index=chk_num,
                citation=full_citation,
                user_answer_status="unanswered",
            )
            db.add(card_obj)

        deck.total_cards = len(new_cards_data)
        deck.completed_cards = 0
        deck.correct_count = 0
        deck.incorrect_count = 0
        deck.title = f"{doc.original_filename} Study Deck ({len(new_cards_data)} Cards)"
        deck.updated_at = datetime.utcnow()

        db.commit()
        return self.get_deck_by_id(db, deck_id)

    def regenerate_card(
        self,
        db: Session,
        card_id: int,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Regenerates a single poor-quality flashcard while preserving card identity and deck placement.
        Generates a fresh question and answer strictly grounded in the document context.
        """
        card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
        if not card:
            raise ValueError(f"Flashcard with ID {card_id} not found.")

        doc = db.query(Document).filter(Document.id == card.document_id).first()
        if not doc:
            raise ValueError(f"Document with ID {card.document_id} not found for card {card_id}.")

        # Collect existing questions in deck to prevent duplicates
        other_cards = (
            db.query(Flashcard)
            .filter(Flashcard.deck_id == card.deck_id, Flashcard.id != card_id)
            .all()
        )
        seen_questions = {self._normalize_for_duplicate_check(c.question) for c in other_cards}

        chunk_data = self._get_document_chunks_and_validate(db, doc, 5)

        # Target chunks near this card's chunk_index
        target_idx = card.chunk_index or 1
        relevant_chunks = [c for c in chunk_data if abs(c["index"] - target_idx) <= 2]
        if not relevant_chunks:
            relevant_chunks = chunk_data[:5]

        # Resolve Active LLM Provider
        provider = None
        target_model = model or getattr(settings, "DEFAULT_MODEL", "qwen2.5:3b")
        try:
            from app.services.providers import get_llm_provider
            candidate_provider = get_llm_provider(db=db, force_model=model)
            if getattr(candidate_provider, "provider_name", None) != "unconfigured":
                provider = candidate_provider
        except Exception as e:
            logger.warning(f"Could not initialize active LLM provider for regenerating card: {e}")
            provider = None

        new_cards: List[Dict[str, Any]] = []

        if provider is not None:
            new_cards = self._generate_cards_with_llm(
                provider=provider,
                model=target_model,
                doc_filename=doc.original_filename,
                context_chunks=relevant_chunks,
                target_count=1,
                seen_questions=seen_questions,
            )

        if not new_cards:
            new_cards = self._generate_substantive_rule_based_cards(
                chunks=relevant_chunks,
                count=1,
                doc_filename=doc.original_filename,
                seen_questions=seen_questions,
            )

        if not new_cards:
            raise ValueError(
                f"Could not regenerate a distinct, high-quality question for card {card_id}."
            )

        new_c = new_cards[0]
        card.question = str(new_c.get("question", "")).strip()
        card.answer = str(new_c.get("answer", "")).strip()
        card.topic = str(new_c.get("topic", card.topic or "Key Concept")).strip()
        card.citation = str(new_c.get("citation", card.citation))
        card.user_answer_status = "unanswered"
        card.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(card)

        return {
            "id": card.id,
            "deck_id": card.deck_id,
            "document_id": card.document_id,
            "question": card.question,
            "answer": card.answer,
            "topic": card.topic,
            "source_filename": card.source_filename,
            "chunk_index": card.chunk_index,
            "citation": card.citation,
            "user_answer_status": card.user_answer_status,
            "created_at": card.created_at.isoformat() if card.created_at else None,
            "updated_at": card.updated_at.isoformat() if card.updated_at else None,
        }


flashcards_service = FlashcardsService()
