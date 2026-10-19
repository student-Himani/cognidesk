import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  ArrowUpRight,
  Filter,
  History,
  Trash2,
  Sparkles,
  Layers,
  Clock,
  Loader2,
  X,
  Info,
  CheckCircle2
} from 'lucide-react';
import KnowledgeLoadingOrb from '../components/3d/KnowledgeLoadingOrb';
import {
  executeSearch,
  fetchSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryItem,
  SearchResultItem,
  SearchHistoryItem
} from '../services/searchService';

export const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'semantic' | 'fulltext'>('semantic');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [topK, setTopK] = useState<number>(5);

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [totalFound, setTotalFound] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // History state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<SearchResultItem | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await fetchSearchHistory(20);
    setHistoryItems(data);
  };

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const searchQuery = customQuery !== undefined ? customQuery : query;
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setSelectedCitation(null);

    try {
      const data = await executeSearch({
        query: searchQuery,
        top_k: topK,
        search_mode: searchMode,
        filetype: fileTypeFilter !== 'all' ? fileTypeFilter : undefined,
      });

      setResults(data.results);
      setExecutionTime(data.execution_time_ms);
      setTotalFound(data.results_count);
      setHasSearched(true);
      await loadHistory();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Failed to execute search query.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear your search history?')) {
      await clearSearchHistory();
      setHistoryItems([]);
    }
  };

  const handleDeleteHistorySingle = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await deleteSearchHistoryItem(id);
    setHistoryItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectHistoryItem = (item: SearchHistoryItem) => {
    setQuery(item.query_text);
    setSearchMode(item.search_mode as 'semantic' | 'fulltext');
    if (item.filters && item.filters.filetype) {
      setFileTypeFilter(item.filters.filetype);
    } else {
      setFileTypeFilter('all');
    }
    handleSearch(undefined, item.query_text);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 sm:w-6 h-5 sm:h-6 text-blue-600 dark:text-cyan-400" />
            <span>Semantic & Vector Search</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Query your indexed offline documents using vector embeddings or exact keyword search.
          </p>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-colors shadow-xs cursor-pointer shrink-0 ${
            showHistory
              ? 'bg-blue-100 dark:bg-blue-600/20 border-blue-300 dark:border-blue-500/50 text-blue-800 dark:text-cyan-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-300'
          }`}
        >
          <History className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          <span>{showHistory ? 'Hide History' : 'Search History'}</span>
        </button>
      </div>

      {/* Main Search Input & Bar — Crisp Slate Glass Surface */}
      <div className="bg-white/85 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-xl space-y-4">
        <form onSubmit={(e) => handleSearch(e)}>
          <div className="flex items-center space-x-2 sm:space-x-3 bg-slate-100/90 dark:bg-[#131c2e] border border-slate-300/90 dark:border-blue-900/50 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-inner">
            <Search className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600 dark:text-cyan-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type any question, topic, or phrase..."
              className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-sm sm:text-base font-normal min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Searching...</span>
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Controls & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/60">
          {/* Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchMode('semantic')}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                searchMode === 'semantic'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm border-transparent'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${searchMode === 'semantic' ? 'text-white' : 'text-blue-600 dark:text-cyan-400'}`} />
              <span>Semantic</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchMode('fulltext')}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                searchMode === 'fulltext'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm border-transparent'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              <Search className={`w-3.5 h-3.5 ${searchMode === 'fulltext' ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`} />
              <span>Exact Full-Text</span>
            </button>
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span className="text-slate-600 dark:text-slate-400">Type:</span>
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none text-xs"
              >
                <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">All Formats</option>
                <option value="pdf" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">PDF</option>
                <option value="docx" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">DOCX</option>
                <option value="txt" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">TXT</option>
                <option value="pptx" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">PPTX</option>
                <option value="xlsx" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">XLSX</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span className="text-slate-600 dark:text-slate-400">Results:</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none text-xs"
              >
                <option value={3} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Top 3</option>
                <option value={5} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Top 5</option>
                <option value={10} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Top 10</option>
                <option value={20} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Top 20</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Results + History Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Results Area */}
        <div className={`${showHistory ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-4`}>
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-rose-400 flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Results Metadata Line */}
          {hasSearched && (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>
                Found <strong className="text-blue-600 dark:text-cyan-400 font-semibold">{totalFound}</strong> result
                {totalFound === 1 ? '' : 's'} matching "{query}"
              </span>
              {executionTime !== null && (
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  Latency: {executionTime}ms
                </span>
              )}
            </div>
          )}

          {/* Results List / 3D Loading state */}
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center bg-white/85 dark:bg-slate-900/40 border border-blue-200/80 dark:border-blue-900/40 rounded-3xl">
              <KnowledgeLoadingOrb size={70} text="Searching semantic vector space..." />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-4">
              {results.map((res) => (
                <div
                  key={res.id}
                  className="p-6 rounded-3xl bg-white/85 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 hover:border-blue-400 dark:hover:border-cyan-500/50 transition-all space-y-3 group shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2.5">
                      <FileText className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-colors">
                        {res.title}
                      </h3>
                      <span className="text-xs font-semibold text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
                        {res.docType}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                        {res.score}
                      </span>
                      <button
                        onClick={() => setSelectedCitation(selectedCitation?.id === res.id ? null : res)}
                        className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-cyan-300 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-transparent transition-colors text-xs flex items-center gap-1 cursor-pointer"
                        title="View citation metadata"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        <span className="hidden sm:inline">Citation</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-slate-800 dark:text-slate-300 leading-relaxed bg-[#F8FAFC] dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/60 font-sans">
                    "{res.snippet}"
                  </p>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-blue-600 dark:text-cyan-400 font-semibold">{res.chunkIndex}</span>
                      <span>•</span>
                      <span>Word count: {res.citation?.word_count || 0}</span>
                    </div>

                    {res.distance !== undefined && (
                      <span className="text-slate-500">Vector Distance: {res.distance}</span>
                    )}
                  </div>

                  {/* Expanded Citation Metadata Drawer */}
                  {selectedCitation?.id === res.id && (
                    <div className="mt-3 p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-2 text-slate-700 dark:text-slate-300">
                      <div className="font-semibold text-blue-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                        Citation Metadata & Span
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div>Document ID: <span className="text-slate-900 dark:text-slate-200 font-bold">{res.citation.document_id}</span></div>
                        <div>Start Char: <span className="text-slate-900 dark:text-slate-200 font-bold">{res.citation.start_char}</span></div>
                        <div>End Char: <span className="text-slate-900 dark:text-slate-200 font-bold">{res.citation.end_char}</span></div>
                        <div>Filetype: <span className="text-slate-900 dark:text-slate-200 font-bold">{res.citation.filetype}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="p-12 text-center rounded-3xl bg-white/85 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <Search className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-300">No matching vectors found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try adjusting your search terms, removing file type filters, or verifying that documents have been processed and indexed into the vector database.
              </p>
            </div>
          ) : (
            <div className="p-12 text-center rounded-3xl bg-white/85 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/60 space-y-3 shadow-xs">
              <Sparkles className="w-10 h-10 text-blue-600/60 dark:text-cyan-400/60 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-300">Ready to search</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Enter any natural language query above to retrieve semantically relevant document chunks using local SentenceTransformer vector embeddings.
              </p>
            </div>
          )}
        </div>

        {/* History Sidebar */}
        {showHistory && (
          <div className="lg:col-span-1 bg-white/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-[0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-xl space-y-4 self-start">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-200 text-sm flex items-center gap-1.5">
                <History className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                Recent History
              </h3>

              {historyItems.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {historyItems.length > 0 ? (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistoryItem(item)}
                    className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400 cursor-pointer transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-cyan-300 line-clamp-1">
                        {item.query_text}
                      </span>
                      <button
                        onClick={(e) => handleDeleteHistorySingle(e, item.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="capitalize">{item.search_mode}</span>
                      <span>{item.results_count} results ({item.execution_time_ms}ms)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">No search history recorded yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
