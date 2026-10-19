import React, { useEffect, useState } from 'react';
import { Search, X, MessageSquare, FileText, Database, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const quickActions = [
    { title: 'New AI Chat', path: '/chat', icon: MessageSquare, badge: 'AI Action' },
    { title: 'Upload Documents', path: '/documents', icon: FileText, badge: 'Library' },
    { title: 'Search Knowledge Chunks', path: '/knowledge-base', icon: Database, badge: 'Retrieval' },
    { title: 'Study Flashcards', path: '/flashcards', icon: Sparkles, badge: 'Learn' },
  ];

  const recentSearches = [
    'Quarterly Financial Analysis PDF',
    'Local LLM Ollama model parameters',
    'Python FastAPI async router pattern',
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white dark:bg-[#111827] border border-blue-200/80 dark:border-blue-900/50 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar — Crisp Cool Slate Glass */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-[#131c2e]">
          <Search className="w-5 h-5 text-blue-600 dark:text-cyan-400 mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, notes, chat threads or actions..."
            className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-sm md:text-base font-normal"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Quick Actions */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
              Quick Shortcuts
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleNavigate(action.path)}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 dark:bg-slate-800/60 dark:hover:bg-blue-950/40 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-800 text-left transition-colors group cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <action.icon className="w-4 h-4 text-blue-600 dark:text-cyan-400 group-hover:scale-105 transition-transform" />
                    <span className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-cyan-300">
                      {action.title}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent Searches */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
              Recent Queries
            </span>
            <div className="space-y-1 mt-2">
              {recentSearches.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuery(item);
                    navigate(`/search?q=${encodeURIComponent(item)}`);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs md:text-sm transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-2.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{item}</span>
                  </div>
                  <span className="text-xs text-blue-600 dark:text-cyan-400 font-medium">Search</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[10px]">
              ESC
            </kbd>
            <span>to close</span>
          </div>
          <span className="font-medium text-slate-600 dark:text-slate-400">CogniDesk Offline Search</span>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
