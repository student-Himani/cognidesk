import apiClient from './apiClient';

export interface CitationMetadata {
  document_id: number;
  filename: string;
  filetype: string;
  chunk_index: string;
  start_char: number;
  end_char: number;
  word_count: number;
}

export interface SearchResultItem {
  id: string;
  document_id: number;
  title: string;
  snippet: string;
  score: string;
  similarity_score: number;
  distance: number;
  chunkIndex: string;
  docType: string;
  metadata: Record<string, any>;
  citation: CitationMetadata;
}

export interface SearchQueryRequest {
  query: string;
  top_k?: number;
  search_mode?: 'semantic' | 'fulltext';
  filetype?: string;
  document_ids?: number[];
  min_score?: number;
}

export interface SearchResponseData {
  query: string;
  search_mode: string;
  top_k: number;
  execution_time_ms: number;
  results_count: number;
  results: SearchResultItem[];
}

export interface SearchResponse {
  success: boolean;
  message: string;
  data: SearchResponseData;
}

export interface SearchHistoryItem {
  id: number;
  query_text: string;
  search_mode: string;
  filters: Record<string, any> | null;
  results_count: number;
  execution_time_ms: number;
  created_at: string;
}

export interface SearchHistoryResponse {
  success: boolean;
  message: string;
  data: {
    total_items: number;
    history: SearchHistoryItem[];
  };
}

export const executeSearch = async (payload: SearchQueryRequest): Promise<SearchResponseData> => {
  const response = await apiClient.post<SearchResponse>('/search/query', payload);
  return response.data.data;
};

export const fetchSearchHistory = async (limit = 20): Promise<SearchHistoryItem[]> => {
  try {
    const response = await apiClient.get<SearchHistoryResponse>(`/search/history?limit=${limit}`);
    return response.data.data.history || [];
  } catch (err) {
    return [];
  }
};

export const clearSearchHistory = async (): Promise<boolean> => {
  const response = await apiClient.delete<{ success: boolean }>('/search/history');
  return response.data.success;
};

export const deleteSearchHistoryItem = async (historyId: number): Promise<boolean> => {
  const response = await apiClient.delete<{ success: boolean }>(`/search/history/${historyId}`);
  return response.data.success;
};
