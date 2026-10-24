import apiClient, { getApiBaseUrl } from './apiClient';
import { localDb } from './localDb';
import { browserAiEngine } from './browserAiEngine';

export interface RagCitation {
  docName: string;
  page: string;
  score: string;
  documentId?: number;
  startChar?: number;
  endChar?: number;
  similarityScore?: number;
  vectorDistance?: number;
}

export interface RagQueryRequest {
  query: string;
  mode?: 'normal' | 'document';
  model?: string;
  top_k?: number;
  filetype?: string;
  document_ids?: number[];
  system_prompt?: string;
  messages?: Array<{ sender: string; text: string; role?: string; content?: string }>;
}

export interface RagResponseData {
  query: string;
  answer: string;
  model: string;
  citations: RagCitation[];
  context_used_count: number;
  execution_time_ms: number;
  ollama_online: boolean;
}

export interface RagApiResponse {
  success: boolean;
  message: string;
  data: RagResponseData;
}

export interface OllamaStatusData {
  online: boolean;
  base_url: string;
  models: string[];
  is_hosted?: boolean;
  provider?: string;
  mode_label?: string;
  active_model?: string;
  details?: string;
  cloud_provider?: string;
  cloud_model?: string;
  has_cloud_key?: boolean;
}

export interface OllamaStatusResponse {
  success: boolean;
  message: string;
  data: OllamaStatusData;
}

export const sendRagQuery = async (payload: RagQueryRequest): Promise<RagResponseData> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    const response = await apiClient.post<RagApiResponse>('/rag/query', payload);
    return response.data.data;
  }

  // Offline In-Browser Local AI Execution (Strictly offline / air-gapped only)
  const isDocMode = payload.mode === 'document';
  const localChunks = isDocMode ? await localDb.searchLocalChunks(payload.query, 1, payload.top_k || 3) : [];
  const result = await browserAiEngine.generateOfflineAnswer({
    query: payload.query,
    chunks: localChunks,
    modelId: payload.model,
  });

  return {
    query: payload.query,
    answer: result.answer,
    model: result.model,
    citations: result.citations,
    context_used_count: result.citations.length,
    execution_time_ms: result.executionTimeMs,
    ollama_online: false,
  };
};

export const getOllamaStatus = async (): Promise<OllamaStatusData> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<OllamaStatusResponse>('/rag/status');
      return response.data.data;
    } catch (err) {
      // Backend unreachable
    }
  }

  // In-Browser Local AI Status (Module 32)
  return {
    online: true,
    base_url: 'in-browser',
    models: ['in-browser-extractive', 'smollm-135m-q4', 'qwen1.5-0.5b-q4'],
    is_hosted: false,
    mode_label: 'In-Browser Local Engine (Offline)',
  };
};

export interface RagContextData {
  query: string;
  system_prompt: string;
  full_prompt: string;
  citations: RagCitation[];
  context_chunks: any[];
  raw_chunks_count: number;
  selected_chunks_count: number;
  estimated_tokens: number;
  execution_time_ms: number;
}

export interface RagContextApiResponse {
  success: boolean;
  message: string;
  data: RagContextData;
}

export const getRagContext = async (payload: RagQueryRequest): Promise<RagContextData> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.post<RagContextApiResponse>('/rag/context', payload);
      return response.data.data;
    } catch {}
  }

  // Offline context extraction
  const localChunks = await localDb.searchLocalChunks(payload.query, 1, payload.top_k || 3);
  const citations = localChunks.map((c) => ({
    docName: c.docName,
    page: `Chunk #${c.chunkIndex}`,
    score: c.scoreText,
    documentId: typeof c.documentId === 'number' ? c.documentId : 1,
  }));

  return {
    query: payload.query,
    system_prompt: 'CogniDesk In-Browser Offline Engine',
    full_prompt: payload.query,
    citations,
    context_chunks: localChunks,
    raw_chunks_count: localChunks.length,
    selected_chunks_count: localChunks.length,
    estimated_tokens: 150,
    execution_time_ms: 10,
  };
};

export const streamRagQuery = (
  payload: RagQueryRequest,
  onMetadata: (data: { model: string; citations: RagCitation[]; context_used_count: number }) => void,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: any) => void
): (() => void) => {
  const baseUrl = getApiBaseUrl();
  const controller = new AbortController();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CogniDesk-Client': 'WebUI-v1.0',
  };
  const token = localStorage.getItem('cognidesk_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const activeWsId = localStorage.getItem('cognidesk_active_workspace_id');
  if (activeWsId) {
    headers['X-Workspace-Id'] = activeWsId;
  }

  // Attempt online stream first
  fetch(`${baseUrl}/rag/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errorData.detail || `RAG stream error: ${res.statusText}`);
      }
      if (!res.body) {
        throw new Error('ReadableStream not supported');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace(/^data: /, '').trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === 'metadata') {
                onMetadata({
                  model: parsed.model,
                  citations: parsed.citations || [],
                  context_used_count: parsed.context_used_count || 0,
                });
              } else if (parsed.type === 'token') {
                onToken(parsed.token);
              } else if (parsed.type === 'error') {
                onError(new Error(parsed.error || 'AI generation error'));
                return;
              } else if (parsed.type === 'done') {
                onDone();
              }
            } catch (e) {
              console.error('Failed to parse SSE chunk:', e);
            }
          }
        }
      }
      onDone();
    })
    .catch(async (err) => {
      if (err.name === 'AbortError') return;

      const isOfflineModel = payload.model === 'in-browser-extractive' || payload.model?.includes('MLC');
      const isStrictlyOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (!isOfflineModel && !isStrictlyOffline) {
        // Online cloud or backend error: show actual error to user
        onError(err);
        return;
      }

      // Air-gapped or explicit local offline execution
      try {
        const isDocMode = payload.mode === 'document';
        const localChunks = isDocMode ? await localDb.searchLocalChunks(payload.query, 1, payload.top_k || 3) : [];
        const citations: RagCitation[] = localChunks.map((c) => ({
          docName: c.docName,
          page: `Chunk #${c.chunkIndex}`,
          score: c.scoreText,
          documentId: typeof c.documentId === 'number' ? c.documentId : 1,
        }));

        onMetadata({
          model: payload.model || 'In-Browser Local AI',
          citations,
          context_used_count: citations.length,
        });

        const cancelOfflineStream = await browserAiEngine.streamOfflineAnswer(
          {
            query: payload.query,
            chunks: localChunks,
            modelId: payload.model,
            conversationHistory: payload.messages?.map((m) => ({ sender: m.sender, text: m.text })),
          },
          onToken,
          onDone,
          onError
        );

        controller.signal.addEventListener('abort', () => cancelOfflineStream());
      } catch (fallbackErr) {
        onError(err);
      }
    });

  return () => controller.abort();
};

