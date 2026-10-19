import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Download,
  Sparkles,
  Trash2,
  Edit3,
  Save,
  X,
  FileText,
  Search,
  Loader2,
  RefreshCw,
  Check,
  ArrowLeft,
} from 'lucide-react';
import KnowledgeLoadingOrb from '../components/3d/KnowledgeLoadingOrb';
import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  generateAINote,
  NoteItem,
} from '../services/notesService';
import { fetchDocuments, DocumentItem } from '../services/documentService';
import { useWorkspace } from '../context/WorkspaceContext';

export const NotesPage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeNote, setActiveNote] = useState<NoteItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

  // Modals & States
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualTitle, setManualTitle] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<string>('Manual Note');
  const [manualContent, setManualContent] = useState<string>('');

  // Editing state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeWorkspace?.id]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [notesData, docsData] = await Promise.all([
        getNotes(),
        fetchDocuments(),
      ]);
      setNotes(notesData);
      setDocuments(docsData);
      if (notesData.length > 0 && !activeNote) {
        setActiveNote(notesData[0]);
      }
    } catch (err) {
      showToast('Failed to load notes data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNote = (note: NoteItem) => {
    setActiveNote(note);
    setMobileView('editor');
    setIsEditing(false);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  useEffect(() => {
    if (activeNote) {
      setEditTitle(activeNote.title);
      setEditContent(activeNote.content);
    }
  }, [activeNote]);

  const handleSaveEdit = async () => {
    if (!activeNote) return;
    setIsSaving(true);
    try {
      const updated = await updateNote(activeNote.id, {
        title: editTitle,
        content: editContent,
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setActiveNote(updated);
      setIsEditing(false);
      showToast('Note updated successfully!');
    } catch (err) {
      showToast('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await deleteNote(id);
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      setActiveNote(remaining.length > 0 ? remaining[0] : null);
      showToast('Note deleted.');
    } catch (err) {
      showToast('Failed to delete note.');
    }
  };

  const handleCreateManualNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) return;

    try {
      const newNote = await createNote({
        title: manualTitle,
        category: manualCategory || 'General',
        content: manualContent,
      });
      setNotes([newNote, ...notes]);
      setActiveNote(newNote);
      setIsManualModalOpen(false);
      setManualTitle('');
      setManualContent('');
      showToast('Note created successfully!');
    } catch (err) {
      showToast('Failed to create note.');
    }
  };

  const handleGenerateAiNote = async () => {
    if (!selectedDocId) return;
    setIsGeneratingAi(true);
    try {
      const generated = await generateAINote(Number(selectedDocId));
      setNotes([generated, ...notes]);
      setActiveNote(generated);
      setIsAiModalOpen(false);
      setSelectedDocId('');
      showToast('AI synthesized notes successfully!');
    } catch (err) {
      showToast('AI Note generation failed. Ensure Ollama is running.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported markdown file.');
  };

  const filteredNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full min-h-0 flex-1 flex flex-col space-y-4 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-8 z-50 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-bounce">
          <Check className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/85 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:px-6 sm:py-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-800/40 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">AI Notes & Library</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1 sm:line-clamp-none">Generate executive summaries & key concepts from documents using local AI.</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-xs shadow-lg shadow-blue-600/25 transition-all border border-blue-400/20 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 animate-pulse shrink-0" />
            <span className="truncate">Generate AI Notes</span>
          </button>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 sm:gap-6 overflow-hidden">
        {/* Sidebar Notes List */}
        <div className={`w-full md:w-80 bg-white/85 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 flex-col space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl overflow-hidden ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>
          {/* Search Bar — High-Contrast Slate Glass */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Notes List Count */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Notes ({filteredNotes.length})
            </span>
            <button
              onClick={loadData}
              title="Refresh notes list"
              className="text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400 p-1 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Notes Items List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
                <KnowledgeLoadingOrb size={60} text="Loading notes..." />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-10 text-slate-500 space-y-3 px-4">
                <FileText className="w-10 h-10 mx-auto text-slate-400 opacity-60" />
                <p className="text-xs">No notes found matching your search.</p>
              </div>
            ) : (
              filteredNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNote(n)}
                  className={`w-full p-3.5 rounded-2xl border text-left transition-all space-y-1.5 cursor-pointer ${
                    activeNote?.id === n.id
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-500/40 text-blue-950 dark:text-slate-100 shadow-xs'
                      : 'bg-white dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-blue-50/50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        n.category === 'AI Generated'
                          ? 'text-blue-700 dark:text-cyan-300 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-500/30'
                          : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {n.category}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-xs line-clamp-1 text-slate-800 dark:text-slate-200">{n.title}</h3>
                  {n.document_name && (
                    <p className="text-[10px] text-slate-400 line-clamp-1">📄 {n.document_name}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Note Editor & Viewer */}
        <div className={`flex-1 bg-white/85 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-6 flex-col space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          {/* Mobile Back button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileView('list')}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Notes List</span>
            </button>
          </div>

          {activeNote ? (
            <>
              {/* Header Info & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="space-y-1 flex-1 min-w-0 pr-0 sm:pr-4">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3 py-1.5 text-base font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  ) : (
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{activeNote.title}</h2>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="text-blue-700 dark:text-cyan-400 font-semibold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">
                      {activeNote.category}
                    </span>
                    {activeNote.document_name && (
                      <span className="text-slate-500 dark:text-slate-400 truncate max-w-[160px] sm:max-w-xs">Source: {activeNote.document_name}</span>
                    )}
                    <span>{new Date(activeNote.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditTitle(activeNote.title);
                          setEditContent(activeNote.content);
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-cyan-300 text-xs font-semibold border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-slate-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={handleExportMarkdown}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-cyan-300 text-xs font-semibold border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                        <span>Export .MD</span>
                      </button>

                      <button
                        onClick={() => handleDeleteNote(activeNote.id)}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-rose-600 dark:text-red-400 border border-rose-200 dark:border-red-900/40 transition-colors cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Note Content Area — High-Contrast Slate Glass Surface */}
              <div className="flex-1 overflow-y-auto rounded-2xl bg-[#F8FAFC] dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 p-6 font-mono text-sm text-slate-800 dark:text-slate-200 leading-relaxed shadow-inner">
                {isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full bg-transparent text-slate-800 dark:text-slate-200 font-mono text-sm focus:outline-none resize-none leading-relaxed"
                    placeholder="Enter Markdown content..."
                  />
                ) : (
                  <div className="whitespace-pre-wrap">{activeNote.content}</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8 text-slate-500 dark:text-slate-400">
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-cyan-400">
                <Sparkles className="w-10 h-10" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">No Note Selected</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select a note from the library or click <strong>Generate AI Notes</strong> to extract executive summaries from your uploaded documents.
                </p>
              </div>
              <button
                onClick={() => setIsAiModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                Generate AI Notes from Document
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Generate AI Notes */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-pop-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Generate AI Notes</h3>
              </div>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Select a document from your library. CogniDesk will retrieve the document context and use local Ollama LLM to synthesize an Executive Summary, Key Points, and Terms.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Select Target Document
                </label>
                {documents.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/40">
                    No documents uploaded yet. Please upload a PDF/DOCX file in the Documents section first.
                  </p>
                ) : (
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choose a document --</option>
                    {documents
                      .filter((doc) => doc.status !== 'Failed')
                      .map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} ({doc.type.toUpperCase()}, {doc.word_count || 0} words)
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAiNote}
                disabled={!selectedDocId || isGeneratingAi}
                className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Notes via Ollama...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Notes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Manual Note */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateManualNote}
            className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-pop-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create New Note</h3>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Note Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Architecture Highlights"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Manual Note / Architecture / Research"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Content (Markdown)</label>
                <textarea
                  required
                  rows={6}
                  placeholder="Write your note in Markdown..."
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default NotesPage;
