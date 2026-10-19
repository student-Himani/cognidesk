import apiClient from './apiClient';

export interface AppSettings {
  id: number;
  ai_provider: 'ollama' | 'cloud';
  ollama_base_url: string;
  ollama_model: string;
  cloud_provider: string;
  cloud_model: string;
  cloud_api_key?: string | null;
  has_api_key: boolean;
  cloud_base_url: string;
  is_offline_mode: boolean;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  updated_at: string | null;
}

export interface OllamaTestResult {
  connected: boolean;
  base_url: string;
  models: string[];
  message: string;
}

export interface CloudTestResult {
  connected: boolean;
  provider: string;
  model?: string;
  message: string;
}

export interface SystemStatus {
  backend: {
    status: string;
    version: string;
    app_name: string;
    host: string;
    port: number;
  };
  database: {
    status: string;
    engine: string;
    database_url: string;
    total_workspaces: number;
    total_documents: number;
  };
  vector_store: {
    status: string;
    engine: string;
    collection: string;
    total_vectors: number;
    persist_dir: string;
  };
  ollama: OllamaTestResult;
  ocr_engine: {
    status: string;
    engine: string;
    models: string[];
    supported_formats: string[];
    offline: boolean;
  };
  embedding_engine: {
    status: string;
    model_name: string;
    dimensions: number;
    metric: string;
    chunk_size: number;
    chunk_overlap: number;
  };
  mcp: {
    status: string;
    is_implemented: boolean;
    title: string;
    description: string;
    planned_version: string;
  };
  privacy_mode: string;
}

export const getSettings = async (): Promise<AppSettings> => {
  const response = await apiClient.get<AppSettings>('/settings');
  return response.data;
};

export const updateSettings = async (data: Partial<AppSettings>): Promise<AppSettings> => {
  const response = await apiClient.put<AppSettings>('/settings', data);
  return response.data;
};

export const testOllamaConnection = async (baseUrl: string): Promise<OllamaTestResult> => {
  const response = await apiClient.post<OllamaTestResult>('/settings/test-ollama', {
    base_url: baseUrl,
  });
  return response.data;
};

export const testCloudConnection = async (
  provider: string,
  apiKey?: string | null,
  model?: string,
  baseUrl?: string
): Promise<CloudTestResult> => {
  const response = await apiClient.post<CloudTestResult>('/settings/test-cloud', {
    provider,
    api_key: apiKey || null,
    model,
    base_url: baseUrl,
  });
  return response.data;
};

export const getSystemStatus = async (): Promise<SystemStatus> => {
  const response = await apiClient.get<SystemStatus>('/settings/system-status');
  return response.data;
};
