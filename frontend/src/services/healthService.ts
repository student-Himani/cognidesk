import apiClient from './apiClient';

export interface HealthResponse {
  status: string;
  services: {
    api: string;
    database: string;
    vector_store: string;
  };
}

export const checkBackendHealth = async (): Promise<HealthResponse> => {
  const response = await apiClient.get<HealthResponse>('/health');
  return response.data;
};
