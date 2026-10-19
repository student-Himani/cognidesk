import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth_deps import get_current_user_optional, verify_workspace_access
from app.models.user import User
from app.models.flashcard import Flashcard, FlashcardDeck
from app.services.flashcards_service import flashcards_service
from app.services.workspace_service import workspace_service

logger = logging.getLogger("app")

router = APIRouter()


class GenerateFlashcardsRequest(BaseModel):
    document_id: int = Field(..., description="ID of the indexed document")
    count: int = Field(default=10, description="Number of flashcards to generate (10, 20, or 50)")
    model: Optional[str] = Field(default=None, description="Optional local Ollama model override")
    workspace_id: Optional[int] = Field(default=None, description="Optional target workspace ID")


class RegenerateDeckRequest(BaseModel):
    count: Optional[int] = Field(default=None, description="Number of flashcards to regenerate (optional)")
    model: Optional[str] = Field(default=None, description="Optional local Ollama model override")


class RegenerateCardRequest(BaseModel):
    model: Optional[str] = Field(default=None, description="Optional local Ollama model override")


class UpdateCardProgressRequest(BaseModel):
    status: str = Field(..., description="Card review status: 'correct', 'incorrect', or 'unanswered'")


@router.get("/decks", status_code=status.HTTP_200_OK)
def get_all_flashcard_decks(
    workspace_id: Optional[int] = None,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch all saved flashcard decks scoped to workspace with user isolation."""
    try:
        target_ws_id = workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        decks = flashcards_service.get_all_decks(db, workspace_id=target_ws_id)
        return {
            "success": True,
            "message": f"Retrieved {len(decks)} decks.",
            "data": decks,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching flashcard decks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch flashcard decks: {str(e)}",
        )


@router.get("/decks/{deck_id}", status_code=status.HTTP_200_OK)
def get_flashcard_deck(
    deck_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Fetch a single deck by ID with all cards with user isolation."""
    deck = flashcards_service.get_deck_by_id(db, deck_id)
    if not deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flashcard deck with ID {deck_id} not found.",
        )
    if deck.get("workspace_id"):
        verify_workspace_access(deck["workspace_id"], current_user, db)

    return {
        "success": True,
        "message": "Deck retrieved successfully.",
        "data": deck,
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def generate_flashcards(
    payload: GenerateFlashcardsRequest,
    x_workspace_id: Optional[str] = Header(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Generate study flashcards with user isolation.
    """
    try:
        target_ws_id = payload.workspace_id
        if target_ws_id is None and x_workspace_id:
            try:
                target_ws_id = int(x_workspace_id)
            except (ValueError, TypeError):
                target_ws_id = None
        if target_ws_id is None:
            target_ws_id = workspace_service.get_active_workspace(db, user_id=current_user.id if current_user else None)["id"]

        verify_workspace_access(target_ws_id, current_user, db)

        deck = flashcards_service.generate_deck(
            db=db,
            document_id=payload.document_id,
            count=payload.count,
            model=payload.model,
            workspace_id=target_ws_id,
        )
        return {
            "success": True,
            "message": f"Successfully generated {deck['total_cards']} flashcards.",
            "data": deck,
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating flashcards: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate flashcards: {str(e)}",
        )


@router.post("/cards/{card_id}/progress", status_code=status.HTTP_200_OK)
def update_card_progress(
    card_id: int,
    payload: UpdateCardProgressRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Update study status for a specific card with user isolation.
    """
    card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Card with ID {card_id} not found.",
        )
    deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == card.deck_id).first()
    if deck and deck.workspace_id:
        verify_workspace_access(deck.workspace_id, current_user, db)

    try:
        updated = flashcards_service.update_card_progress(
            db=db, card_id=card_id, status=payload.status
        )
        return {
            "success": True,
            "message": "Card progress updated successfully.",
            "data": updated,
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error updating card progress: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update card progress: {str(e)}",
        )


@router.post("/decks/{deck_id}/reset", status_code=status.HTTP_200_OK)
def reset_deck_progress(
    deck_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Reset study progress for all cards in a deck with user isolation."""
    existing_deck = flashcards_service.get_deck_by_id(db, deck_id)
    if not existing_deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flashcard deck with ID {deck_id} not found.",
        )
    if existing_deck.get("workspace_id"):
        verify_workspace_access(existing_deck["workspace_id"], current_user, db)

    deck = flashcards_service.reset_deck_progress(db, deck_id)
    return {
        "success": True,
        "message": "Deck study progress has been reset.",
        "data": deck,
    }


@router.post("/decks/{deck_id}/regenerate", status_code=status.HTTP_200_OK)
def regenerate_flashcard_deck(
    deck_id: int,
    payload: Optional[RegenerateDeckRequest] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Regenerate all cards in an existing deck while preserving deck identity and workspace."""
    existing_deck = flashcards_service.get_deck_by_id(db, deck_id)
    if not existing_deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flashcard deck with ID {deck_id} not found.",
        )
    if existing_deck.get("workspace_id"):
        verify_workspace_access(existing_deck["workspace_id"], current_user, db)

    try:
        count = payload.count if payload else None
        model = payload.model if payload else None
        deck = flashcards_service.regenerate_deck(
            db=db,
            deck_id=deck_id,
            count=count,
            model=model,
            workspace_id=existing_deck.get("workspace_id"),
        )
        return {
            "success": True,
            "message": f"Successfully regenerated deck with {deck['total_cards']} cards.",
            "data": deck,
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error regenerating deck {deck_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate deck: {str(e)}",
        )


@router.post("/cards/{card_id}/regenerate", status_code=status.HTTP_200_OK)
def regenerate_flashcard(
    card_id: int,
    payload: Optional[RegenerateCardRequest] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Regenerate a single poor-quality flashcard while preserving card identity."""
    card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Card with ID {card_id} not found.",
        )
    deck = db.query(FlashcardDeck).filter(FlashcardDeck.id == card.deck_id).first()
    if deck and deck.workspace_id:
        verify_workspace_access(deck.workspace_id, current_user, db)

    try:
        model = payload.model if payload else None
        updated_card = flashcards_service.regenerate_card(
            db=db,
            card_id=card_id,
            model=model,
        )
        return {
            "success": True,
            "message": "Flashcard regenerated successfully.",
            "data": updated_card,
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error regenerating card {card_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate card: {str(e)}",
        )


@router.delete("/decks/{deck_id}", status_code=status.HTTP_200_OK)
def delete_flashcard_deck(
    deck_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Delete a flashcard deck and its cards with user isolation."""
    existing_deck = flashcards_service.get_deck_by_id(db, deck_id)
    if not existing_deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flashcard deck with ID {deck_id} not found.",
        )
    if existing_deck.get("workspace_id"):
        verify_workspace_access(existing_deck["workspace_id"], current_user, db)

    success = flashcards_service.delete_deck(db, deck_id)
    return {
        "success": True,
        "message": f"Flashcard deck {deck_id} deleted successfully.",
    }
