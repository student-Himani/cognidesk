import apiClient, { getApiBaseUrl } from './apiClient';
import { DocumentItem } from '../store/slices/documentsSlice';
import { localDb, OfflineDocument } from './localDb';

export type { DocumentItem };

export interface DocumentContentResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    status: string;
    raw_text: string;
    cleaned_text: string;
    word_count: number;
    page_count: number;
    metadata: Record<string, any>;
    error_message?: string;
  };
}

function chunkText(text: string, chunkSize: number = 500, overlap: number = 50) {
  const chunks = [];
  let start = 0;
  let idx = 1;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({
        chunk_index: idx++,
        content,
        token_count: Math.round(content.length / 4),
      });
    }
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

export const fetchDocuments = async (): Promise<DocumentItem[]> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<DocumentItem[]>('/documents');
      const docs = response.data;
      if (Array.isArray(docs)) {
        // Cache basic document meta in IndexedDB
        docs.forEach((d) => {
          localDb.saveDocument({
            id: d.id,
            name: d.name,
            file_type: d.type || 'txt',
            file_size: 1024,
            content: '',
            chunks: [],
            workspace_id: 1,
            status: 'Indexed',
            created_at: d.date || new Date().toISOString(),
          }).catch(() => {});
        });
        return docs;
      }
    } catch (err) {
      console.warn('[DocumentService] Backend unreachable, fetching local IndexedDB documents:', err);
    }
  }

  // Offline fallback from localDb
  try {
    const offlineDocs = await localDb.getDocuments();
    return offlineDocs.map((d) => ({
      id: String(d.id),
      name: d.name,
      size: `${Math.round(d.file_size / 1024)} KB`,
      type: (d.file_type || 'txt').toUpperCase(),
      status: 'Indexed' as const,
      date: new Date(d.created_at).toLocaleDateString(),
      chunks: d.chunks?.length || 1,
      word_count: d.content ? d.content.split(/\s+/).length : 0,
      page_count: 1,
      has_text: true,
    }));
  } catch {
    return [];
  }
};

export const uploadDocumentFile = async (
  file: File,
  onProgress?: (percent: number) => void
): Promise<DocumentItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<{ success: boolean; message: string; data: DocumentItem }>(
        '/documents/upload',
        formData,
        {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && onProgress) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(percentCompleted);
            }
          },
        }
      );

      return response.data.data;
    } catch (err) {
      console.warn('[DocumentService] Upload failed online, falling back to in-browser indexing:', err);
    }
  }

  // In-Browser Client-side offline document processing (Module 32)
  if (onProgress) onProgress(30);

  let rawContent = '';
  try {
    rawContent = await file.text();
  } catch {
    rawContent = `Binary document content: ${file.name}`;
  }

  if (onProgress) onProgress(60);

  const chunks = chunkText(rawContent, 500, 50);
  const now = new Date().toISOString();
  const localDoc: OfflineDocument = {
    id: `doc-${Date.now()}`,
    name: file.name,
    file_type: file.name.split('.').pop() || 'txt',
    file_size: file.size,
    content: rawContent,
    chunks,
    workspace_id: 1,
    status: 'Indexed',
    created_at: now,
  };

  await localDb.saveDocument(localDoc);
  if (onProgress) onProgress(100);

  return {
    id: String(localDoc.id),
    name: localDoc.name,
    size: `${(file.size / 1024).toFixed(1)} KB`,
    type: (file.name.split('.').pop() || 'txt').toUpperCase(),
    status: 'Indexed' as const,
    date: 'Just now',
    chunks: chunks.length,
    word_count: rawContent.split(/\s+/).length,
    page_count: 1,
    has_text: true,
  };
};

export const deleteDocumentById = async (id: string): Promise<boolean> => {
  await localDb.deleteDocument(id).catch(() => {});
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await apiClient.delete(`/documents/${id}`);
      return true;
    } catch {}
  }
  return true;
};

export const renameDocument = async (id: string, newName: string): Promise<DocumentItem> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.patch<{ success: boolean; data: DocumentItem }>(`/documents/${id}`, {
        original_filename: newName,
      });
      return response.data.data;
    } catch {}
  }

  const all = await localDb.getDocuments();
  const target = all.find((d) => String(d.id) === id);
  if (target) {
    target.name = newName;
    await localDb.saveDocument(target);
  }

  return {
    id,
    name: newName,
    size: `${Math.round((target?.file_size || 0) / 1024)} KB`,
    type: (newName.split('.').pop() || 'txt').toUpperCase(),
    status: 'Indexed' as const,
    date: target ? new Date(target.created_at).toLocaleDateString() : 'Just now',
    chunks: target?.chunks?.length || 1,
    word_count: target?.content ? target.content.split(/\s+/).length : 0,
    page_count: 1,
    has_text: true,
  };
};

export const getDocumentContent = async (id: string): Promise<DocumentContentResponse['data']> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.get<DocumentContentResponse>(`/documents/${id}/content`);
      return response.data.data;
    } catch {}
  }

  const all = await localDb.getDocuments();
  const target = all.find((d) => String(d.id) === id);
  const text = target?.content || 'Offline document content unavailable.';

  return {
    id,
    name: target?.name || 'Document',
    status: 'Indexed',
    raw_text: text,
    cleaned_text: text,
    word_count: text.split(/\s+/).length,
    page_count: 1,
    metadata: { offline: true },
  };
};

export const processDocumentManual = async (id: string): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const response = await apiClient.post<{ success: boolean }>(`/documents/${id}/process`);
      return response.data.success;
    } catch {}
  }
  return true;
};

export const getDocumentPreviewUrl = (id: string): string => {
  return `${getApiBaseUrl()}/documents/${id}/preview`;
};

