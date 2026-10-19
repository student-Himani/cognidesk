import apiClient from './apiClient';
import { localDb } from './localDb';

export interface NoteItem {
  id: number;
  title: string;
  category: string;
  content: string;
  document_id?: number | null;
  document_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotesResponse {
  success: boolean;
  message: string;
  data: NoteItem[];
}

export interface SingleNoteResponse {
  success: boolean;
  message: string;
  data: NoteItem;
}

export const getNotes = async (): Promise<NoteItem[]> => {
  // If online, try fetching from backend
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<NotesResponse>('/notes');
      const notes = response.data.data;
      // Cache notes in IndexedDB
      notes.forEach((n) => {
        localDb.saveNote({
          id: n.id,
          title: n.title,
          content: n.content,
          tags: [n.category || 'General'],
          created_at: n.created_at,
          updated_at: n.updated_at,
        }).catch(() => {});
      });
      return notes;
    } catch (error) {
      console.warn('[NotesService] Backend unreachable, falling back to local IndexedDB store:', error);
    }
  }

  // Offline fallback
  try {
    const offlineNotes = await localDb.getNotes();
    return offlineNotes.map((n) => ({
      id: typeof n.id === 'number' ? n.id : parseInt(String(n.id).replace(/\D/g, '')) || Date.now(),
      title: n.title,
      category: n.tags?.[0] || 'General',
      content: n.content,
      created_at: n.created_at,
      updated_at: n.updated_at,
    }));
  } catch {
    return [];
  }
};

export const getNoteById = async (id: number): Promise<NoteItem | null> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<SingleNoteResponse>(`/notes/${id}`);
      return response.data.data;
    } catch {
      // Fall through to localDb
    }
  }

  const allNotes = await getNotes();
  return allNotes.find((n) => n.id === id) || null;
};

export const createNote = async (data: {
  title: string;
  content: string;
  category?: string;
  document_id?: number;
}): Promise<NoteItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.post<SingleNoteResponse>('/notes', data);
      const note = response.data.data;
      localDb.saveNote({
        id: note.id,
        title: note.title,
        content: note.content,
        tags: [note.category || 'General'],
        created_at: note.created_at,
        updated_at: note.updated_at,
      }).catch(() => {});
      return note;
    } catch (err) {
      console.warn('[NotesService] API creation failed, storing in IndexedDB:', err);
    }
  }

  // Offline creation
  const now = new Date().toISOString();
  const localId = Date.now();
  await localDb.saveNote({
    id: localId,
    title: data.title,
    content: data.content,
    tags: [data.category || 'General'],
    created_at: now,
    updated_at: now,
  });

  return {
    id: localId,
    title: data.title,
    content: data.content,
    category: data.category || 'General',
    document_id: data.document_id,
    created_at: now,
    updated_at: now,
  };
};

export const updateNote = async (
  id: number,
  data: { title?: string; content?: string; category?: string }
): Promise<NoteItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.put<SingleNoteResponse>(`/notes/${id}`, data);
      const note = response.data.data;
      localDb.saveNote({
        id: note.id,
        title: note.title,
        content: note.content,
        tags: [note.category || 'General'],
        created_at: note.created_at,
        updated_at: note.updated_at,
      }).catch(() => {});
      return note;
    } catch (err) {
      console.warn('[NotesService] API update failed, updating in IndexedDB:', err);
    }
  }

  // Offline update
  const existing = (await getNotes()).find((n) => n.id === id);
  const now = new Date().toISOString();
  const updatedNote: NoteItem = {
    id,
    title: data.title ?? existing?.title ?? 'Untitled Note',
    content: data.content ?? existing?.content ?? '',
    category: data.category ?? existing?.category ?? 'General',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await localDb.saveNote({
    id,
    title: updatedNote.title,
    content: updatedNote.content,
    tags: [updatedNote.category],
    created_at: updatedNote.created_at,
    updated_at: now,
  });

  return updatedNote;
};

export const deleteNote = async (id: number): Promise<boolean> => {
  // Always remove locally
  await localDb.deleteNote(id).catch(() => {});

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.delete<{ success: boolean }>(`/notes/${id}`);
      return response.data.success;
    } catch {
      return true;
    }
  }

  return true;
};

export const generateAINote = async (
  documentId: number,
  model?: string
): Promise<NoteItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.post<SingleNoteResponse>(
        '/notes/generate',
        {
          document_id: documentId,
          model: model || undefined,
        },
        {
          timeout: 180000,
        }
      );
      return response.data.data;
    } catch (err) {
      console.warn('[NotesService] AI generation backend failed, generating offline note:', err);
    }
  }

  // Offline note generation from local document
  const localDocs = await localDb.getDocuments();
  const doc = localDocs.find((d) => d.id === documentId || d.id === String(documentId)) || localDocs[0];
  const title = doc ? `Summary: ${doc.name}` : `Key Concepts Note (${new Date().toLocaleDateString()})`;
  const snippet = doc && doc.chunks.length > 0
    ? doc.chunks.slice(0, 3).map((c, i) => `### Key Section ${i + 1}\n${c.content.slice(0, 300)}...`).join('\n\n')
    : 'Summary created in offline mode.';

  const noteContent = `# ${title}\n\n*Generated in In-Browser Offline Engine*\n\n${snippet}\n\n---\n*Created locally without server dependency.*`;
  return await createNote({
    title,
    content: noteContent,
    category: 'Summary',
    document_id: documentId,
  });
};
