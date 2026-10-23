import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  HardDrive,
  Palette,
  Shield,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Server,
  Wifi,
  Database,
  Layers,
  Sparkles,
  Sliders,
  Terminal,
  Play,
  Zap,
  Download,
  Trash2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useDispatch } from 'react-redux';
import { addToast } from '../store/slices/toastSlice';
import {
  getSettings,
  updateSettings,
  testOllamaConnection,
  testCloudConnection,
  getSystemStatus,
  AppSettings,
  SystemStatus,
  OllamaTestResult,
  CloudTestResult,
} from '../services/settingsService';
import { executeMcpTool } from '../services/mcpService';
import { KnowledgeLoadingOrb } from '../components/3d/KnowledgeLoadingOrb';
import {
  browserAiEngine,
  BrowserAiCapabilities,
  AVAILABLE_BROWSER_MODELS,
  ModelDownloadProgress,
} from '../services/browserAiEngine';
import {
  promptPwaInstall,
  isPwaInstalled,
  onInstallPromptChange,
} from '../serviceWorkerRegistration';

export const SettingsPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const dispatch = useDispatch();

  const [activeTab, setActiveTab] = useState<'model' | 'browser-ai' | 'diagnostics' | 'storage' | 'mcp' | 'theme'>('model');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [refreshingStatus, setRefreshingStatus] = useState<boolean>(false);
  const [testingOllama, setTestingOllama] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<OllamaTestResult | null>(null);
  const [testingCloud, setTestingCloud] = useState<boolean>(false);
  const [cloudTestResult, setCloudTestResult] = useState<CloudTestResult | null>(null);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // In-Browser AI & PWA state (Module 32)
  const [capabilities, setCapabilities] = useState<BrowserAiCapabilities | null>(null);
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, ModelDownloadProgress>>({});
  const [cachedModels, setCachedModels] = useState<Record<string, boolean>>({});
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(false);
  const [isInstalledPwa, setIsInstalledPwa] = useState<boolean>(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  // Form State
  const [aiProvider, setAiProvider] = useState<'ollama' | 'cloud'>('ollama');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState<string>('qwen2.5:3b');
  const [cloudProvider, setCloudProvider] = useState<string>('openai');
  const [cloudModel, setCloudModel] = useState<string>('gpt-4o-mini');
  const [cloudApiKey, setCloudApiKey] = useState<string>('');
  const [cloudBaseUrl, setCloudBaseUrl] = useState<string>('https://api.openai.com/v1');
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(true);
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [chunkOverlap, setChunkOverlap] = useState<number>(50);

  // MCP Interactive Testing State
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>('search_documents');
  const [mcpSearchQuery, setMcpSearchQuery] = useState<string>('document');
  const [mcpDocId, setMcpDocId] = useState<number>(1);
  const [mcpTopK, setMcpTopK] = useState<number>(3);
  const [runningMcpTool, setRunningMcpTool] = useState<boolean>(false);
  const [mcpToolOutput, setMcpToolOutput] = useState<string | null>(null);

  // Load initial settings and diagnostics
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedSettings, fetchedStatus] = await Promise.all([
        getSettings(),
        getSystemStatus().catch(() => null),
      ]);

      setSettings(fetchedSettings);
      setStatus(fetchedStatus);

      // Populate form
      setAiProvider(fetchedSettings.ai_provider);
      setOllamaBaseUrl(fetchedSettings.ollama_base_url || 'http://127.0.0.1:11434');
      setOllamaModel(fetchedSettings.ollama_model || 'qwen2.5:3b');
      setCloudProvider(fetchedSettings.cloud_provider || 'openai');
      setCloudModel(fetchedSettings.cloud_model || 'gpt-4o-mini');
      setCloudApiKey(fetchedSettings.cloud_api_key || '');
      setCloudBaseUrl(fetchedSettings.cloud_base_url || 'https://api.openai.com/v1');
      setIsOfflineMode(fetchedSettings.is_offline_mode);
      setChunkSize(fetchedSettings.chunk_size || 500);
      setChunkOverlap(fetchedSettings.chunk_overlap || 50);

      // Pre-seed Ollama status test result if status is available
      if (fetchedStatus?.ollama) {
        setTestResult(fetchedStatus.ollama);
      }
    } catch (err: any) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Settings Load Error',
          message: err.message || 'Failed to retrieve application settings from backend.',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // In-Browser AI & PWA effect (Module 32)
  useEffect(() => {
    browserAiEngine.detectCapabilities().then(setCapabilities);
    setIsInstalledPwa(isPwaInstalled());
    const unsub = onInstallPromptChange(setCanInstallPwa);

    const checkCached = async () => {
      const cached: Record<string, boolean> = {};
      for (const m of AVAILABLE_BROWSER_MODELS) {
        cached[m.id] = await browserAiEngine.isModelCached(m.id);
      }
      setCachedModels(cached);
    };
    checkCached();

    return () => unsub();
  }, []);

  const handleDownloadModel = async (modelId: string) => {
    try {
      setDownloadProgresses((prev) => ({
        ...prev,
        [modelId]: {
          modelId,
          percent: 1,
          loadedMb: 0,
          totalMb: AVAILABLE_BROWSER_MODELS.find((m) => m.id === modelId)?.sizeMb || 0,
          speedMbps: 0,
          status: 'downloading',
          stageText: 'Initializing WebGPU engine & requesting weights...',
        },
      }));
      await browserAiEngine.downloadModel(modelId, (p) => {
        setDownloadProgresses((prev) => ({ ...prev, [modelId]: p }));
      });
      setCachedModels((prev) => ({ ...prev, [modelId]: true }));
      dispatch(
        addToast({
          type: 'success',
          title: 'Model Ready',
          message: `In-browser AI model ${modelId} is ready for offline inference.`,
        })
      );
    } catch (err: any) {
      setDownloadProgresses((prev) => ({
        ...prev,
        [modelId]: {
          modelId,
          percent: 0,
          loadedMb: 0,
          totalMb: 0,
          speedMbps: 0,
          status: 'error',
          errorMessage: err.message || 'Failed to download model.',
        },
      }));
      dispatch(
        addToast({
          type: 'error',
          title: 'Download Failed',
          message: err.message || 'Failed to download model.',
        })
      );
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await browserAiEngine.deleteModel(modelId);
      setCachedModels((prev) => ({ ...prev, [modelId]: false }));
      dispatch(
        addToast({
          type: 'info',
          title: 'Model Removed',
          message: `Cached model ${modelId} deleted from browser storage.`,
        })
      );
    } catch (err: any) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Delete Failed',
          message: err.message,
        })
      );
    }
  };

  const handleInstallPwa = async () => {
    const accepted = await promptPwaInstall();
    if (accepted) {
      setIsInstalledPwa(true);
      setCanInstallPwa(false);
      dispatch(
        addToast({
          type: 'success',
          title: 'PWA Installed',
          message: 'CogniDesk is now installed as a standalone app!',
        })
      );
    }
  };

  // Refresh System Status Diagnostics
  const handleRefreshStatus = async () => {
    try {
      setRefreshingStatus(true);
      const freshStatus = await getSystemStatus();
      setStatus(freshStatus);
      if (freshStatus.ollama) {
        setTestResult(freshStatus.ollama);
      }
      dispatch(
        addToast({
          type: 'info',
          title: 'Diagnostics Refreshed',
          message: 'All local subsystem health metrics updated.',
        })
      );
    } catch (err: any) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Diagnostics Error',
          message: err.message || 'Failed to refresh system status.',
        })
      );
    } finally {
      setRefreshingStatus(false);
    }
  };

  // Test Ollama Connection
  const handleTestOllama = async () => {
    try {
      setTestingOllama(true);
      const res = await testOllamaConnection(ollamaBaseUrl);
      setTestResult(res);
      if (res.connected) {
        dispatch(
          addToast({
            type: 'success',
            title: 'Ollama Connected',
            message: res.message,
          })
        );
      } else {
        dispatch(
          addToast({
            type: 'error',
            title: 'Ollama Unreachable',
            message: res.message,
          })
        );
      }
    } catch (err: any) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Connection Test Failed',
          message: err.message || 'Error communicating with Ollama.',
        })
      );
    } finally {
      setTestingOllama(false);
    }
  };

  // Test Cloud Connection
  const handleTestCloud = async () => {
    if (isOfflineMode) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Offline Mode Active',
          message: 'Cannot test Cloud AI while in Offline Mode. Switch to Online Mode first.',
        })
      );
      return;
    }
    try {
      setTestingCloud(true);
      const res = await testCloudConnection(cloudProvider, cloudApiKey, cloudModel, cloudBaseUrl);
      setCloudTestResult(res);
      if (res.connected) {
        dispatch(
          addToast({
            type: 'success',
            title: 'Cloud AI Connected',
            message: res.message,
          })
        );
      } else {
        dispatch(
          addToast({
            type: 'error',
            title: 'Cloud AI Unreachable',
            message: res.message,
          })
        );
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Error communicating with Cloud AI provider.';
      setCloudTestResult({
        connected: false,
        provider: cloudProvider,
        message: errMsg,
      });
      dispatch(
        addToast({
          type: 'error',
          title: 'Connection Test Failed',
          message: errMsg,
        })
      );
    } finally {
      setTestingCloud(false);
    }
  };

  // Run MCP Tool via Local Server
  const handleRunMcpTool = async () => {
    try {
      setRunningMcpTool(true);
      setMcpToolOutput(null);

      const args =
        selectedMcpTool === 'search_documents'
          ? { query: mcpSearchQuery.trim() || 'document', top_k: Number(mcpTopK) }
          : { document_id: Number(mcpDocId) };

      const res = await executeMcpTool(selectedMcpTool, args);
      const textContent = res.result?.content?.[0]?.text || JSON.stringify(res, null, 2);
      setMcpToolOutput(textContent);

      if (!res.result?.isError) {
        dispatch(
          addToast({
            type: 'success',
            title: 'MCP Tool Executed',
            message: `Tool '${selectedMcpTool}' responded successfully.`,
          })
        );
      } else {
        dispatch(
          addToast({
            type: 'error',
            title: 'MCP Tool Returned Error',
            message: textContent.slice(0, 100),
          })
        );
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message;
      setMcpToolOutput(`Execution Error: ${errMsg}`);
      dispatch(
        addToast({
          type: 'error',
          title: 'MCP Execution Failed',
          message: errMsg,
        })
      );
    } finally {
      setRunningMcpTool(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Enforce offline privacy logic
    if (isOfflineMode && aiProvider === 'cloud') {
      dispatch(
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: 'Cannot select Cloud AI while in Offline Mode. Switch to Online Mode first.',
        })
      );
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<AppSettings> = {
        ai_provider: aiProvider,
        ollama_base_url: ollamaBaseUrl.trim(),
        ollama_model: ollamaModel.trim(),
        cloud_provider: cloudProvider,
        cloud_model: cloudModel.trim(),
        cloud_api_key: cloudApiKey.trim() || null,
        cloud_base_url: cloudBaseUrl.trim(),
        is_offline_mode: isOfflineMode,
        chunk_size: Number(chunkSize),
        chunk_overlap: Number(chunkOverlap),
      };

      const updated = await updateSettings(payload);
      setSettings(updated);
      setCloudApiKey(updated.cloud_api_key || '');

      dispatch(
        addToast({
          type: 'success',
          title: 'Settings Saved',
          message: 'Configuration successfully persisted to SQLite database.',
        })
      );

      // Re-query status to reflect any changes
      getSystemStatus().then(setStatus).catch(() => {});
    } catch (err: any) {
      dispatch(
        addToast({
          type: 'error',
          title: 'Save Failed',
          message: err.response?.data?.detail || err.message || 'Failed to save settings.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <KnowledgeLoadingOrb size={100} text="Loading CogniDesk settings & diagnostics..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            Settings & System Status
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configure local AI models, offline privacy enforcement, and inspect hardware & subsystem telemetry.
            {settings?.updated_at && (
              <span className="block text-xs text-slate-500 mt-0.5">
                Last persisted: {new Date(settings.updated_at).toLocaleString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefreshStatus}
            disabled={refreshingStatus}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#131c2e] dark:hover:bg-[#1a263d] text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-300 dark:border-blue-900/50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingStatus ? 'animate-spin text-blue-600 dark:text-cyan-400' : ''}`} />
            <span>Refresh Diagnostics</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Privacy Mode Banner */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isOfflineMode
            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
            : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
        }`}
      >
        <div className="flex items-center gap-3">
          {isOfflineMode ? (
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Wifi className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-emerald-200">
              {isOfflineMode ? '100% Offline Privacy Mode' : 'Online Mode Enabled'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {isOfflineMode
                ? 'All document embeddings, OCR processing, and LLM inference are strictly confined to this computer.'
                : 'External Cloud AI requests can be optionally sent if configured with an API key.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const nextMode = !isOfflineMode;
            setIsOfflineMode(nextMode);
            if (nextMode) setAiProvider('ollama');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            isOfflineMode
              ? 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300'
          }`}
        >
          Toggle to {isOfflineMode ? 'Online Mode' : 'Offline Mode'}
        </button>
      </div>

      {/* Settings Navigation Tabs & Panel */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Navigation Sidebar / Horizontal strip on mobile */}
        <div className="w-full md:w-64 flex md:flex-col overflow-x-auto gap-2 pb-2 md:pb-0 scrollbar-none shrink-0">
          {[
            { id: 'model', label: 'AI Provider & Models', icon: Cpu },
            { id: 'browser-ai', label: 'In-Browser AI & PWA', icon: Zap },
            { id: 'diagnostics', label: 'System Diagnostics', icon: Server },
            { id: 'storage', label: 'Storage & Chunking', icon: HardDrive },
            { id: 'mcp', label: 'Model Context Protocol', icon: Layers },
            { id: 'theme', label: 'Appearance & Theme', icon: Palette },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl border text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 md:shrink md:w-full cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 border-blue-200 shadow-md shadow-blue-950/10 dark:bg-blue-600/20 dark:text-cyan-300 dark:border-blue-500/40'
                  : 'bg-white/70 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-transparent hover:bg-white dark:hover:bg-slate-900/80 hover:text-blue-600 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Container */}
        <div className="flex-1 min-w-0 bg-white/90 dark:bg-[#101726]/90 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-[0_8px_32px_rgba(37,99,235,0.06)] dark:shadow-xl space-y-6">
          {/* TAB 1: AI Provider & Models */}
          {activeTab === 'model' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pb-1">AI Provider & Inference Configuration</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select your primary text generation engine and configure local Ollama or cloud settings.
                </p>
              </div>

              {/* Hosted Deployment & Local Notice */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Hosted Web Deployment Notice</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  When visited on a public web domain, server-side hosted AI (configured via backend environment variables like Groq, OpenAI, Anthropic, or OpenRouter) provides instant, zero-install inference. To connect this web app to your own local Ollama instance, launch Ollama with <code className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-900 font-mono text-[11px]">OLLAMA_ORIGINS=* ollama serve</code>.
                </p>
              </div>

              {/* Provider Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setAiProvider('ollama')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    aiProvider === 'ollama'
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-500/50 ring-2 ring-blue-500/30 shadow-sm'
                      : 'bg-slate-50 dark:bg-[#131c2e] border-slate-300 dark:border-blue-900/50 hover:border-blue-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900 dark:text-slate-200">
                      <Cpu className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                      <span>Local Ollama Daemon</span>
                    </div>
                    {aiProvider === 'ollama' && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Connects to Ollama on your device. Requires local Ollama running with cross-origin access enabled.
                  </p>
                </div>

                <div
                  onClick={() => {
                    if (isOfflineMode) {
                      dispatch(
                        addToast({
                          type: 'info',
                          title: 'Offline Mode Active',
                          message: 'Switch to Online Mode above to enable Cloud AI providers.',
                        })
                      );
                      return;
                    }
                    setAiProvider('cloud');
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isOfflineMode
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800/60'
                      : aiProvider === 'cloud'
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-500/50 ring-2 ring-blue-500/30 shadow-sm'
                      : 'bg-slate-50 dark:bg-[#131c2e] border-slate-300 dark:border-blue-900/50 hover:border-blue-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900 dark:text-slate-200">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Cloud AI Provider</span>
                    </div>
                    {aiProvider === 'cloud' && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {isOfflineMode
                      ? 'Disabled in Offline Mode. Switch to Online Mode to use OpenAI, Anthropic, or Groq.'
                      : 'Access frontier models via OpenAI-compatible endpoints or secure server providers.'}
                  </p>
                </div>
              </div>

              {/* Local Ollama Section */}
              <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800/80 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/60 pb-3">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    Local Ollama Daemon Configuration
                  </span>
                  {testResult && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        testResult.connected
                          ? 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-100 dark:bg-rose-950/50 border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {testResult.connected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {testResult.connected ? 'Online' : 'Offline'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                      Ollama Base URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ollamaBaseUrl}
                        onChange={(e) => setOllamaBaseUrl(e.target.value)}
                        placeholder="http://127.0.0.1:11434"
                        className="flex-1 bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={handleTestOllama}
                        disabled={testingOllama}
                        className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 dark:text-cyan-300 border border-blue-300 dark:border-blue-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingOllama ? 'animate-spin' : ''}`} />
                        <span>{testingOllama ? 'Testing...' : 'Test'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                      Active LLM Model
                    </label>
                    {testResult?.models && testResult.models.length > 0 ? (
                      <select
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                      >
                        {testResult.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="qwen2.5:3b"
                        className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                    )}
                  </div>
                </div>

                {testResult?.message && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                    {testResult.message}
                  </p>
                )}
              </div>

              {/* Cloud AI Section (if online) */}
              {!isOfflineMode && (
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800/80 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/60 pb-3">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Cloud AI Provider Settings
                    </span>
                    <div className="flex items-center gap-2">
                      {cloudTestResult && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            cloudTestResult.connected
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-100 dark:bg-rose-950/50 border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {cloudTestResult.connected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {cloudTestResult.connected ? 'Online' : 'Error'}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">Encrypted in local SQLite</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                        Provider
                      </label>
                      <select
                        value={cloudProvider}
                        onChange={(e) => {
                          const newProv = e.target.value;
                          setCloudProvider(newProv);
                          setCloudTestResult(null);
                          if (newProv === 'gemini') {
                            setCloudModel('gemini-1.5-flash');
                            setCloudBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/');
                          } else if (newProv === 'anthropic') {
                            if (!cloudModel || cloudModel.startsWith('gpt-') || cloudModel.startsWith('o3-')) {
                              setCloudModel('claude-sonnet-4-5');
                            }
                            if (!cloudBaseUrl || cloudBaseUrl.includes('api.openai.com')) {
                              setCloudBaseUrl('https://api.anthropic.com');
                            }
                          } else if (newProv === 'openai') {
                            if (!cloudModel || cloudModel.startsWith('claude-')) {
                              setCloudModel('gpt-4o-mini');
                            }
                            if (!cloudBaseUrl || cloudBaseUrl.includes('api.anthropic.com')) {
                              setCloudBaseUrl('https://api.openai.com/v1');
                            }
                          } else if (newProv === 'groq') {
                            setCloudModel('llama-3.3-70b-versatile');
                            setCloudBaseUrl('https://api.groq.com/openai/v1');
                          } else if (newProv === 'openrouter') {
                            setCloudModel('meta-llama/llama-3.3-70b-instruct');
                            setCloudBaseUrl('https://openrouter.ai/api/v1');
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="groq">Groq (Ultra-Fast Inference)</option>
                        <option value="gemini">Google Gemini (Gemini 1.5 Flash / Pro)</option>
                        <option value="openrouter">OpenRouter (Unified Models)</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="openai">OpenAI</option>
                        <option value="custom">Custom (OpenAI Compatible)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                        Cloud Model
                      </label>
                      {cloudProvider === 'gemini' ? (
                        <select
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast & Recommended)</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        </select>
                      ) : cloudProvider === 'anthropic' ? (
                        <select
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="claude-sonnet-4-5">Anthropic Claude Sonnet 4.5 (Recommended)</option>
                          <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
                          <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                          <option value="claude-3-5-haiku-latest">Claude 3.5 Haiku</option>
                        </select>
                      ) : cloudProvider === 'openai' ? (
                        <select
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="gpt-4o-mini">GPT-4o Mini (Default)</option>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="o3-mini">o3-mini</option>
                        </select>
                      ) : cloudProvider === 'groq' ? (
                        <select
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                          <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                          <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          placeholder="model-tag"
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                        API Endpoint Base URL
                      </label>
                      <input
                        type="text"
                        value={cloudBaseUrl}
                        onChange={(e) => setCloudBaseUrl(e.target.value)}
                        placeholder={cloudProvider === 'anthropic' ? 'https://api.anthropic.com' : cloudProvider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : 'https://api.openai.com/v1'}
                        className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1.5">
                        API Key (Never logged or exposed)
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={cloudApiKey}
                            onChange={(e) => setCloudApiKey(e.target.value)}
                            placeholder={cloudProvider === 'anthropic' ? 'sk-ant-api03-••••••••' : 'sk-proj-••••••••'}
                            className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 pr-10 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleTestCloud}
                          disabled={testingCloud}
                          className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testingCloud ? 'animate-spin' : ''}`} />
                          <span>{testingCloud ? 'Testing...' : 'Test Cloud'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {cloudTestResult?.message && (
                    <p className={`text-xs italic ${cloudTestResult.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {cloudTestResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: In-Browser AI & PWA (Module 32) */}
          {activeTab === 'browser-ai' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-500" />
                  In-Browser Local AI & Offline PWA
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Client-side WebGPU/WASM neural inference, zero-network document indexing, and Progressive Web App installation.
                </p>
              </div>

              {/* PWA Installation Card */}
              <div className="p-5 bg-white/90 dark:bg-[#0f172a]/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-200">
                        Progressive Web App (PWA)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isInstalledPwa
                          ? 'App is installed and running with full offline app-shell caching.'
                          : canInstallPwa
                          ? 'Ready to install on this device for one-click desktop/mobile access.'
                          : 'Service Worker active. App shell cached for offline relaunch.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isInstalledPwa ? (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Installed App
                      </span>
                    ) : canInstallPwa ? (
                      <button
                        type="button"
                        onClick={handleInstallPwa}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Install CogniDesk
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Offline Cache Ready
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-100 dark:border-slate-800/80">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500 block mb-0.5">Offline Shell</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">sw.js v1 (Precached)</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500 block mb-0.5">Display Mode</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Standalone Window</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500 block mb-0.5">Zero Network Boot</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Verified Resilient</span>
                  </div>
                </div>
              </div>

              {/* Hardware Diagnostics (WebGPU / WASM / Storage) */}
              <div className="p-5 bg-white/90 dark:bg-[#0f172a]/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  Client Hardware Capabilities
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* WebGPU */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">WebGPU Acceleration</span>
                        {capabilities?.webGpuSupported ? (
                          <span className="text-emerald-500 font-bold">Enabled</span>
                        ) : (
                          <span className="text-amber-500 font-medium">Fallback</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {capabilities?.webGpuAdapterName || (capabilities?.webGpuSupported ? 'GPU Hardware Adapter' : 'WebGPU not detected; CPU WASM used')}
                      </p>
                    </div>
                  </div>

                  {/* WASM SIMD */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">WASM SIMD 128-bit</span>
                        <span className="text-emerald-500 font-bold">
                          {capabilities?.simdSupported ? 'Supported' : 'Standard WASM'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Vectorized instructions for quantized matrix math.
                      </p>
                    </div>
                  </div>

                  {/* Web Workers */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Background Workers</span>
                        <span className="text-emerald-500 font-bold">
                          {capabilities?.workerSupported ? 'Supported' : 'Single Thread'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Zero UI freezing during generation.
                      </p>
                    </div>
                  </div>

                  {/* Storage Quota */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#131c2e]/60 border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Browser Storage</span>
                        <span className="text-cyan-500 font-bold">
                          {capabilities?.estimatedStorageQuotaMb
                            ? `${capabilities.estimatedStorageQuotaMb} MB Quota`
                            : 'IndexedDB Ready'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {capabilities?.estimatedStorageQuotaMb
                          ? `Up to ${capabilities.estimatedStorageQuotaMb} MB available for local models & documents.`
                          : 'Storage API ready for caching.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* On-Demand In-Browser Models */}
              <div className="p-5 bg-white/90 dark:bg-[#0f172a]/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-500" />
                      In-Browser AI Model Catalog
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Models are downloaded on demand into browser cache. Initial website download is lightweight (0 MB AI weight).
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {AVAILABLE_BROWSER_MODELS.map((model) => {
                    const isCached = !!cachedModels[model.id];
                    const progress = downloadProgresses[model.id];
                    const isDownloading = progress?.status === 'downloading';
                    const isError = progress?.status === 'error';
                    const isAnyDownloading = Object.values(downloadProgresses).some((p) => p.status === 'downloading');

                    return (
                      <div
                        key={model.id}
                        className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                          isError
                            ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                            : 'bg-slate-50/80 dark:bg-[#131c2e]/70 border-slate-200/80 dark:border-slate-800'
                        }`}
                      >
                        <div className="space-y-1 max-w-xl flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{model.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {model.runtime}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-400">
                              {model.sizeMb === 0 ? '0 MB (Instant)' : `${model.sizeMb} MB`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">{model.description}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                            <span>Runtime: {model.runtime}</span>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              100% Client-Side Privacy Guaranteed
                            </span>
                          </div>

                          {/* Error message with retry explanation */}
                          {isError && progress?.errorMessage && (
                            <div className="pt-2">
                              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                                <span>⚠️ {progress.errorMessage}</span>
                              </p>
                            </div>
                          )}

                          {/* Download progress bar */}
                          {isDownloading && progress && (
                            <div className="pt-2 space-y-1">
                              <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                <span>{progress.stageText || `Downloading: ${progress.percent}%`}</span>
                                <span>
                                  {progress.loadedMb} / {progress.totalMb} MB {progress.speedMbps > 0 ? `(${progress.speedMbps} Mbps)` : ''}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-blue-600 to-cyan-500 h-full rounded-full transition-all duration-200"
                                  style={{ width: `${Math.max(progress.percent, 3)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {model.id === 'in-browser-extractive' ? (
                            <span className="px-3.5 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              Always Ready
                            </span>
                          ) : isCached ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                Ready Offline
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteModel(model.id)}
                                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                title="Delete from cache"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : isError ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadModel(model.id)}
                              disabled={isAnyDownloading}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-4 h-4" />
                              <span>Retry Download</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownloadModel(model.id)}
                              disabled={isDownloading || isAnyDownloading}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                              <span>{isDownloading ? 'Downloading...' : 'Download Model'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: System Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pb-1">Subsystem Health & Telemetry</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Real-time operational status for on-device engines and persistence stores.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Backend Server Card */}
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Server className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                      FastAPI Backend
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Healthy
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-1">
                    <div>App: {status?.backend.app_name || 'CogniDesk API'}</div>
                    <div>Endpoint: {status?.backend.host || '127.0.0.1'}:{status?.backend.port || 8000}</div>
                    <div>Version: v{status?.backend.version || '1.0.0'}</div>
                  </div>
                </div>

                {/* SQLite Database Card */}
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Database className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      SQLite Database
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Connected
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-1">
                    <div>File: {status?.database.database_url || 'database/cognidesk.db'}</div>
                    <div>Total Workspaces: {status?.database.total_workspaces ?? 1}</div>
                    <div>Total Documents: {status?.database.total_documents ?? 0}</div>
                  </div>
                </div>

                {/* ChromaDB Vector Store Card */}
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                      ChromaDB Vector Store
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Healthy
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-1">
                    <div>Collection: {status?.vector_store.collection || 'cognidesk_documents'}</div>
                    <div>Total Vectors Indexed: {status?.vector_store.total_vectors ?? 0}</div>
                    <div>Engine: Local DuckDB / Parquet embedded</div>
                  </div>
                </div>

                {/* EasyOCR Engine Card */}
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      Offline OCR Engine
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Ready
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-1">
                    <div>Engine: EasyOCR (PyTorch CRAFT + ResNet)</div>
                    <div>Supported: PNG, JPG, JPEG, BMP</div>
                    <div>Offline Autonomy: 100% On-Device</div>
                  </div>
                </div>

                {/* Embedding Engine Card */}
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 sm:col-span-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Embedding Model & Vectorizer
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Loaded
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                    <div>Model: all-MiniLM-L6-v2</div>
                    <div>Dimensions: 384</div>
                    <div>Metric: Cosine</div>
                    <div>Chunk Size: {status?.embedding_engine.chunk_size || 500} chars</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Storage & Chunking */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pb-1">Document Chunking & Vector Configuration</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Configure text segmenting parameters for new document uploads and vector storage.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Chunk Size (characters)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    value={chunkSize}
                    onChange={(e) => setChunkSize(parseInt(e.target.value) || 500)}
                    className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Recommended: 500 chars (approx. 80-100 words). Fits comfortably in MiniLM 256-token context.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-sm">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Chunk Overlap (characters)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 50)}
                    className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Recommended: 50 chars (10% overlap). Preserves sentence continuity across chunk boundaries.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 text-xs text-slate-700 dark:text-slate-400 space-y-2.5 shadow-sm">
                <div className="font-bold text-slate-900 dark:text-slate-300">Persistent Server Storage & Vector Paths</div>
                <div>Database (SQLite / PostgreSQL): <code className="text-blue-700 dark:text-cyan-300 bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-800 px-1.5 py-0.5 rounded shadow-2xs">database/cognidesk.db (or remote PostgreSQL)</code></div>
                <div>Vector Store (ChromaDB): <code className="text-blue-700 dark:text-cyan-300 bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-800 px-1.5 py-0.5 rounded shadow-2xs">vector_db/ (or remote Chroma server)</code></div>
                <div>Document Uploads: <code className="text-blue-700 dark:text-cyan-300 bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-800 px-1.5 py-0.5 rounded shadow-2xs">uploads/</code></div>
              </div>
            </div>
          )}

          {/* TAB 4: Model Context Protocol (MCP) */}
          {activeTab === 'mcp' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Model Context Protocol (MCP)</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                      MCP Service Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Standardized Model Context Protocol (MCP) server providing document search and tool invocation.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-cyan-300 font-mono shadow-2xs">
                    Endpoint: /api/v1/mcp
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-500/30 text-[11px] text-blue-700 dark:text-blue-300 font-mono">
                    Protocol: 2024-11-05
                  </span>
                </div>
              </div>

              {/* Protocol Spec Overview */}
              <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-sm">
                <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-slate-200">
                  <Terminal className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  <span>Local JSON-RPC 2.0 Transport Architecture</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  CogniDesk implements the standard MCP specification directly inside the local backend.
                  External AI agents (such as Claude Desktop or custom agents) can connect via HTTP JSON-RPC
                  to securely query documents and retrieve structured summaries without exposing proprietary files.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1">
                  <div>• Handshake: <code className="text-blue-700 dark:text-cyan-300 font-semibold">initialize</code></div>
                  <div>• Discovery: <code className="text-blue-700 dark:text-cyan-300 font-semibold">tools/list</code></div>
                  <div>• Execution: <code className="text-blue-700 dark:text-cyan-300 font-semibold">tools/call</code></div>
                </div>
              </div>

              {/* Implemented Tools List */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200">Registered Local Tools (Workspace Scoped)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-[#131c2e]/80 border border-slate-300/90 dark:border-blue-900/50 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">search_documents</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">100% Offline</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Performs semantic vector search across chunks in the active workspace with citations.
                    </p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-500 font-mono">
                      Args: query (string, required), top_k (int), workspace_id (int)
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-[#131c2e]/80 border border-slate-300/90 dark:border-blue-900/50 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">get_document_summary</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">100% Offline</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Retrieves structural metadata, chunk counts, and text overview for a document in the active workspace.
                    </p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-500 font-mono">
                      Args: document_id (int, required), workspace_id (int)
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive MCP Tool Tester */}
              <div className="p-5 rounded-2xl bg-white/90 dark:bg-[#0f172a]/70 border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-200">Interactive MCP Tool Tester</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Tests real JSON-RPC tool dispatch</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1">
                      Select MCP Tool
                    </label>
                    <select
                      value={selectedMcpTool}
                      onChange={(e) => setSelectedMcpTool(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500 shadow-sm"
                    >
                      <option value="search_documents">search_documents</option>
                      <option value="get_document_summary">get_document_summary</option>
                    </select>
                  </div>

                  {selectedMcpTool === 'search_documents' ? (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1">
                          Query String
                        </label>
                        <input
                          type="text"
                          value={mcpSearchQuery}
                          onChange={(e) => setMcpSearchQuery(e.target.value)}
                          placeholder="Search keywords..."
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1">
                          Top K
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={mcpTopK}
                          onChange={(e) => setMcpTopK(parseInt(e.target.value) || 3)}
                          className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 block mb-1">
                        Document ID (in active workspace)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={mcpDocId}
                        onChange={(e) => setMcpDocId(parseInt(e.target.value) || 1)}
                        className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleRunMcpTool}
                    disabled={runningMcpTool}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Play className={`w-3.5 h-3.5 ${runningMcpTool ? 'animate-spin' : ''}`} />
                    <span>{runningMcpTool ? 'Executing via MCP...' : 'Execute Tool via MCP'}</span>
                  </button>
                </div>

                {/* Live Tool Output */}
                {mcpToolOutput && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono font-semibold">
                      <span>MCP Result Output</span>
                      <button
                        type="button"
                        onClick={() => setMcpToolOutput(null)}
                        className="text-blue-600 hover:text-blue-700 dark:text-cyan-400 dark:hover:text-cyan-300 text-[11px] font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-60 leading-relaxed shadow-inner">
                      {mcpToolOutput}
                    </pre>
                  </div>
                )}
              </div>

              {/* Cloud MCP Roadmap */}
              <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-[#131c2e]/80 border border-slate-300/90 dark:border-blue-900/50 flex items-center justify-between shadow-sm">
                <div>
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-300">
                    <span>Cloud MCP Remote Gateway</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-cyan-300 font-semibold border border-blue-200/60 dark:border-transparent">Planned</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-500 mt-0.5">
                    Secure outbound proxy allowing authorized remote AI agents to access CogniDesk tools with JWT tokens.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Appearance & Theme */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 pb-1">Appearance & Interface Theme</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">Customize the visual presentation of CogniDesk.</p>
              </div>

              <div className="flex items-center justify-between p-5 bg-white/90 dark:bg-[#0f172a]/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-200 text-sm block">Display Color Theme</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 block">
                    Currently set to <span className="capitalize text-blue-700 dark:text-cyan-300 font-bold">{theme}</span> mode
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
