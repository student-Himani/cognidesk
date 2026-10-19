import re
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.services.providers import get_llm_provider

logger = logging.getLogger("app")


class SuggestionService:
    """
    Module 27: AI Follow-up Suggestions Service.
    Generates 2-4 contextual, concise, non-repetitive follow-up questions
    based on the latest user query, assistant answer, conversation history,
    and RAG document context.
    """

    @staticmethod
    def _clean_question(line: str) -> Optional[str]:
        """Sanitize an LLM generated suggestion line."""
        cleaned = line.strip()
        # Remove markdown bold, italics, bullets, numbers, quotes
        cleaned = re.sub(r"^[\s\*\-\•\d\.\)\(\[\{\}\]\:\"]+", "", cleaned).strip()
        cleaned = cleaned.strip("\"'`;- ")
        if not cleaned:
            return None
        # Must look like a question or plausible prompt
        if len(cleaned) < 5 or len(cleaned) > 160:
            return None
        # Add question mark if not ending with punctuation
        if not cleaned.endswith(("?", ".", "!")):
            cleaned += "?"
        elif cleaned.endswith("."):
            cleaned = cleaned[:-1] + "?"
        return cleaned

    def _get_contextual_defaults(
        self,
        query: str,
        answer: str,
        mode: str = "document",
        citations: Optional[List[Dict[str, Any]]] = None
    ) -> List[str]:
        """Provides smart, contextual fallbacks if LLM output cannot be parsed or provider fails."""
        doc_names = []
        if citations:
            for c in citations:
                name = c.get("docName") or c.get("title")
                if name and name not in doc_names:
                    doc_names.append(name)

        if mode == "document" and doc_names:
            first_doc = doc_names[0]
            return [
                f"What other key insights are covered in {first_doc}?",
                "Can you provide more specific examples from the document?",
                "How does this connect to the main objective of the text?"
            ]
        elif mode == "document":
            return [
                "Can you explain that in more detail based on the documents?",
                "What are the practical applications or examples of this?",
                "Are there any limitations or exceptions mentioned in the context?"
            ]
        else:
            return [
                "Can you provide a concrete example of this?",
                "What are the main advantages and potential drawbacks?",
                "How does this compare to modern alternatives?"
            ]

    def generate_suggestions(
        self,
        db: Session,
        query: str,
        answer: str,
        mode: str = "document",
        messages: Optional[List[Dict[str, Any]]] = None,
        citations: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None
    ) -> List[str]:
        """
        Generates 2 to 4 relevant follow-up question suggestions.
        Guarantees non-empty list of clean questions without breaking on failure.
        """
        try:
            # Build conversation context summary
            history_snippets = []
            if messages:
                for m in messages[-4:]:  # last 4 turns
                    sender = "User" if m.get("sender") == "user" or m.get("role") == "user" else "Assistant"
                    txt = str(m.get("text") or m.get("content") or "").strip()
                    if txt:
                        history_snippets.append(f"{sender}: {txt[:120]}")

            history_str = "\n".join(history_snippets) if history_snippets else "None"

            # Document context hints
            doc_context = ""
            if citations and mode == "document":
                doc_titles = {c.get("docName") for c in citations if c.get("docName")}
                if doc_titles:
                    doc_context = f"Referenced Document Sources: {', '.join(list(doc_titles)[:3])}\n"

            system_prompt = (
                "You are an AI follow-up recommendation engine for CogniDesk.\n"
                "Generate 2 to 4 brief, highly relevant follow-up questions the user is likely to ask next.\n"
                "Rules:\n"
                "1. Each question must be concise (under 15 words) and end with a question mark.\n"
                "2. Directly relate to the conversation topic and the assistant's previous answer.\n"
                "3. If document context is referenced, tailor the questions to explore those documents deeper.\n"
                "4. Do NOT number the questions, do NOT use bullet points, and do NOT add intro/outro text.\n"
                "5. Output exactly one question per line."
            )

            user_prompt = (
                f"{doc_context}"
                f"Recent Context:\n{history_str}\n\n"
                f"Latest User Question: {query[:250]}\n"
                f"Latest Assistant Answer: {answer[:400]}\n\n"
                "Output 3 concise follow-up questions:"
            )

            # Resolve active provider (Ollama or Cloud AI)
            provider = get_llm_provider(db=db, force_model=model)
            if hasattr(provider, "timeout"):
                provider.timeout = 10.0

            response = provider.generate(
                prompt=user_prompt,
                system=system_prompt,
                model=model,
                temperature=0.6,
                max_tokens=150
            )

            raw_text = response.text.strip()
            lines = raw_text.split("\n")

            candidates = []
            for line in lines:
                cleaned = self._clean_question(line)
                if cleaned and cleaned not in candidates:
                    candidates.append(cleaned)

            # Keep between 2 and 4 suggestions
            if len(candidates) >= 2:
                return candidates[:4]

            # Supplement with contextual fallbacks if fewer than 2 parsed
            defaults = self._get_contextual_defaults(query, answer, mode=mode, citations=citations)
            for d in defaults:
                if d not in candidates:
                    candidates.append(d)
                if len(candidates) >= 3:
                    break

            return candidates[:4]

        except Exception as e:
            logger.warning(f"Follow-up suggestion generation error ({e}). Returning contextual defaults.")
            return self._get_contextual_defaults(query, answer, mode=mode, citations=citations)[:3]


suggestion_service = SuggestionService()
