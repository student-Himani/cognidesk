import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  CheckCircle2,
  Trash2,
  Edit3,
  Layers,
  FileText,
  Sparkles,
  Database,
  ArrowRight,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceItem } from '../services/workspaceService';
import { useToast } from '../hooks/useToast';
import KnowledgeLoadingOrb from '../components/3d/KnowledgeLoadingOrb';

export const WorkspacesPage: React.FC = () => {
  const {
    workspaces,
    activeWorkspace,
    loading,
    switchWorkspace,
    createNewWorkspace,
    renameWorkspace,
    removeWorkspace,
  } = useWorkspace();

  const { showSuccess, showError } = useToast();

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Academic');
  const [isCreating, setIsCreating] = useState(false);

  // Edit Modal state
  const [editingWs, setEditingWs] = useState<WorkspaceItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete confirmation state
  const [deletingWs, setDeletingWs] = useState<WorkspaceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Switching state
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  const categories = [
    'Academic',
    'Business',
    'Engineering',
    'Medical',
    'Research',
    'Personal',
    'Other',
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showError('Validation Error', 'Workspace name is required');
      return;
    }
    setIsCreating(true);
    try {
      const created = await createNewWorkspace({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        category: newCategory,
      });
      if (created) {
        showSuccess('Created', `Workspace "${created.name}" created successfully`);
        setIsCreateOpen(false);
        setNewName('');
        setNewDesc('');
        setNewCategory('Academic');
      } else {
        showError('Error', 'Failed to create workspace');
      }
    } catch (err: any) {
      showError('Error', err.message || 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWs || !editName.trim()) return;
    setIsUpdating(true);
    try {
      const updated = await renameWorkspace(editingWs.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        category: editCategory,
      });
      if (updated) {
        showSuccess('Updated', `Workspace updated successfully`);
        setEditingWs(null);
      } else {
        showError('Error', 'Failed to update workspace');
      }
    } catch (err: any) {
      showError('Error', err.message || 'Failed to update workspace');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWs) return;
    setIsDeleting(true);
    try {
      const success = await removeWorkspace(deletingWs.id);
      if (success) {
        showSuccess('Deleted', `Workspace "${deletingWs.name}" removed`);
        setDeletingWs(null);
      } else {
        showError('Error', 'Could not delete workspace. Make sure it is not the only active one.');
      }
    } catch (err: any) {
      showError('Delete Failed', err.message || 'Error deleting workspace');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSwitch = async (id: number, name: string) => {
    if (activeWorkspace?.id === id) return;
    setSwitchingId(id);
    try {
      const success = await switchWorkspace(id);
      if (success) {
        showSuccess('Workspace Switched', `Switched active workspace to "${name}"`);
      } else {
        showError('Error', 'Failed to switch workspace');
      }
    } catch (err: any) {
      showError('Error', err.message || 'Failed to switch workspace');
    } finally {
      setSwitchingId(null);
    }
  };

  const openEditModal = (ws: WorkspaceItem) => {
    setEditingWs(ws);
    setEditName(ws.name);
    setEditDesc(ws.description || '');
    setEditCategory(ws.category || 'General');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Offline Workspaces</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-blue-500/30">
              {workspaces.length} Local Workspaces
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize documents, ChromaDB vector indices, AI notes, and study flashcards into isolated offline workspaces.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>

      {/* Loading state with 3D WebGL Orb */}
      {loading && workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white/80 dark:bg-slate-900/40 border border-blue-200/80 dark:border-blue-900/40 rounded-3xl">
          <KnowledgeLoadingOrb size={80} text="Loading offline workspaces..." />
        </div>
      ) : (
        /* Workspaces Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {workspaces.map((ws) => {
            const isActive = activeWorkspace?.id === ws.id;
            const isSwitching = switchingId === ws.id;

            return (
              <div
                key={ws.id}
                className={`flex flex-col justify-between p-6 rounded-3xl border transition-all relative ${
                  isActive
                    ? 'bg-blue-50/70 dark:bg-blue-950/25 border-blue-400 dark:border-cyan-500/50 shadow-xl shadow-blue-900/10'
                    : 'bg-white/85 dark:bg-slate-900/60 border-slate-200/90 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-white dark:hover:bg-slate-900/80 shadow-[0_8px_24px_rgba(0,0,0,0.04)]'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar: Icon + Title + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div
                        className={`p-3 rounded-2xl border shrink-0 ${
                          isActive
                            ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white border-blue-400 shadow-sm'
                            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border-blue-200 dark:border-blue-800/40'
                        }`}
                      >
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base truncate" title={ws.name}>
                          {ws.name}
                        </h3>
                        <span className="inline-block mt-0.5 text-[11px] font-semibold text-blue-700 dark:text-cyan-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">
                          {ws.category}
                        </span>
                      </div>
                    </div>

                    {isActive ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSwitch(ws.id, ws.name)}
                        disabled={isSwitching}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white dark:bg-slate-800 dark:hover:bg-blue-600 dark:text-slate-300 dark:hover:text-white border border-blue-200 dark:border-slate-700 hover:border-blue-500 text-xs font-medium transition-all shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {isSwitching ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3 h-3" />
                        )}
                        <span>Activate</span>
                      </button>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                    {ws.description || 'No description provided for this offline workspace.'}
                  </p>

                  {/* Scoped Statistics Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center space-x-2.5">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">Documents</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{ws.document_count} Files</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center space-x-2.5">
                      <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">Vector Chunks</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{ws.chunk_count} Chunks</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center space-x-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">AI Notes</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{ws.note_count} Notes</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center space-x-2.5">
                      <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">Flashcard Decks</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-200">{ws.flashcard_deck_count} Decks</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80">
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: #{ws.id}
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => openEditModal(ws)}
                      className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-cyan-300 border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                      title="Rename / Edit Workspace"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {workspaces.length > 1 && (
                      <button
                        onClick={() => setDeletingWs(ws)}
                        className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                        title="Delete Workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE WORKSPACE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-3xl shadow-2xl p-6 space-y-4 animate-pop-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FolderKanban className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Offline Workspace</h2>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Machine Learning & RAG Studies"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="What knowledge or topics are stored here..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Workspace</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT WORKSPACE MODAL */}
      {editingWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-3xl shadow-2xl p-6 space-y-4 animate-pop-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Edit Workspace</h2>
              </div>
              <button
                onClick={() => setEditingWs(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-slate-900 dark:text-slate-200 text-sm focus:outline-hidden focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWs(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE WORKSPACE MODAL */}
      {deletingWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 animate-pop-in">
            <div className="flex items-center space-x-2.5 text-rose-600 dark:text-rose-400 border-b border-slate-100 dark:border-slate-800 pb-3">
              <AlertCircle className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Workspace</h2>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">"{deletingWs.name}"</strong>?
            </p>

            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 space-y-1">
              <p className="font-semibold">⚠️ Cascading Cleanup Warning:</p>
              <p>
                Deleting this workspace will remove {deletingWs.document_count} documents, {deletingWs.chunk_count} vector chunks, {deletingWs.note_count} notes, and {deletingWs.flashcard_deck_count} decks.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingWs(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspacesPage;
