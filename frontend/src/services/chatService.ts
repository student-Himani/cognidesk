import apiClient from './apiClient';
import { localDb } from './localDb';

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  mode?: 'normal' | 'document';
  citations?: any[];
  attachedFile?: string;
  timestamp: string;
  suggestions?: string[];
  isLoadingSuggestions?: boolean;
}

export interface ChatThreadItem {
  id: string;
  workspace_id?: number;
  title: string;
  time: string;
  mode?: 'normal' | 'document';
  selectedDocId?: string | 'all';
  messages: ChatMessageItem[];
  message_count?: number;
  preview_text?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatThreadsApiResponse {
  success: boolean;
  message: string;
  data: ChatThreadItem[];
}

export interface SingleChatThreadApiResponse {
  success: boolean;
  message: string;
  data: ChatThreadItem;
}

export const fetchChatThreads = async (searchQuery?: string): Promise<ChatThreadItem[]> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const params = searchQuery ? { search: searchQuery } : {};
      const response = await apiClient.get<ChatThreadsApiResponse>('/chat/threads', { params });
      const threads = response.data.data || [];
      threads.forEach((t) => {
        localDb.saveChatThread(t).catch(() => {});
      });
      return threads;
    } catch (err) {
      console.warn('[ChatService] Backend unreachable, loading offline threads from IndexedDB:', err);
    }
  }

  // Offline fallback
  try {
    const offlineThreads = await localDb.getChatThreads();
    let filtered = offlineThreads;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = offlineThreads.filter(
        (t) => t.title.toLowerCase().includes(q) || t.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    }
    return filtered.map((t) => ({
      id: t.id,
      title: t.title,
      time: t.time || 'Offline',
      mode: t.mode || 'document',
      selectedDocId: t.selectedDocId || 'all',
      messages: t.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        citations: m.citations,
        timestamp: m.timestamp,
      })),
      updated_at: t.updated_at,
    }));
  } catch {
    return [];
  }
};

export const fetchChatThreadById = async (threadId: string): Promise<ChatThreadItem | null> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<SingleChatThreadApiResponse>(`/chat/threads/${threadId}`);
      return response.data.data || null;
    } catch {}
  }

  const all = await fetchChatThreads();
  return all.find((t) => t.id === threadId) || null;
};

export const saveChatThread = async (thread: ChatThreadItem): Promise<boolean> => {
  // Always save to IndexedDB
  await localDb.saveChatThread({
    id: thread.id,
    title: thread.title,
    time: thread.time,
    mode: thread.mode,
    selectedDocId: thread.selectedDocId,
    workspace_id: thread.workspace_id || 1,
    messages: thread.messages,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await apiClient.post('/chat/threads', thread);
      return true;
    } catch (err) {
      return true; // Still considered successful locally
    }
  }

  return true;
};

export const renameChatThread = async (threadId: string, title: string): Promise<boolean> => {
  const existing = await fetchChatThreadById(threadId);
  if (existing) {
    existing.title = title;
    await saveChatThread(existing);
  }

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await apiClient.put(`/chat/threads/${threadId}/rename`, { title });
    } catch {}
  }

  return true;
};

export const deleteChatThread = async (threadId: string): Promise<boolean> => {
  await localDb.deleteChatThread(threadId).catch(() => {});

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await apiClient.delete(`/chat/threads/${threadId}`);
    } catch {}
  }

  return true;
};

export const searchChatHistory = async (query: string): Promise<ChatThreadItem[]> => {
  return await fetchChatThreads(query);
};

export interface FollowUpSuggestionRequest {
  query: string;
  answer: string;
  mode?: 'normal' | 'document';
  messages?: Array<{ sender: string; text: string; role?: string; content?: string }>;
  citations?: any[];
  model?: string;
}

export interface FollowUpSuggestionResponse {
  success: boolean;
  message?: string;
  suggestions: string[];
}

export const fetchFollowUpSuggestions = async (
  payload: FollowUpSuggestionRequest
): Promise<string[]> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await apiClient.post<FollowUpSuggestionResponse>('/chat/suggestions', payload);
      if (res.data?.suggestions && res.data.suggestions.length > 0) {
        return res.data.suggestions;
      }
    } catch {}
  }

  // Client-side offline suggestions
  return [
    'What are the core takeaways of this topic?',
    'Can you explain the main conclusions in detail?',
    'How can this be applied practically in modern workflows?',
  ];
};

