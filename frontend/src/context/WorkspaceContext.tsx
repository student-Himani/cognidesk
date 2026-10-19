import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  WorkspaceItem,
  getWorkspaces,
  activateWorkspace as activateWorkspaceApi,
  createWorkspace as createWorkspaceApi,
  updateWorkspace as updateWorkspaceApi,
  deleteWorkspace as deleteWorkspaceApi,
} from '../services/workspaceService';

interface WorkspaceContextType {
  workspaces: WorkspaceItem[];
  activeWorkspace: WorkspaceItem | null;
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (id: number) => Promise<boolean>;
  createNewWorkspace: (data: { name: string; description?: string; category?: string }) => Promise<WorkspaceItem | null>;
  renameWorkspace: (id: number, data: { name?: string; description?: string; category?: string }) => Promise<WorkspaceItem | null>;
  removeWorkspace: (id: number) => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await getWorkspaces();
      setWorkspaces(list);
      localStorage.setItem('cognidesk_cached_workspaces', JSON.stringify(list));

      const active = list.find((w) => w.is_active) || list[0] || null;
      setActiveWorkspace(active);

      if (active) {
        localStorage.setItem('cognidesk_active_workspace_id', String(active.id));
      }
    } catch (err) {
      console.warn('Network unreachable while loading workspaces; restoring cached workspaces:', err);
      const cached = localStorage.getItem('cognidesk_cached_workspaces');
      if (cached) {
        try {
          const parsed: WorkspaceItem[] = JSON.parse(cached);
          if (parsed && parsed.length > 0) {
            setWorkspaces(parsed);
            const activeId = localStorage.getItem('cognidesk_active_workspace_id');
            const active = parsed.find((w) => String(w.id) === activeId) || parsed[0];
            setActiveWorkspace(active);
            setLoading(false);
            return;
          }
        } catch {}
      }

      // Default offline workspace
      const defaultOfflineWs: WorkspaceItem = {
        id: 1,
        name: 'Personal Offline Workspace',
        description: 'Offline-first local workspace on your device',
        category: 'General',
        is_active: true,
        document_count: 0,
        chunk_count: 0,
        note_count: 0,
        flashcard_deck_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setWorkspaces([defaultOfflineWs]);
      setActiveWorkspace(defaultOfflineWs);
      localStorage.setItem('cognidesk_active_workspace_id', '1');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch workspaces whenever auth state changes (login, logout, guest switch)
  useEffect(() => {
    refreshWorkspaces();
  }, [user?.id, token, refreshWorkspaces]);

  const switchWorkspace = async (id: number): Promise<boolean> => {
    try {
      setLoading(true);
      const activated = await activateWorkspaceApi(id);
      setActiveWorkspace(activated);
      localStorage.setItem('cognidesk_active_workspace_id', String(activated.id));

      // Refresh list to update active statuses and counts
      const updatedList = await getWorkspaces();
      setWorkspaces(updatedList);

      // Dispatch global event so active pages can instantly re-fetch their scoped content
      window.dispatchEvent(new CustomEvent('workspace-switched', { detail: activated }));
      return true;
    } catch (err) {
      console.error('Failed to switch workspace:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const createNewWorkspace = async (data: {
    name: string;
    description?: string;
    category?: string;
  }): Promise<WorkspaceItem | null> => {
    try {
      const created = await createWorkspaceApi(data);
      await refreshWorkspaces();
      return created;
    } catch (err) {
      console.error('Failed to create workspace:', err);
      return null;
    }
  };

  const renameWorkspace = async (
    id: number,
    data: { name?: string; description?: string; category?: string }
  ): Promise<WorkspaceItem | null> => {
    try {
      const updated = await updateWorkspaceApi(id, data);
      await refreshWorkspaces();
      if (activeWorkspace?.id === id && updated) {
        setActiveWorkspace(updated);
        window.dispatchEvent(new CustomEvent('workspace-switched', { detail: updated }));
      }
      return updated;
    } catch (err) {
      console.error('Failed to rename workspace:', err);
      return null;
    }
  };

  const removeWorkspace = async (id: number): Promise<boolean> => {
    try {
      const success = await deleteWorkspaceApi(id);
      if (success) {
        const list = await getWorkspaces();
        setWorkspaces(list);

        if (activeWorkspace?.id === id) {
          const newActive = list.find((w) => w.is_active) || list[0] || null;
          setActiveWorkspace(newActive);
          if (newActive) {
            localStorage.setItem('cognidesk_active_workspace_id', String(newActive.id));
            window.dispatchEvent(new CustomEvent('workspace-switched', { detail: newActive }));
          }
        }
      }
      return success;
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      return false;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        loading,
        refreshWorkspaces,
        switchWorkspace,
        createNewWorkspace,
        renameWorkspace,
        removeWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
