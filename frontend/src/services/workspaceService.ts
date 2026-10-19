import apiClient from './apiClient';

export interface WorkspaceItem {
  id: number;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  document_count: number;
  chunk_count: number;
  note_count: number;
  flashcard_deck_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceResponse {
  success: boolean;
  message: string;
  data: WorkspaceItem[];
}

export interface SingleWorkspaceResponse {
  success: boolean;
  message: string;
  data: WorkspaceItem;
}

export const getWorkspaces = async (): Promise<WorkspaceItem[]> => {
  try {
    const response = await apiClient.get<WorkspaceResponse>('/workspaces');
    return response.data.data;
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return [];
  }
};

export const getActiveWorkspace = async (): Promise<WorkspaceItem | null> => {
  try {
    const response = await apiClient.get<SingleWorkspaceResponse>('/workspaces/active');
    return response.data.data;
  } catch (error) {
    console.error('Failed to fetch active workspace:', error);
    return null;
  }
};

export const createWorkspace = async (data: {
  name: string;
  description?: string;
  category?: string;
}): Promise<WorkspaceItem> => {
  const response = await apiClient.post<SingleWorkspaceResponse>('/workspaces', data);
  return response.data.data;
};

export const updateWorkspace = async (
  id: number,
  data: { name?: string; description?: string; category?: string }
): Promise<WorkspaceItem> => {
  const response = await apiClient.put<SingleWorkspaceResponse>(`/workspaces/${id}`, data);
  return response.data.data;
};

export const activateWorkspace = async (id: number): Promise<WorkspaceItem> => {
  const response = await apiClient.post<SingleWorkspaceResponse>(`/workspaces/${id}/activate`);
  return response.data.data;
};

export const deleteWorkspace = async (id: number): Promise<boolean> => {
  const response = await apiClient.delete<{ success: boolean; message: string }>(`/workspaces/${id}`);
  return response.data.success;
};
