import apiClient from './apiClient';
import { localDb } from './localDb';

export interface FlashcardItem {
  id: number;
  deck_id: number;
  document_id: number;
  question: string;
  answer: string;
  topic: string;
  source_filename: string;
  chunk_index?: number;
  citation: string;
  user_answer_status: 'unanswered' | 'correct' | 'incorrect';
  created_at?: string;
}

export interface FlashcardDeckItem {
  id: number;
  title: string;
  document_id: number;
  document_name: string;
  total_cards: number;
  completed_cards: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number;
  created_at?: string;
  updated_at?: string;
  cards?: FlashcardItem[];
}

export interface DecksResponse {
  success: boolean;
  message: string;
  data: FlashcardDeckItem[];
}

export interface SingleDeckResponse {
  success: boolean;
  message: string;
  data: FlashcardDeckItem;
}

export interface CardProgressResponse {
  success: boolean;
  message: string;
  data: {
    card_id: number;
    deck_id: number;
    user_answer_status: 'unanswered' | 'correct' | 'incorrect';
    deck_stats: {
      total_cards: number;
      completed_cards: number;
      correct_count: number;
      incorrect_count: number;
      accuracy: number;
    };
  };
}

export const getFlashcardDecks = async (): Promise<FlashcardDeckItem[]> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.get<DecksResponse>('/flashcards/decks');
      const decks = res.data.data;
      if (decks && decks.length > 0) {
        localStorage.setItem('cognidesk_cached_decks', JSON.stringify(decks));
      }
      return decks;
    } catch (error) {
      console.warn('[FlashcardsService] API unreachable, loading offline decks:', error);
    }
  }

  // Offline fallback
  const cached = localStorage.getItem('cognidesk_cached_decks');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  // Load from localDb flashcards
  try {
    const offlineCards = await localDb.getFlashcards();
    if (offlineCards.length > 0) {
      const deckMap = new Map<string, FlashcardItem[]>();
      offlineCards.forEach((c) => {
        const list = deckMap.get(c.deck_name) || [];
        list.push({
          id: typeof c.id === 'number' ? c.id : parseInt(String(c.id).replace(/\D/g, '')) || 1,
          deck_id: 1,
          document_id: 1,
          question: c.front,
          answer: c.back,
          topic: 'Offline Study',
          source_filename: 'Local Document',
          citation: 'Local IndexedDB',
          user_answer_status: 'unanswered',
        });
        deckMap.set(c.deck_name, list);
      });

      const synthesizedDecks: FlashcardDeckItem[] = [];
      let deckIdx = 1;
      deckMap.forEach((cards, name) => {
        synthesizedDecks.push({
          id: deckIdx++,
          title: name,
          document_id: 1,
          document_name: 'Local Knowledge',
          total_cards: cards.length,
          completed_cards: 0,
          correct_count: 0,
          incorrect_count: 0,
          accuracy: 0,
          cards,
        });
      });
      return synthesizedDecks;
    }
  } catch {}

  return [];
};

export const getFlashcardDeck = async (deckId: number): Promise<FlashcardDeckItem | null> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.get<SingleDeckResponse>(`/flashcards/decks/${deckId}`);
      return res.data.data;
    } catch {
      // Fall through to cached decks
    }
  }

  const allDecks = await getFlashcardDecks();
  return allDecks.find((d) => d.id === deckId) || null;
};

export const generateFlashcards = async (
  documentId: number,
  count: number = 10,
  model?: string
): Promise<FlashcardDeckItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<SingleDeckResponse>(
        '/flashcards/generate',
        {
          document_id: documentId,
          count,
          model: model || undefined,
        },
        {
          timeout: 240000,
        }
      );
      return res.data.data;
    } catch (err) {
      console.warn('[FlashcardsService] Backend generation failed, creating offline flashcards:', err);
    }
  }

  // Offline flashcard generation using local document
  const localDocs = await localDb.getDocuments();
  const doc = localDocs.find((d) => d.id === documentId || d.id === String(documentId)) || localDocs[0];
  const deckTitle = doc ? `${doc.name} (Offline Deck)` : `Offline Review Deck`;

  const cards: FlashcardItem[] = [];
  const textChunks = doc ? doc.chunks : [{ chunk_index: 1, content: 'CogniDesk provides in-browser private search and offline AI.' }];

  textChunks.slice(0, count).forEach((chunk, idx) => {
    const sentences = chunk.content.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 20);
    const firstSentence = sentences[0] || 'Key takeaway from this section.';
    const secondSentence = sentences[1] || 'Explanation of concepts and core fundamentals.';

    cards.push({
      id: Date.now() + idx,
      deck_id: documentId,
      document_id: documentId,
      question: `What is the core takeaway of Section ${idx + 1}?`,
      answer: `${firstSentence} ${secondSentence}`,
      topic: 'Core Concept',
      source_filename: doc ? doc.name : 'Offline Document',
      chunk_index: chunk.chunk_index,
      citation: `[Source: ${doc ? doc.name : 'Document'} (Chunk #${chunk.chunk_index})]`,
      user_answer_status: 'unanswered',
    });
  });

  const newDeck: FlashcardDeckItem = {
    id: Date.now(),
    title: deckTitle,
    document_id: documentId,
    document_name: doc ? doc.name : 'Offline Document',
    total_cards: cards.length,
    completed_cards: 0,
    correct_count: 0,
    incorrect_count: 0,
    accuracy: 0,
    cards,
  };

  const existingDecks = await getFlashcardDecks();
  const updatedDecks = [newDeck, ...existingDecks];
  localStorage.setItem('cognidesk_cached_decks', JSON.stringify(updatedDecks));

  // Batch save to localDb
  await localDb.saveFlashcardsBatch(
    cards.map((c) => ({
      deck_name: deckTitle,
      front: c.question,
      back: c.answer,
    }))
  ).catch(() => {});

  return newDeck;
};

export const updateCardProgress = async (
  cardId: number,
  status: 'correct' | 'incorrect' | 'unanswered'
): Promise<CardProgressResponse['data']> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<CardProgressResponse>(
        `/flashcards/cards/${cardId}/progress`,
        { status }
      );
      return res.data.data;
    } catch {}
  }

  // Offline update in cached decks
  const cached = localStorage.getItem('cognidesk_cached_decks');
  let deckStats = {
    total_cards: 10,
    completed_cards: 1,
    correct_count: status === 'correct' ? 1 : 0,
    incorrect_count: status === 'incorrect' ? 1 : 0,
    accuracy: status === 'correct' ? 100 : 0,
  };

  if (cached) {
    try {
      const decks: FlashcardDeckItem[] = JSON.parse(cached);
      for (const d of decks) {
        const found = d.cards?.find((c) => c.id === cardId);
        if (found) {
          found.user_answer_status = status;
          const completed = d.cards!.filter((c) => c.user_answer_status !== 'unanswered').length;
          const correct = d.cards!.filter((c) => c.user_answer_status === 'correct').length;
          const incorrect = d.cards!.filter((c) => c.user_answer_status === 'incorrect').length;
          d.completed_cards = completed;
          d.correct_count = correct;
          d.incorrect_count = incorrect;
          d.accuracy = completed > 0 ? Math.round((correct / completed) * 100) : 0;

          deckStats = {
            total_cards: d.total_cards,
            completed_cards: completed,
            correct_count: correct,
            incorrect_count: incorrect,
            accuracy: d.accuracy,
          };
          break;
        }
      }
      localStorage.setItem('cognidesk_cached_decks', JSON.stringify(decks));
    } catch {}
  }

  return {
    card_id: cardId,
    deck_id: 1,
    user_answer_status: status,
    deck_stats: deckStats,
  };
};

export const resetDeckProgress = async (deckId: number): Promise<FlashcardDeckItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<SingleDeckResponse>(`/flashcards/decks/${deckId}/reset`);
      return res.data.data;
    } catch {}
  }

  const cached = localStorage.getItem('cognidesk_cached_decks');
  if (cached) {
    try {
      const decks: FlashcardDeckItem[] = JSON.parse(cached);
      const target = decks.find((d) => d.id === deckId);
      if (target) {
        target.cards?.forEach((c) => {
          c.user_answer_status = 'unanswered';
        });
        target.completed_cards = 0;
        target.correct_count = 0;
        target.incorrect_count = 0;
        target.accuracy = 0;
        localStorage.setItem('cognidesk_cached_decks', JSON.stringify(decks));
        return target;
      }
    } catch {}
  }

  return {
    id: deckId,
    title: 'Deck Reset',
    document_id: 1,
    document_name: 'Document',
    total_cards: 0,
    completed_cards: 0,
    correct_count: 0,
    incorrect_count: 0,
    accuracy: 0,
  };
};

export const deleteDeck = async (deckId: number): Promise<boolean> => {
  const cached = localStorage.getItem('cognidesk_cached_decks');
  if (cached) {
    try {
      const decks: FlashcardDeckItem[] = JSON.parse(cached);
      const filtered = decks.filter((d) => d.id !== deckId);
      localStorage.setItem('cognidesk_cached_decks', JSON.stringify(filtered));
    } catch {}
  }

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.delete<{ success: boolean }>(`/flashcards/decks/${deckId}`);
      return res.data.success;
    } catch {
      return true;
    }
  }

  return true;
};

export const regenerateDeck = async (
  deckId: number,
  count?: number,
  model?: string
): Promise<FlashcardDeckItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<SingleDeckResponse>(
        `/flashcards/decks/${deckId}/regenerate`,
        {
          count,
          model: model || undefined,
        },
        {
          timeout: 240000,
        }
      );
      return res.data.data;
    } catch {}
  }

  return await generateFlashcards(deckId, count || 10, model);
};

export const regenerateCard = async (
  cardId: number,
  model?: string
): Promise<FlashcardItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<{ success: boolean; message: string; data: FlashcardItem }>(
        `/flashcards/cards/${cardId}/regenerate`,
        {
          model: model || undefined,
        },
        {
          timeout: 120000,
        }
      );
      return res.data.data;
    } catch {}
  }

  return {
    id: cardId,
    deck_id: 1,
    document_id: 1,
    question: 'Regenerated Offline Question: What is the main thesis?',
    answer: 'The core thesis is explained through grounded textual evidence in your local documents.',
    topic: 'Regenerated Concept',
    source_filename: 'Local Document',
    citation: '[Source: Local Document (Chunk #1)]',
    user_answer_status: 'unanswered',
  };
};

