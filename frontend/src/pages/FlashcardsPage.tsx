import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCw,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2,
  XCircle,
  RotateCcw,
  BookOpen,
  FileText,
  Trash2,
  HelpCircle,
  Check,
  X,
  Plus,
  BarChart2,
  Shuffle,
  ChevronRight,
  Info,
} from 'lucide-react';
import KnowledgeLoadingOrb from '../components/3d/KnowledgeLoadingOrb';
import {
  getFlashcardDecks,
  getFlashcardDeck,
  generateFlashcards,
  updateCardProgress,
  resetDeckProgress,
  deleteDeck,
  regenerateDeck,
  regenerateCard,
  FlashcardDeckItem,
  FlashcardItem,
} from '../services/flashcardsService';
import { fetchDocuments, DocumentItem } from '../services/documentService';
import { useWorkspace } from '../context/WorkspaceContext';

export const FlashcardsPage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();

  // State
  const [decks, setDecks] = useState<FlashcardDeckItem[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeckItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);

  // Regeneration state
  const [isRegeneratingDeck, setIsRegeneratingDeck] = useState(false);
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);
  const [regenerationMessage, setRegenerationMessage] = useState<string | null>(null);

  // Document selection & generation state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [cardCount, setCardCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Modals / Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDecksDrawerOpen, setIsDecksDrawerOpen] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [displayedCards, setDisplayedCards] = useState<FlashcardItem[]>([]);

  // 1. Load initial data
  const loadData = async () => {
    setIsLoadingDecks(true);
    try {
      const [fetchedDecks, fetchedDocs] = await Promise.all([
        getFlashcardDecks(),
        fetchDocuments(),
      ]);
      setDecks(fetchedDecks);
      setDocuments(fetchedDocs);

      if (fetchedDecks.length > 0) {
        // Load the first deck's full card array
        const fullDeck = await getFlashcardDeck(fetchedDecks[0].id);
        if (fullDeck) {
          setSelectedDeck(fullDeck);
          setDisplayedCards(fullDeck.cards || []);
        }
      } else {
        setSelectedDeck(null);
        setDisplayedCards([]);
      }
    } catch (err) {
      console.error('Failed to load flashcard decks or documents:', err);
    } finally {
      setIsLoadingDecks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeWorkspace?.id]);

  // Update displayed cards when selected deck changes
  useEffect(() => {
    if (selectedDeck?.cards) {
      setDisplayedCards(selectedDeck.cards);
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [selectedDeck]);

  // Current Card
  const currentCard = displayedCards[currentIndex] || null;

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (displayedCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % displayedCards.length);
  }, [displayedCards.length]);

  const handlePrev = useCallback(() => {
    if (displayedCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + displayedCards.length) % displayedCards.length);
  }, [displayedCards.length]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Card Status Update (Mastered / Review)
  const handleRateCard = async (status: 'correct' | 'incorrect') => {
    if (!currentCard || !selectedDeck) return;

    try {
      const res = await updateCardProgress(currentCard.id, status);

      // Update local card status
      const updatedCards = displayedCards.map((c) =>
        c.id === currentCard.id ? { ...c, user_answer_status: status } : c
      );
      setDisplayedCards(updatedCards);

      // Update selected deck stats
      setSelectedDeck((prev) =>
        prev
          ? {
              ...prev,
              ...res.deck_stats,
              cards: prev.cards?.map((c) =>
                c.id === currentCard.id ? { ...c, user_answer_status: status } : c
              ),
            }
          : null
      );

      // Update in decks list
      setDecks((prev) =>
        prev.map((d) =>
          d.id === selectedDeck.id
            ? {
                ...d,
                ...res.deck_stats,
              }
            : d
        )
      );

      // Auto-advance to next card if not the last card
      setTimeout(() => {
        if (currentIndex < displayedCards.length - 1) {
          handleNext();
        }
      }, 250);
    } catch (err) {
      console.error('Failed to update card status:', err);
    }
  };

  // Keyboard Navigation Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if modal is open or user is typing in an input
      if (isCreateModalOpen || isDecksDrawerOpen) return;
      if (['input', 'textarea', 'select'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === '1') {
        handleRateCard('incorrect');
      } else if (e.key === '2') {
        handleRateCard('correct');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handleNext, handlePrev, isCreateModalOpen, isDecksDrawerOpen, currentCard, selectedDeck]);

  // Shuffle Cards
  const handleToggleShuffle = () => {
    if (!selectedDeck?.cards) return;
    if (isShuffled) {
      setDisplayedCards(selectedDeck.cards);
      setIsShuffled(false);
    } else {
      const shuffled = [...selectedDeck.cards].sort(() => Math.random() - 0.5);
      setDisplayedCards(shuffled);
      setIsShuffled(true);
    }
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  // Reset Deck Progress
  const handleResetDeck = async () => {
    if (!selectedDeck) return;
    if (!window.confirm('Reset study progress for this deck? All scores will be cleared.')) return;

    try {
      const reset = await resetDeckProgress(selectedDeck.id);
      setSelectedDeck(reset);
      setDisplayedCards(reset.cards || []);
      setCurrentIndex(0);
      setIsFlipped(false);

      // Update in decks list
      setDecks((prev) =>
        prev.map((d) => (d.id === selectedDeck.id ? { ...d, completed_cards: 0, correct_count: 0, incorrect_count: 0, accuracy: 0 } : d))
      );
    } catch (err) {
      console.error('Failed to reset deck:', err);
    }
  };

  // Regenerate Entire Deck with local AI
  const handleRegenerateDeck = async () => {
    if (!selectedDeck) return;
    if (!window.confirm(`Regenerate all flashcards in "${selectedDeck.title}" using local AI? Previous card review scores will be refreshed.`)) return;

    setIsRegeneratingDeck(true);
    setRegenerationMessage('Crafting fresh, factually grounded flashcards from document context...');
    try {
      const updatedDeck = await regenerateDeck(selectedDeck.id, selectedDeck.total_cards);
      setSelectedDeck(updatedDeck);
      setDisplayedCards(updatedDeck.cards || []);
      setCurrentIndex(0);
      setIsFlipped(false);
      setDecks((prev) => prev.map((d) => (d.id === updatedDeck.id ? updatedDeck : d)));
      setRegenerationMessage(null);
    } catch (err: any) {
      console.error('Failed to regenerate deck:', err);
      const msg = err.response?.data?.detail || err.message || 'Failed to regenerate deck.';
      alert(msg);
      setRegenerationMessage(null);
    } finally {
      setIsRegeneratingDeck(false);
    }
  };

  // Regenerate Single Card with local AI
  const handleRegenerateCard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentCard || !selectedDeck) return;

    setIsRegeneratingCard(true);
    try {
      const updatedCard = await regenerateCard(currentCard.id);
      const updatedList = displayedCards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
      setDisplayedCards(updatedList);
      setSelectedDeck((prev) => (prev ? { ...prev, cards: updatedList } : null));
    } catch (err: any) {
      console.error('Failed to regenerate card:', err);
      const msg = err.response?.data?.detail || err.message || 'Failed to regenerate card.';
      alert(msg);
    } finally {
      setIsRegeneratingCard(false);
    }
  };

  // Delete Deck
  const handleDeleteDeck = async (deckId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this study deck?')) return;

    try {
      await deleteDeck(deckId);
      const remaining = decks.filter((d) => d.id !== deckId);
      setDecks(remaining);

      if (selectedDeck?.id === deckId) {
        if (remaining.length > 0) {
          const nextDeck = await getFlashcardDeck(remaining[0].id);
          setSelectedDeck(nextDeck);
        } else {
          setSelectedDeck(null);
          setDisplayedCards([]);
          setIsCreateModalOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to delete deck:', err);
    }
  };

  // Select another deck
  const handleSelectDeck = async (deckId: number) => {
    setIsDecksDrawerOpen(false);
    try {
      const fullDeck = await getFlashcardDeck(deckId);
      if (fullDeck) {
        setSelectedDeck(fullDeck);
        setDisplayedCards(fullDeck.cards || []);
        setCurrentIndex(0);
        setIsFlipped(false);
        setIsShuffled(false);
      }
    } catch (err) {
      console.error('Failed to load deck:', err);
    }
  };

  // Generate Deck
  const handleGenerateDeck = async () => {
    if (!selectedDocId) {
      setGenerationError('Please select an indexed document from your library.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStep('Extracting document chunks & vector citations...');

    const stepInterval = setInterval(() => {
      setGenerationStep((prev) => {
        if (prev.includes('Extracting')) return 'Running local Ollama AI to craft flashcards...';
        if (prev.includes('Ollama AI')) return 'Mapping chunk citations and verifying questions...';
        if (prev.includes('Mapping chunk')) return 'Saving study deck to local SQLite database...';
        return prev;
      });
    }, 4000);

    try {
      const newDeck = await generateFlashcards(selectedDocId, cardCount);
      clearInterval(stepInterval);
      setDecks((prev) => [newDeck, ...prev]);
      setSelectedDeck(newDeck);
      setDisplayedCards(newDeck.cards || []);
      setCurrentIndex(0);
      setIsFlipped(false);
      setIsCreateModalOpen(false);
      setSelectedDocId(null);
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error('Failed to generate flashcards:', err);
      const msg = err.response?.data?.detail || err.message || 'Failed to generate flashcards.';
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter valid documents (only show documents with chunks or text)
  const availableDocs = documents.filter(
    (d) => d.status.toLowerCase() !== 'failed'
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-800/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">AI Flashcards Studio</h1>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-blue-800/40">
              100% Offline
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Generate and study interactive spaced-repetition flashcards verified with document chunk citations.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsDecksDrawerOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white border border-slate-200 dark:border-slate-700/70 text-xs font-medium transition-all cursor-pointer shadow-xs"
          >
            <Layers className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <span>Saved Decks</span>
            {decks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-600/30 text-blue-700 dark:text-cyan-300 text-[10px]">
                {decks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setGenerationError(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Study Deck</span>
          </button>
        </div>
      </div>

      {/* 2. Main Study Area or Empty State */}
      {isLoadingDecks ? (
        <div className="h-96 flex flex-col items-center justify-center space-y-3 bg-white/85 dark:bg-slate-900/40 rounded-3xl border border-slate-200/80 dark:border-slate-800/60 shadow-xs">
          <KnowledgeLoadingOrb size={70} text="Loading flashcard study decks..." />
        </div>
      ) : !selectedDeck || displayedCards.length === 0 ? (
        <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white/85 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl space-y-4 shadow-xs">
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-cyan-400">
            <BookOpen className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">No Flashcard Decks Yet</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mt-1">
              Select any indexed document (PDF, DOCX, TXT) from your knowledge library to automatically generate your first study deck with local Ollama AI.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate First Flashcard Deck</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
            {/* Deck Stats & Progress Bar */}
          <div className="bg-white/85 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-[0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-md space-y-3">
            {regenerationMessage && (
              <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-cyan-300 text-xs font-medium animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin text-blue-600 dark:text-cyan-400 shrink-0" />
                <span>{regenerationMessage}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-cyan-400">
                  Active Study Deck
                </span>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <span>{selectedDeck.title}</span>
                </h2>
              </div>

              {/* Live Knowledge Score Badges */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{selectedDeck.correct_count} Mastered</span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{selectedDeck.incorrect_count} Review</span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                  <span>{selectedDeck.accuracy}% Mastery</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Card <strong className="text-blue-600 dark:text-cyan-400">{currentIndex + 1}</strong> of{' '}
                  <strong className="text-slate-900 dark:text-slate-200">{displayedCards.length}</strong>
                </span>
                <span>
                  {Math.round(((selectedDeck.completed_cards || 0) / displayedCards.length) * 100)}% Reviewed
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        3,
                        Math.round(((selectedDeck.completed_cards || 0) / displayedCards.length) * 100)
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3. Interactive 3D Flip Card Container */}
          {currentCard && (
            <div className="perspective-1000 w-full min-h-[380px] select-none">
              <div
                onClick={handleFlip}
                className={`transform-style-3d relative w-full min-h-[380px] rounded-3xl cursor-pointer transition-transform duration-500 shadow-2xl ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
              >
                {/* FRONT FACE (QUESTION) */}
                <div className="backface-hidden absolute inset-0 w-full h-full bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-950 border-2 border-slate-200 dark:border-blue-900/50 hover:border-blue-400 dark:hover:border-cyan-500/60 rounded-3xl p-4 sm:p-8 flex flex-col justify-between transition-all duration-200 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl">
                  {/* Front Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-cyan-300 text-xs font-semibold uppercase tracking-wider">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Question</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700">
                        {currentCard.topic || 'General'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleRegenerateCard}
                        disabled={isRegeneratingCard}
                        className="flex items-center space-x-1 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-cyan-300 text-xs bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                        title="Regenerate this card with AI"
                      >
                        <RotateCw className={`w-3 h-3 ${isRegeneratingCard ? 'animate-spin text-blue-600' : ''}`} />
                        <span className="hidden sm:inline">Regen Card</span>
                      </button>

                      {currentCard.user_answer_status === 'correct' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-xs font-medium">
                          <Check className="w-3 h-3" />
                          <span>Mastered</span>
                        </span>
                      )}
                      {currentCard.user_answer_status === 'incorrect' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 text-xs font-medium">
                          <X className="w-3 h-3" />
                          <span>Needs Review</span>
                        </span>
                      )}
                      <div className="flex items-center space-x-1 text-blue-700 dark:text-cyan-400 text-xs bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800/40">
                        <RotateCw className="w-3 h-3" />
                        <span className="hidden sm:inline">Click to Reveal Answer</span>
                      </div>
                    </div>
                  </div>

                  {/* Question Body - Full text display without clipping */}
                  <div className="my-auto py-4 max-w-2xl mx-auto text-center space-y-3 max-h-[230px] overflow-y-auto px-2">
                    <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                      {currentCard.question}
                    </p>
                  </div>

                  {/* Front Footer */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                      <span className="truncate max-w-[160px] sm:max-w-xs text-slate-700 dark:text-slate-300 font-medium">
                        {currentCard.source_filename}
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      Card {currentIndex + 1}/{displayedCards.length}
                    </span>
                  </div>
                </div>

                {/* BACK FACE (ANSWER + CITATION) */}
                <div className="backface-hidden rotate-y-180 absolute inset-0 w-full h-full bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-950 border-2 border-blue-200 dark:border-blue-500/40 hover:border-blue-400 dark:hover:border-cyan-500/70 rounded-3xl p-4 sm:p-8 flex flex-col justify-between transition-all duration-200 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl">
                  {/* Back Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-xs font-semibold uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Answer</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700">
                        {currentCard.topic || 'General'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleRegenerateCard}
                        disabled={isRegeneratingCard}
                        className="flex items-center space-x-1 text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300 text-xs bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                        title="Regenerate this card with AI"
                      >
                        <RotateCw className={`w-3 h-3 ${isRegeneratingCard ? 'animate-spin text-cyan-600' : ''}`} />
                        <span className="hidden sm:inline">Regen Card</span>
                      </button>

                      <div className="flex items-center space-x-1 text-slate-600 dark:text-slate-400 text-xs bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                        <RotateCw className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                        <span className="hidden sm:inline">Click to flip back</span>
                      </div>
                    </div>
                  </div>

                  {/* Answer Body - Full text display without clipping */}
                  <div className="my-auto py-3 max-w-2xl mx-auto text-center space-y-3 max-h-[230px] overflow-y-auto px-2">
                    <p className="text-base sm:text-xl font-semibold text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                      {currentCard.answer}
                    </p>

                    {/* Source Citation Callout */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-slate-300/80 dark:border-blue-900/40 text-xs text-blue-800 dark:text-cyan-300 shadow-xs max-w-full"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                      <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0">Citation:</span>
                      <span className="font-semibold text-blue-700 dark:text-cyan-300 truncate">{currentCard.citation}</span>
                    </div>
                  </div>

                  {/* Back Footer with Knowledge Scoring Actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80"
                  >
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Rate your recall for this flashcard:
                    </span>

                    <div className="flex items-center space-x-2.5">
                      <button
                        onClick={() => handleRateCard('incorrect')}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                          currentCard.user_answer_status === 'incorrect'
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10'
                            : 'bg-slate-50 hover:bg-amber-50 dark:bg-slate-800/80 dark:hover:bg-amber-500/10 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        <X className="w-3.5 h-3.5 text-amber-500" />
                        <span>Needs Review</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">(1)</span>
                      </button>

                      <button
                        onClick={() => handleRateCard('correct')}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                          currentCard.user_answer_status === 'correct'
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                            : 'bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/80 dark:hover:bg-emerald-500/10 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Mastered</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">(2)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleShuffle}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  isShuffled
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200 shadow-xs'
                }`}
                title="Shuffle card order"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{isShuffled ? 'Shuffled' : 'Shuffle'}</span>
              </button>

              <button
                onClick={handleResetDeck}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:border-rose-400 text-xs font-medium transition-all cursor-pointer shadow-xs"
                title="Reset study progress"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Score</span>
              </button>

              <button
                onClick={handleRegenerateDeck}
                disabled={isRegeneratingDeck}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800/80 text-blue-600 dark:text-cyan-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Regenerate all cards in deck with local AI"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isRegeneratingDeck ? 'animate-spin text-blue-600' : 'text-blue-500 dark:text-cyan-400'}`} />
                <span>{isRegeneratingDeck ? 'Regenerating Deck...' : 'Regenerate Deck'}</span>
              </button>
            </div>

            {/* Previous / Flip / Next Center Actions */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePrev}
                className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-cyan-300 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Previous Card (← Arrow)"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <button
                onClick={handleFlip}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
              >
                {isFlipped ? 'Show Question' : 'Reveal Answer'}
              </button>

              <button
                onClick={handleNext}
                className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-cyan-300 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Next Card (→ Arrow)"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="hidden lg:flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                Space
              </span>
              <span>Flip</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                ← / →
              </span>
              <span>Navigate</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create New Flashcard Deck Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-pop-in">
            {/* Close Button */}
            <button
              onClick={() => {
                if (!isGenerating) setIsCreateModalOpen(false);
              }}
              disabled={isGenerating}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-800/40">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Create Flashcard Deck</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Generate study cards using local Ollama LLM and your indexed document chunks.
              </p>
            </div>

            {/* Generation In-Progress Screen with 3D WebGL Orb */}
            {isGenerating ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                <KnowledgeLoadingOrb size={80} text={generationStep || 'Local AI Generating Flashcards...'} />
                <div className="p-3 bg-blue-50/60 dark:bg-slate-950/60 border border-blue-200 dark:border-blue-800/80 rounded-2xl text-[11px] text-slate-600 dark:text-slate-400 max-w-xs text-center">
                  100% offline inference on local Ollama engine. No internet or external APIs required.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Error Banner */}
                {generationError && (
                  <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                    <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{generationError}</span>
                  </div>
                )}

                {/* Document Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Select Document (PDF, DOCX, TXT)
                  </label>
                  {availableDocs.length === 0 ? (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      No indexed documents found. Please upload a document first.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-950/60 p-2 border border-slate-300/80 dark:border-slate-800 scrollbar-thin">
                      {availableDocs.map((doc) => {
                        const isSelected = selectedDocId === Number(doc.id);
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDocId(Number(doc.id))}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                                : 'bg-white hover:bg-blue-50/70 dark:bg-slate-900/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 overflow-hidden">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  doc.type === 'PDF'
                                    ? 'bg-red-500/20 text-red-500 dark:text-red-400'
                                    : doc.type === 'DOCX'
                                    ? 'bg-blue-500/20 text-blue-500 dark:text-blue-400'
                                    : 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-400'
                                }`}
                              >
                                {doc.type}
                              </span>
                              <span className="font-medium truncate">{doc.name}</span>
                            </div>

                            <div className="flex items-center space-x-2 text-[11px] text-slate-400 shrink-0">
                              <span>{doc.chunks || 1} chunks</span>
                              {isSelected && <Check className="w-4 h-4 text-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card Count Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Flashcard Count
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10, 20, 50].map((count) => {
                      const isSelected = cardCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setCardCount(count)}
                          className={`py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-transparent shadow-md shadow-blue-600/30'
                              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-blue-700 hover:border-blue-300'
                          }`}
                        >
                          {count} Cards
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Model Info Banner */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 text-xs text-blue-800 dark:text-cyan-300">
                  <span className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                    <span>Inference Engine:</span>
                  </span>
                  <span className="font-semibold text-blue-900 dark:text-cyan-200">Local Ollama (qwen2.5:3b)</span>
                </div>

                {/* Modal Footer Buttons */}
                <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateDeck}
                    disabled={!selectedDocId}
                    className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate {cardCount} Cards</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Saved Decks Drawer */}
      {isDecksDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-slide-in">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Layers className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Saved Study Decks</h3>
                </div>
                <button
                  onClick={() => setIsDecksDrawerOpen(false)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {decks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  No study decks generated yet.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[calc(100vh-180px)] overflow-y-auto pr-1 scrollbar-thin">
                  {decks.map((deck) => {
                    const isActive = selectedDeck?.id === deck.id;
                    return (
                      <div
                        key={deck.id}
                        onClick={() => handleSelectDeck(deck.id)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all space-y-2 ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-cyan-500/50 shadow-md'
                            : 'bg-slate-50/70 hover:bg-blue-50/50 dark:bg-slate-950/60 dark:hover:bg-slate-800/60 border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                              {deck.title}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {deck.document_name}
                            </p>
                          </div>

                          <button
                            onClick={(e) => handleDeleteDeck(deck.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            title="Delete Deck"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800/60">
                          <span className="text-slate-500 dark:text-slate-400">
                            {deck.total_cards} Cards • {deck.accuracy}% Mastery
                          </span>
                          <span className="flex items-center text-blue-600 dark:text-cyan-400 font-semibold">
                            Study <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setIsDecksDrawerOpen(false);
                setIsCreateModalOpen(true);
              }}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Deck</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlashcardsPage;
