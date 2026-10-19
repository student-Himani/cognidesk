import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  FileText,
  Clock,
  Search,
  ExternalLink,
  Trash2,
  Database,
  RefreshCw,
} from 'lucide-react';
import KnowledgeLoadingOrb from '../components/3d/KnowledgeLoadingOrb';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../hooks/useToast';
import { fetchChatThreads, deleteChatThread, ChatThreadItem } from '../services/chatService';
import { fetchDocuments, DocumentItem } from '../services/documentService';

interface TimelineItem {
  id: string;
  type: 'chat' | 'document';
  title: string;
  time: string;
  mode?: 'normal' | 'document';
  messageCount?: number;
  preview?: string;
  documentDetails?: {
    fileSize?: string;
    pageCount?: number;
    status?: string;
  };
  rawThread?: ChatThreadItem;
}

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { showSuccess, showError } = useToast();

  const [filter, setFilter] = useState<'all' | 'chat' | 'document'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  useEffect(() => {
    loadAllHistory();

    const handleChatUpdate = () => loadAllHistory();
    const handleWorkspaceSwitch = () => loadAllHistory();

    window.addEventListener('chat-thread-updated', handleChatUpdate);
    window.addEventListener('workspace-switched', handleWorkspaceSwitch);

    return () => {
      window.removeEventListener('chat-thread-updated', handleChatUpdate);
      window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
    };
  }, [activeWorkspace?.id]);

  const loadAllHistory = async () => {
    setIsLoading(true);
    try {
      const [fetchedThreads, fetchedDocs] = await Promise.all([
        fetchChatThreads(),
        fetchDocuments().catch(() => []),
      ]);
      setThreads(fetchedThreads || []);
      setDocuments(fetchedDocs || []);
    } catch (err) {
      console.error('Failed to load history items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChat = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteChatThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      window.dispatchEvent(new CustomEvent('chat-thread-updated'));
      showSuccess('Deleted', 'Conversation removed from offline SQLite storage.');
    } catch (err: any) {
      showError('Failed to delete conversation.');
    }
  };

  const handleOpenChat = (threadId: string) => {
    navigate(`/chat?thread=${threadId}`);
  };

  // Build combined timeline items
  const timelineItems: TimelineItem[] = [
    ...threads.map((t): TimelineItem => {
      const lastMsg = t.messages && t.messages.length > 0 ? t.messages[t.messages.length - 1] : null;
      return {
        id: t.id,
        type: 'chat',
        title: t.title || 'Untitled Conversation',
        time: t.time || 'Recently',
        mode: t.mode || 'document',
        messageCount: t.messages?.length || 0,
        preview: lastMsg?.text ? lastMsg.text.slice(0, 100) + (lastMsg.text.length > 100 ? '...' : '') : undefined,
        rawThread: t,
      };
    }),
    ...documents.map((d): TimelineItem => ({
      id: String(d.id),
      type: 'document',
      title: d.name,
      time: d.date || 'Indexed',
      documentDetails: {
        fileSize: d.size,
        pageCount: d.page_count,
        status: d.status,
      },
    })),
  ];

  const filteredItems = timelineItems.filter((item) => {
    if (filter !== 'all' && item.type !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = item.title.toLowerCase().includes(q);
      const matchesPreview = item.preview?.toLowerCase().includes(q);
      return matchesTitle || matchesPreview;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <span>Activity History</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-cyan-300 font-semibold flex items-center gap-1.5">
              <Database className="w-3 h-3 text-blue-600 dark:text-cyan-400" />
              SQLite Persistent
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Chronological audit of conversations, document indexing, and AI activity in{' '}
            <span className="text-blue-700 dark:text-cyan-300 font-semibold">{activeWorkspace?.name || 'Current Workspace'}</span>.
          </p>
        </div>

        <button
          onClick={loadAllHistory}
          disabled={isLoading}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white transition-colors cursor-pointer self-start sm:self-auto text-xs shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600 dark:text-cyan-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Control Bar: Search & Filter Tabs */}
      <div className="bg-white/85 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-lg backdrop-blur-sm">
        {/* Search Input — High-Contrast Frosted Slate Surface */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search activity by title or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-1 rounded-2xl w-full sm:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200'
            }`}
          >
            All Activity ({timelineItems.length})
          </button>
          <button
            onClick={() => setFilter('chat')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === 'chat'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200'
            }`}
          >
            Chats ({threads.length})
          </button>
          <button
            onClick={() => setFilter('document')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === 'document'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200'
            }`}
          >
            Documents ({documents.length})
          </button>
        </div>
      </div>

      {/* Timeline List */}
      <div className="bg-white/85 dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl relative">
        {isLoading && filteredItems.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <KnowledgeLoadingOrb size={65} text="Loading activity history..." />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-cyan-400 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-300">No activity recorded yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? 'No activity matches your search query. Try typing another term.'
                : 'Start a conversation in AI Chat or upload documents to see your workspace history appear here.'}
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-blue-200 dark:border-slate-800 ml-4 sm:ml-6 space-y-6 pl-6 sm:pl-8">
            {filteredItems.map((item) => (
              <div key={`${item.type}-${item.id}`} className="relative group">
                {/* Node icon */}
                <div
                  className={`absolute -left-[35px] sm:-left-[43px] top-1 w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                    item.type === 'chat'
                      ? 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-500/50 text-blue-700 dark:text-cyan-400 group-hover:scale-105 shadow-md'
                      : 'bg-cyan-100 dark:bg-cyan-950 border-cyan-300 dark:border-cyan-500/50 text-cyan-700 dark:text-cyan-400 group-hover:scale-105 shadow-md'
                  }`}
                >
                  {item.type === 'chat' ? (
                    <MessageSquare className="w-4 h-4" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>

                {/* Timeline Card */}
                <div className="bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400 p-4 rounded-2xl transition-all space-y-2.5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="font-bold text-slate-900 dark:text-slate-200 text-sm">{item.title}</span>

                      {item.type === 'chat' && (
                        <>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              item.mode === 'document'
                                ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-cyan-300 dark:border-blue-500/40'
                                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {item.mode === 'document' ? '📚 Document Chat' : '🤖 Normal Chat'}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                            {item.messageCount} messages
                          </span>
                        </>
                      )}

                      {item.type === 'document' && item.documentDetails && (
                        <>
                          {item.documentDetails.pageCount ? (
                            <span className="text-[10px] text-cyan-700 bg-cyan-50 border border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950 dark:border-cyan-500/40 px-2 py-0.5 rounded">
                              {item.documentDetails.pageCount} pages
                            </span>
                          ) : null}
                          {item.documentDetails.fileSize && (
                            <span className="text-[10px] text-slate-500 bg-white border border-slate-200 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-800 px-2 py-0.5 rounded">
                              {item.documentDetails.fileSize}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-xs text-slate-500 flex items-center space-x-1 mr-2">
                        <Clock className="w-3 h-3" />
                        <span>{item.time}</span>
                      </span>

                      {item.type === 'chat' ? (
                        <>
                          <button
                            onClick={() => handleOpenChat(item.id)}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 dark:text-cyan-300 dark:border-blue-500/30 text-xs font-semibold transition-colors cursor-pointer"
                            title="Open in Chat"
                          >
                            <span>Resume</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteChat(item.id, e)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 dark:bg-slate-900 dark:hover:bg-rose-950/40 dark:text-slate-400 dark:hover:text-rose-400 dark:border-slate-800 transition-colors cursor-pointer"
                            title="Delete thread"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => navigate('/documents')}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-100 hover:bg-cyan-200 text-cyan-700 border border-cyan-300 dark:bg-cyan-600/20 dark:hover:bg-cyan-600/30 dark:text-cyan-300 dark:border-cyan-500/30 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <span>View Doc</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {item.preview && (
                    <p className="text-xs text-slate-700 dark:text-slate-400 line-clamp-2 bg-white dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 font-mono shadow-inner">
                      "{item.preview}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
