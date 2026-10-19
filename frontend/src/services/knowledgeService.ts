import apiClient from './apiClient';

export interface KnowledgeCollectionItem {
  name: string;
  count: string;
  docs: number;
  tags: string[];
}

export interface KnowledgeBaseStats {
  workspace_id?: number;
  workspace_name?: string;
  total_documents: number;
  total_chunks: number;
  indexed_documents_count: number;
  embedded_documents_count: number;
  processed_documents_count: number;
  chroma_collection_name: string;
  total_vectors_in_collection: number;
  collection_status: string;
  distance_metric: string;
  embedding_model: string;
  embedding_dimension: number;
  embedding_provider: string;
  chunk_size: number;
  chunk_overlap: number;
  batch_size: number;
  persist_dir: string;
  all_collections: string[];
  collections: KnowledgeCollectionItem[];
}

export interface KnowledgeStatsResponse {
  success: boolean;
  data: KnowledgeBaseStats;
}

export const fetchKnowledgeBaseStats = async (workspaceId?: number): Promise<KnowledgeBaseStats | null> => {
  try {
    const params = workspaceId ? { workspace_id: workspaceId } : {};
    const response = await apiClient.get<KnowledgeStatsResponse>('/vector-db/stats', { params });
    return response.data?.data || null;
  } catch (err) {
    console.error('Failed to fetch knowledge base stats:', err);
    return null;
  }
};

export const fetchKnowledgeCollections = async (): Promise<KnowledgeCollectionItem[]> => {
  const stats = await fetchKnowledgeBaseStats();
  return stats?.collections || [];
};
