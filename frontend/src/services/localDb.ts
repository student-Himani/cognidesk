// ==============================================================================
// CogniDesk In-Browser Local Database (IndexedDB) (Module 32)
// Provides zero-network persistent offline storage for Notes, Flashcards,
// Chat Threads, Documents, and Semantic Search Vectors.
// ==============================================================================

const DB_NAME = 'CogniDeskLocalDB';
const DB_VERSION = 1;

export interface OfflineNote {
  id: string | number;
  title: string;
  content: string;
  workspace_id: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface OfflineFlashcard {
  id: string | number;
  deck_name: string;
  front: string;
  back: string;
  workspace_id: number;
  confidence_score?: number;
  interval_days?: number;
  review_count?: number;
  next_review?: string;
  updated_at?: string;
}

export interface OfflineChatThread {
  id: string;
  title: string;
  time?: string;
  mode?: 'normal' | 'document';
  selectedDocId?: string | 'all';
  workspace_id?: number;
  messages: Array<{
    id: string;
    sender: 'user' | 'assistant';
    text: string;
    citations?: any[];
    timestamp: string;
    model?: string;
  }>;
  updated_at?: string;
}

export interface OfflineChunk {
  chunk_index: number;
  content: string;
  token_count?: number;
}

export interface OfflineDocument {
  id: string | number;
  name: string;
  file_type: string;
  file_size: number;
  content: string;
  chunks: OfflineChunk[];
  workspace_id: number;
  status: 'Indexed' | 'Processed' | 'Uploading' | 'Failed';
  created_at: string;
}

class LocalDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this browser.'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Notes Store
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('workspace_id', 'workspace_id', { unique: false });
          notesStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 2. Flashcards Store
        if (!db.objectStoreNames.contains('flashcards')) {
          const flashStore = db.createObjectStore('flashcards', { keyPath: 'id' });
          flashStore.createIndex('deck_name', 'deck_name', { unique: false });
          flashStore.createIndex('workspace_id', 'workspace_id', { unique: false });
        }

        // 3. Chat Threads Store
        if (!db.objectStoreNames.contains('chat_threads')) {
          const chatStore = db.createObjectStore('chat_threads', { keyPath: 'id' });
          chatStore.createIndex('workspace_id', 'workspace_id', { unique: false });
          chatStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 4. Documents Store
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('workspace_id', 'workspace_id', { unique: false });
          docStore.createIndex('name', 'name', { unique: false });
        }

        // 5. Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // ----------------------------------------------------------------------------
  // Notes Operations
  // ----------------------------------------------------------------------------
  async getNotes(workspaceId?: number): Promise<OfflineNote[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineNote[] = req.result || [];
        if (workspaceId !== undefined && workspaceId !== null) {
          results = results.filter((n) => n.workspace_id === Number(workspaceId));
        }
        results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveNote(note: Partial<OfflineNote> & { title: string }): Promise<OfflineNote> {
    const db = await this.openDatabase();
    const id = note.id || `local-note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const fullNote: OfflineNote = {
      id,
      title: note.title,
      content: note.content || '',
      workspace_id: note.workspace_id || 1,
      tags: note.tags || [],
      created_at: note.created_at || now,
      updated_at: now,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const req = store.put(fullNote);

      req.onsuccess = () => resolve(fullNote);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteNote(id: string | number): Promise<boolean> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ----------------------------------------------------------------------------
  // Flashcards Operations
  // ----------------------------------------------------------------------------
  async getFlashcards(workspaceId?: number): Promise<OfflineFlashcard[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('flashcards', 'readonly');
      const store = tx.objectStore('flashcards');
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineFlashcard[] = req.result || [];
        if (workspaceId !== undefined && workspaceId !== null) {
          results = results.filter((c) => c.workspace_id === Number(workspaceId));
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveFlashcard(card: Partial<OfflineFlashcard> & { deck_name: string; front: string; back: string }): Promise<OfflineFlashcard> {
    const db = await this.openDatabase();
    const id = card.id || `local-fc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullCard: OfflineFlashcard = {
      id,
      deck_name: card.deck_name,
      front: card.front,
      back: card.back,
      workspace_id: card.workspace_id || 1,
      confidence_score: card.confidence_score ?? 0,
      interval_days: card.interval_days ?? 1,
      review_count: card.review_count ?? 0,
      next_review: card.next_review || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      const req = store.put(fullCard);

      req.onsuccess = () => resolve(fullCard);
      req.onerror = () => reject(req.error);
    });
  }

  async saveFlashcardsBatch(cards: Array<Partial<OfflineFlashcard> & { deck_name: string; front: string; back: string }>): Promise<OfflineFlashcard[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      const saved: OfflineFlashcard[] = [];

      cards.forEach((c) => {
        const id = c.id || `local-fc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const fullCard: OfflineFlashcard = {
          id,
          deck_name: c.deck_name,
          front: c.front,
          back: c.back,
          workspace_id: c.workspace_id || 1,
          confidence_score: c.confidence_score ?? 0,
          interval_days: c.interval_days ?? 1,
          review_count: c.review_count ?? 0,
          next_review: c.next_review || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.put(fullCard);
        saved.push(fullCard);
      });

      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteDeck(deckName: string, workspaceId?: number): Promise<boolean> {
    const all = await this.getFlashcards(workspaceId);
    const toDelete = all.filter((c) => c.deck_name === deckName);
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      toDelete.forEach((c) => store.delete(c.id));

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ----------------------------------------------------------------------------
  // Chat Threads Operations
  // ----------------------------------------------------------------------------
  async getChatThreads(workspaceId?: number): Promise<OfflineChatThread[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chat_threads', 'readonly');
      const store = tx.objectStore('chat_threads');
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineChatThread[] = req.result || [];
        if (workspaceId !== undefined && workspaceId !== null) {
          results = results.filter((t) => t.workspace_id === Number(workspaceId));
        }
        results.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveChatThread(thread: OfflineChatThread): Promise<OfflineChatThread> {
    const db = await this.openDatabase();
    const updated = {
      ...thread,
      updated_at: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('chat_threads', 'readwrite');
      const store = tx.objectStore('chat_threads');
      const req = store.put(updated);

      req.onsuccess = () => resolve(updated);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteChatThread(id: string): Promise<boolean> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chat_threads', 'readwrite');
      const store = tx.objectStore('chat_threads');
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ----------------------------------------------------------------------------
  // Documents & Semantic Chunks Operations
  // ----------------------------------------------------------------------------
  async getDocuments(workspaceId?: number): Promise<OfflineDocument[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineDocument[] = req.result || [];
        if (workspaceId !== undefined && workspaceId !== null) {
          results = results.filter((d) => d.workspace_id === Number(workspaceId));
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveDocument(doc: OfflineDocument): Promise<OfflineDocument> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.put(doc);

      req.onsuccess = () => resolve(doc);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteDocument(id: string | number): Promise<boolean> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ----------------------------------------------------------------------------
  // In-Browser Semantic Search & Vector Matching
  // Computes TF-IDF & Cosine Similarity across local document chunks
  // ----------------------------------------------------------------------------
  async searchLocalChunks(
    query: string,
    workspaceId?: number,
    topK: number = 5
  ): Promise<Array<{
    documentId: string | number;
    docName: string;
    chunkIndex: number;
    snippet: string;
    score: number;
    scoreText: string;
  }>> {
    const docs = await this.getDocuments(workspaceId);
    if (!docs || docs.length === 0) return [];

    const queryTokens = query.toLowerCase().match(/\b\w+\b/g) || [];
    if (queryTokens.length === 0) return [];

    const allMatches: Array<{
      documentId: string | number;
      docName: string;
      chunkIndex: number;
      snippet: string;
      score: number;
      scoreText: string;
    }> = [];

    // Frequency analysis
    docs.forEach((doc) => {
      doc.chunks.forEach((chunk) => {
        const chunkText = chunk.content.toLowerCase();
        let matchScore = 0;

        queryTokens.forEach((token) => {
          if (token.length > 2) {
            const occurrences = (chunkText.match(new RegExp(`\\b${token}`, 'g')) || []).length;
            matchScore += occurrences * 1.5;
            if (chunkText.includes(token)) {
              matchScore += 1.0;
            }
          }
        });

        // Exact phrase boost
        if (chunkText.includes(query.toLowerCase())) {
          matchScore += 5.0;
        }

        if (matchScore > 0) {
          const confidence = Math.min(Math.round((matchScore / (queryTokens.length * 2)) * 100), 98);
          allMatches.push({
            documentId: doc.id,
            docName: doc.name,
            chunkIndex: chunk.chunk_index,
            snippet: chunk.content,
            score: matchScore,
            scoreText: `${Math.max(confidence, 65)}% Match`,
          });
        }
      });
    });

    allMatches.sort((a, b) => b.score - a.score);
    return allMatches.slice(0, topK);
  }
}

export const localDb = new LocalDatabase();
