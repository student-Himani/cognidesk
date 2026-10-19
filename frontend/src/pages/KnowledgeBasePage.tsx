import React, { useState, useEffect } from 'react';
import { Database, Layers, Sparkles, Sliders } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { fetchKnowledgeBaseStats, KnowledgeBaseStats } from '../services/knowledgeService';

export const KnowledgeBasePage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [chunkSize, setChunkSize] = useState<number>(1000);

  useEffect(() => {
    loadStats();

    const handleWorkspaceSwitch = () => loadStats();
    window.addEventListener('workspace-switched', handleWorkspaceSwitch);
    return () => {
      window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
    };
  }, [activeWorkspace?.id]);

  const loadStats = async () => {
    try {
      const data = await fetchKnowledgeBaseStats(activeWorkspace?.id);
      if (data) {
        setStats(data);
        if (data.chunk_size) {
          setChunkSize(data.chunk_size);
        }
      }
    } catch (err) {
      console.error('Failed to load knowledge base stats:', err);
    }
  };

  const collections = stats?.collections && stats.collections.length > 0
    ? stats.collections
    : [
        {
          name: `${activeWorkspace?.name || 'Workspace'} Vector Store`,
          count: `${stats?.total_chunks || 0} chunks`,
          docs: stats?.total_documents || 0,
          tags: ['ChromaDB', 'Cosine', 'Ready'],
        },
      ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Info */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <span>Knowledge Base</span>
          {activeWorkspace?.name && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 shadow-2xs">
              {activeWorkspace.name}
            </span>
          )}
        </h1>
        <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
          Automatic semantic vector indexing & ChromaDB storage scoped to your active workspace.
        </p>
      </div>

      {/* Index Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white/95 dark:bg-[#131622]/95 border border-slate-200/90 dark:border-slate-800/90 backdrop-blur-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Indexed Chunks</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border border-blue-200/70 dark:border-blue-800/40">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {(stats?.total_chunks ?? 0).toLocaleString()}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ChromaDB {stats?.chroma_collection_name || 'cognidesk_documents'} ({stats?.collection_status || 'Active'})</span>
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white/95 dark:bg-[#131622]/95 border border-slate-200/90 dark:border-slate-800/90 backdrop-blur-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Embedding Model</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/70 dark:border-indigo-800/40">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {stats?.embedding_model || 'all-MiniLM-L6-v2'}
          </div>
          <p className="text-xs text-blue-600 dark:text-cyan-400 font-medium">
            {stats?.embedding_dimension || 384} Dimensions ({stats?.embedding_provider || 'Local PyTorch'})
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white/95 dark:bg-[#131622]/95 border border-slate-200/90 dark:border-slate-800/90 backdrop-blur-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Chunk Size Parameter</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Sliders className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{chunkSize} tokens</span>
            <input
              type="range"
              min="256"
              max="2048"
              step="128"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="w-28 accent-blue-600 cursor-pointer"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Overlap: {stats?.chunk_overlap || 150} tokens • Metric: {stats?.distance_metric || 'cosine'}
          </p>
        </div>
      </div>

      {/* Collections Grid */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Knowledge Collections
          </h2>
          <span className="text-xs text-blue-700 dark:text-blue-300 font-mono bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/40 px-2.5 py-0.5 rounded-full">
            {stats?.total_documents ?? 0} Source Documents
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {collections.map((col, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white/95 dark:bg-[#131622]/95 border border-slate-200/90 dark:border-slate-800/90 hover:border-blue-300 dark:hover:border-cyan-700/60 backdrop-blur-xl transition-all space-y-3.5 group shadow-xs hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border border-blue-200/70 dark:border-blue-800/40 shadow-2xs">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 rounded-full border border-blue-200/70 dark:border-blue-800/40">
                  {col.count}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors truncate">
                  {col.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{col.docs} Indexed Documents</p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {col.tags.map((tag, tIdx) => (
                  <span
                    key={tIdx}
                    className="text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-2 py-0.5 rounded-md"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBasePage;
