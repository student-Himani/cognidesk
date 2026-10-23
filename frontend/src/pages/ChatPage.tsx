import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Paperclip,
  Sparkles,
  Bot,
  User,
  FileText,
  RefreshCw,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  ChevronDown,
  Cpu,
  X,
  WifiOff,
  Database,
  Search,
  Edit3,
  Check,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Copy,
  Download,
} from 'lucide-react';
import KnowledgeOrb3D from '../components/3d/KnowledgeOrb3D';
import AIThinkingIndicator from '../components/loading/AIThinkingIndicator';
import { useToast } from '../hooks/useToast';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  sendRagQuery,
  streamRagQuery,
  getOllamaStatus,
  RagCitation,
  OllamaStatusData
} from '../services/ragService';
import {
  fetchDocuments,
  uploadDocumentFile,
  DocumentItem
} from '../services/documentService';
import {
  fetchChatThreads,
  saveChatThread,
  renameChatThread,
  deleteChatThread,
  fetchFollowUpSuggestions
} from '../services/chatService';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  mode?: 'normal' | 'document';
  citations?: RagCitation[];
  attachedFile?: string;
  timestamp: string;
  suggestions?: string[];
  isLoadingSuggestions?: boolean;
}

interface Thread {
  id: string;
  title: string;
  time: string;
  mode?: 'normal' | 'document';
  selectedDocId?: string | 'all';
  messages: Message[];
}

export const ChatPage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const { showSuccess, showError, showInfo } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isHistoryOpen, setIsHistoryOpen] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [chatMode, setChatMode] = useState<'normal' | 'document'>('normal');
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [availableModels, setAvailableModels] = useState<string[]>(['llama-3.3-70b-versatile']);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusData | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Search & Rename states for conversation history
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Documents & Source Modal State
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | 'all'>('all');
  const [selectedCitation, setSelectedCitation] = useState<RagCitation | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isWaitingFirstToken, setIsWaitingFirstToken] = useState<boolean>(false);

  // Conversation Threads
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('thread-1');
  const [input, setInput] = useState('');

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];

  const filteredThreads = threads.filter((t) => {
    if (!historySearchQuery.trim()) return true;
    const q = historySearchQuery.toLowerCase();
    const matchesTitle = t.title.toLowerCase().includes(q);
    const matchesMessage = t.messages?.some((m) => m.text.toLowerCase().includes(q));
    return matchesTitle || matchesMessage;
  });

  // Auto-scroll chat to bottom within messages container ONLY (never scrolls window/layout)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [activeThread?.messages, isStreaming]);

  const indexedDocuments = documents.filter((doc) => {
    const s = (doc.status || '').toLowerCase();
    return s === 'indexed' || s === 'processed' || s === 'embedded' || s === 'ready';
  });
  const processingDocuments = documents.filter((doc) => {
    const s = (doc.status || '').toLowerCase();
    return s === 'processing' || s === 'uploaded' || s === 'embedding' || s === 'pending';
  });
  const hasIndexedDocs = indexedDocuments.length > 0;
  const isDocumentProcessing = processingDocuments.length > 0;

  // Load Ollama status, uploaded documents & SQLite chat history on mount and workspace change
  useEffect(() => {
    loadOllamaStatus();
    loadWorkspaceDocuments();
    loadChatHistory();
  }, [activeWorkspace?.id]);

  // Persist updated threads to SQLite whenever threads state updates
  useEffect(() => {
    if (threads.length > 0) {
      threads.forEach((t) => {
        saveChatThread(t);
      });
      window.dispatchEvent(new CustomEvent('chat-thread-updated'));
    }
  }, [threads]);

  // Restore thread if specified via URL param (?thread=...)
  useEffect(() => {
    const urlThreadId = searchParams.get('thread');
    if (urlThreadId && threads.length > 0) {
      const found = threads.find((t) => t.id === urlThreadId);
      if (found && found.id !== activeThreadId) {
        handleSelectThread(found);
      }
    }
  }, [searchParams, threads]);

  // Close options dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setIsOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadChatHistory = async () => {
    try {
      const savedThreads = await fetchChatThreads();
      if (savedThreads && savedThreads.length > 0) {
        setThreads(savedThreads);
        const urlThreadId = searchParams.get('thread');
        const matched = urlThreadId ? savedThreads.find((t) => t.id === urlThreadId) : null;
        const initialThread = matched || savedThreads[0];
        setActiveThreadId(initialThread.id);
        if (initialThread.mode) setChatMode(initialThread.mode);
        if (initialThread.selectedDocId) setSelectedDocId(initialThread.selectedDocId);
      } else {
        const defaultThread: Thread = {
          id: 'thread-1',
          title: 'CogniDesk AI Chat',
          time: 'Just now',
          mode: 'normal',
          selectedDocId: 'all',
          messages: [
            {
              id: 'm1',
              sender: 'assistant',
              text: 'Welcome to CogniDesk Universal AI Assistant!\n\n• Normal Chat: Direct ChatGPT-like conversational AI for general knowledge, coding, writing, and brainstorming.\n• Document Chat: Grounded answers with source citations over your uploaded PDF/DOCX/TXT files and images.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        };
        setThreads([defaultThread]);
        setActiveThreadId(defaultThread.id);
        saveChatThread(defaultThread);
      }
    } catch (err) {
      console.error('Failed to load chat history from SQLite:', err);
    }
  };

  const handleSelectThread = (thread: Thread) => {
    setActiveThreadId(thread.id);
    if (thread.mode) setChatMode(thread.mode);
    if (thread.selectedDocId) setSelectedDocId(thread.selectedDocId);
    setSearchParams({ thread: thread.id }, { replace: true });
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsHistoryOpen(false);
    }
  };

  const handleRenameThread = async (threadId: string) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    const cleanTitle = editingTitle.trim();
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: cleanTitle } : t))
    );
    await renameChatThread(threadId, cleanTitle);
    setEditingThreadId(null);
    window.dispatchEvent(new CustomEvent('chat-thread-updated'));
    showSuccess('Renamed', `Conversation renamed to "${cleanTitle}"`);
  };

  const handleModeChange = (newMode: 'normal' | 'document') => {
    setChatMode(newMode);
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, mode: newMode } : t))
    );
  };

  const handleDocSelectChange = (docId: string) => {
    setSelectedDocId(docId);
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, selectedDocId: docId } : t))
    );
  };

  const loadOllamaStatus = async () => {
    try {
      const statusData = await getOllamaStatus();
      setOllamaStatus(statusData);
      const browserModels = [
        'in-browser-extractive',
        'SmolLM2-135M-Instruct-q0f16-MLC',
        'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      ];
      if (statusData.online && statusData.models && statusData.models.length > 0) {
        // Online: prioritize hosted model (Groq / Gemini / OpenAI / Ollama), but keep browser options available
        const combined = Array.from(new Set([...statusData.models, ...browserModels]));
        setAvailableModels(combined);
        const preferred = statusData.active_model || statusData.models[0];
        setSelectedModel(preferred);
      } else {
        // Offline / Unconfigured Cloud: default to zero-download in-browser extractive or local WebLLM
        setAvailableModels(browserModels);
        setSelectedModel('in-browser-extractive');
      }
    } catch {
      setAvailableModels([
        'in-browser-extractive',
        'SmolLM2-135M-Instruct-q0f16-MLC',
        'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      ]);
      setSelectedModel('in-browser-extractive');
    }
  };

  const loadWorkspaceDocuments = async () => {
    try {
      const docList = await fetchDocuments();
      setDocuments(docList);

      if (docList.some((doc) => doc.status === 'Processing' || doc.status === 'Uploaded')) {
        setTimeout(loadWorkspaceDocuments, 2000);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    }
  };

  // Upload document directly from paperclip button
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);
    showInfo(`Uploading and indexing "${file.name}" into ChromaDB...`);

    try {
      const uploadedDoc = await uploadDocumentFile(file);
      showSuccess(`"${file.name}" uploaded successfully! Indexing into ChromaDB vector store...`);
      if (uploadedDoc && uploadedDoc.id) {
        handleDocSelectChange(uploadedDoc.id);
      }
      handleModeChange('document');
      await loadWorkspaceDocuments();
    } catch (err: any) {
      showError(err?.response?.data?.detail || `Failed to index "${file.name}".`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStartNewChat = () => {
    const newThreadId = `thread-${Date.now()}`;
    const newThread: Thread = {
      id: newThreadId,
      title: 'New Conversation',
      time: 'Just now',
      mode: chatMode,
      selectedDocId: selectedDocId,
      messages: [],
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThreadId);
    setInput('');
    saveChatThread(newThread);
    window.dispatchEvent(new CustomEvent('chat-thread-updated'));
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id && threads.length > 1) {
      const nextThread = threads.find((t) => t.id !== id);
      if (nextThread) handleSelectThread(nextThread);
    }
    await deleteChatThread(id);
    window.dispatchEvent(new CustomEvent('chat-thread-updated'));
    showSuccess('Deleted', 'Conversation removed');
  };

  const handleClearCurrentChat = () => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThreadId ? { ...t, messages: [] } : t))
    );
    setIsOptionsOpen(false);
    showSuccess('Cleared', 'Chat messages cleared');
  };

  const handleExportChat = () => {
    if (!activeThread || activeThread.messages.length === 0) {
      showInfo('No messages to export');
      return;
    }
    const content = activeThread.messages
      .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}:\n${m.text}\n`)
      .join('\n---\n\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeThread.title.replace(/[^a-z0-9]/gi, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsOptionsOpen(false);
    showSuccess('Exported', 'Conversation exported as Markdown');
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied', 'Message copied to clipboard');
  };

  const toggleFullscreen = () => {
    if (!chatContainerRef.current) return;
    if (!document.fullscreenElement) {
      chatContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        handleSend();
      }
    }
  };

  const handleSend = (textOverride?: string) => {
    const rawText = typeof textOverride === 'string' ? textOverride : input;
    const userText = rawText.trim();
    if (!userText || isStreaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsgId = `user-${Date.now()}`;
    const aiMsgId = `ai-${Date.now()}`;

    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      mode: chatMode,
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const initialAiMessage: Message = {
      id: aiMsgId,
      sender: 'assistant',
      mode: chatMode,
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setThreads((prev) => {
      if (prev.length === 0) {
        const fallbackThread: Thread = {
          id: activeThreadId || 'thread-1',
          title: userText.length > 25 ? userText.substring(0, 25) + '...' : userText,
          time: 'Just now',
          mode: chatMode,
          selectedDocId: selectedDocId,
          messages: [userMessage, initialAiMessage],
        };
        saveChatThread(fallbackThread);
        return [fallbackThread];
      }
      return prev.map((t) => {
        if (t.id !== activeThreadId) return t;
        const newTitle =
          t.messages.length === 0
            ? userText.length > 25
              ? userText.substring(0, 25) + '...'
              : userText
            : t.title;

        return {
          ...t,
          title: newTitle,
          messages: [...t.messages, userMessage, initialAiMessage],
        };
      });
    });

    executeRagQueryStream(userText, activeThreadId, aiMsgId, chatMode);
  };

  const handleSendSuggestion = (suggestionText: string) => {
    if (isStreaming) return;
    handleSend(suggestionText);
  };

  // Auto-send prompt if navigated from Dashboard with ?prompt=...
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt');
    if (urlPrompt && urlPrompt.trim() && !isStreaming) {
      const cleanPrompt = decodeURIComponent(urlPrompt).trim();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('prompt');
          next.delete('fileName');
          return next;
        },
        { replace: true }
      );
      handleSend(cleanPrompt);
    }
  }, [searchParams, isStreaming]);

  const executeRagQueryStream = (queryText: string, threadId: string, aiMsgId: string, currentMode: 'normal' | 'document') => {
    setIsStreaming(true);
    setIsWaitingFirstToken(true);

    const docIds = currentMode === 'document' && selectedDocId !== 'all' ? [parseInt(selectedDocId, 10)] : undefined;
    const requestedTopK = selectedDocId !== 'all' ? 25 : 10;

    // Snapshot conversation history for multi-turn context
    const currentThread = threads.find((t) => t.id === threadId);
    const historyPayload = (currentThread?.messages || []).map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    let fullAnswerText = '';
    let responseCitations: RagCitation[] = [];

    const triggerSuggestions = (finalText: string, citations: RagCitation[]) => {
      // Mark assistant message as loading suggestions
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: t.messages.map((m) =>
              m.id === aiMsgId ? { ...m, isLoadingSuggestions: true } : m
            ),
          };
        })
      );

      fetchFollowUpSuggestions({
        query: queryText,
        answer: finalText,
        mode: currentMode,
        messages: [...historyPayload, { sender: 'user', text: queryText }],
        citations: citations,
        model: selectedModel,
      })
        .then((suggestions) => {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              return {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, suggestions: suggestions || [], isLoadingSuggestions: false }
                    : m
                ),
              };
            })
          );
        })
        .catch(() => {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              return {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === aiMsgId ? { ...m, suggestions: [], isLoadingSuggestions: false } : m
                ),
              };
            })
          );
        });
    };

    const cancelFn = streamRagQuery(
      {
        query: queryText,
        mode: currentMode,
        model: selectedModel,
        top_k: requestedTopK,
        document_ids: docIds,
        messages: historyPayload,
      },
      (metadata) => {
        responseCitations = metadata.citations || [];
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            const updatedMessages = t.messages.map((m) =>
              m.id === aiMsgId ? { ...m, citations: metadata.citations } : m
            );
            return { ...t, messages: updatedMessages };
          })
        );
      },
      (token) => {
        setIsWaitingFirstToken(false);
        fullAnswerText += token;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            const updatedMessages = t.messages.map((m) =>
              m.id === aiMsgId ? { ...m, text: m.text + token } : m
            );
            return { ...t, messages: updatedMessages };
          })
        );
      },
      () => {
        setIsStreaming(false);
        setIsWaitingFirstToken(false);
        cancelStreamRef.current = null;
        triggerSuggestions(fullAnswerText, responseCitations);
      },
      async (err) => {
        console.warn('Streaming error, executing REST fallback:', err);
        try {
          const resData = await sendRagQuery({
            query: queryText,
            mode: currentMode,
            model: selectedModel,
            top_k: requestedTopK,
            document_ids: docIds,
            messages: historyPayload,
          });

          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              const updatedMessages = t.messages.map((m) =>
                m.id === aiMsgId
                  ? { ...m, text: resData.answer, citations: resData.citations }
                  : m
              );
              return { ...t, messages: updatedMessages };
            })
          );
          triggerSuggestions(resData.answer, resData.citations || []);
        } catch (fallbackErr: any) {
          const detailMsg =
            fallbackErr?.response?.data?.detail ||
            fallbackErr?.message ||
            (err && err.message) ||
            'Failed to process AI query. Please verify local server is running.';
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== threadId) return t;
              const updatedMessages = t.messages.map((m) =>
                m.id === aiMsgId
                  ? { ...m, text: `Error: ${detailMsg}`, isLoadingSuggestions: false, suggestions: [] }
                  : m
              );
              return { ...t, messages: updatedMessages };
            })
          );
        } finally {
          setIsStreaming(false);
          setIsWaitingFirstToken(false);
          cancelStreamRef.current = null;
        }
      }
    );

    cancelStreamRef.current = cancelFn;
  };

  const suggestionCards = [
    {
      title: 'Analyze document trends',
      prompt: 'Summarize the key insights and trends from my uploaded workspace documents.',
    },
    {
      title: 'Vector search explanation',
      prompt: 'Explain how local ChromaDB embeddings and similarity search work offline in CogniDesk.',
    },
    {
      title: 'Generate structured notes',
      prompt: 'Synthesize the main technical concepts into bullet points for quick review.',
    },
    {
      title: 'Deep concept inquiry',
      prompt: 'Compare the architecture of Offline Local AI versus Cloud LLMs.',
    },
  ];

  return (
    <div
      ref={chatContainerRef}
      className={`h-full min-h-0 flex-1 flex rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white/70 dark:bg-[#10131d]/75 backdrop-blur-xl text-slate-800 dark:text-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden relative ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen rounded-none border-none' : ''
      }`}
    >
      {/* Hidden Document File Uploader Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg"
      />

      {/* Mobile Drawer Overlay Backdrop for Conversation History */}
      {isHistoryOpen && (
        <div
          onClick={() => setIsHistoryOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-30 md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* Left History & Documents Drawer */}
      <aside
        className={`bg-slate-50/95 dark:bg-[#121520]/95 border-r border-slate-200/80 dark:border-slate-800/80 flex flex-col transition-all duration-300 z-30 shrink-0 ${
          isHistoryOpen
            ? 'fixed md:relative inset-y-0 left-0 w-72 md:w-80 shadow-2xl md:shadow-none h-full'
            : 'w-0 opacity-0 overflow-hidden pointer-events-none'
        }`}
      >
        {/* New Chat Button */}
        <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <button
            onClick={handleStartNewChat}
            className="flex-1 flex items-center justify-center space-x-2 py-2 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold text-xs shadow-md shadow-blue-500/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
          <button
            onClick={() => setIsHistoryOpen(false)}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Recent Conversations Search */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
          <div className="px-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search chats..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-8.5 pr-7 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              {historySearchQuery && (
                <button
                  onClick={() => setHistorySearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Conversations
              </span>
              <span className="text-[10px] text-blue-700 dark:text-cyan-300 font-mono bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-800/40">
                {filteredThreads.length} SQLite
              </span>
            </div>

            <div className="space-y-1">
              {filteredThreads.length === 0 ? (
                <div className="text-center py-6 px-2 text-slate-400 dark:text-slate-500 text-xs">
                  {historySearchQuery ? 'No matching chats' : 'No chats yet'}
                </div>
              ) : (
                filteredThreads.map((thread) => {
                  const isSelected = thread.id === activeThreadId;
                  const isEditing = editingThreadId === thread.id;

                  return (
                    <div
                      key={thread.id}
                      onClick={() => !isEditing && handleSelectThread(thread)}
                      className={`group flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-800/40 text-blue-950 dark:text-cyan-200 shadow-2xs'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-2xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>

                        {isEditing ? (
                          <div
                            className="flex items-center space-x-1 flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameThread(thread.id);
                                if (e.key === 'Escape') setEditingThreadId(null);
                              }}
                              autoFocus
                              className="w-full bg-white dark:bg-slate-800 border border-blue-500 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-white focus:outline-none"
                            />
                            <button
                              onClick={() => handleRenameThread(thread.id)}
                              className="p-1 hover:bg-blue-100 dark:hover:bg-white/10 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingThreadId(null)}
                              className="p-1 hover:bg-blue-100 dark:hover:bg-white/10 text-slate-400 rounded cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold truncate flex-1">{thread.title}</span>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center space-x-1 shrink-0 ml-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingThreadId(thread.id);
                              setEditingTitle(thread.title);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 transition-opacity cursor-pointer"
                            title="Rename chat"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteThread(thread.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity cursor-pointer"
                            title="Delete chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Canvas */}
      <main className="flex-1 flex flex-col h-full bg-transparent relative min-w-0">
        
        {/* Top Header Bar */}
        <header className="h-14 sm:h-16 border-b border-slate-200/80 dark:border-slate-800/80 px-2.5 sm:px-4 md:px-6 flex items-center justify-between bg-white/80 dark:bg-[#121520]/80 backdrop-blur-xl shrink-0 gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {!isHistoryOpen && (
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors cursor-pointer shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Open Conversation History"
                aria-label="Open conversation history"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h1 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  AI Chat
                </h1>
                {/* Mode Pill Badge */}
                <span
                  className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full border font-semibold truncate ${
                    chatMode === 'document'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300 border-blue-200/70 dark:border-blue-800/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="hidden sm:inline">{chatMode === 'document' ? 'Document Chat (RAG)' : 'Normal Chat'}</span>
                  <span className="sm:hidden">{chatMode === 'document' ? 'RAG' : 'Direct'}</span>
                </span>
              </div>
              <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <span>Knowledge & Context</span>
                <span>•</span>
                <span className={ollamaStatus?.online ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : (ollamaStatus?.is_hosted && !ollamaStatus?.has_cloud_key ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-500 dark:text-slate-400 font-semibold')}>
                  {ollamaStatus?.online
                    ? (ollamaStatus.is_hosted ? (ollamaStatus.mode_label || 'Hosted Cloud AI Ready') : 'Local Ollama (Active)')
                    : (ollamaStatus?.is_hosted && !ollamaStatus?.has_cloud_key
                        ? 'Cloud AI (Key Required)'
                        : 'Offline Extractive Mode')}
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Model Pill, Fullscreen, Options */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Model Selector Pill */}
            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer min-h-[36px]"
              >
                <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                <span className="max-w-[70px] sm:max-w-[90px] truncate">{selectedModel}</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-[#151926] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-1 animate-pop-in">
                  {availableModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedModel(m);
                        setIsModelDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-cyan-300 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer min-h-[36px]"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Fullscreen</span>
            </button>

            {/* Options Dropdown */}
            <div className="relative" ref={optionsRef}>
              <button
                onClick={() => setIsOptionsOpen(!isOptionsOpen)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                title="Options"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Options</span>
              </button>

              {isOptionsOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-[#151926] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 p-1 animate-pop-in space-y-0.5">
                  <button
                    onClick={handleStartNewChat}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-left cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                    <span>New Chat</span>
                  </button>
                  <button
                    onClick={handleExportChat}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-left cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                    <span>Export Chat</span>
                  </button>
                  <button
                    onClick={handleClearCurrentChat}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Clear Chat</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Message Stream Feed */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 scrollbar-thin">
          {!activeThread || activeThread.messages.length === 0 ? (
            
            /* Central Empty State with Three.js Knowledge Orb */
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-5 max-w-2xl mx-auto py-6">
              
              {/* Three.js 3D Knowledge Orb Visualization */}
              <div className="relative flex items-center justify-center">
                <KnowledgeOrb3D size={230} />
              </div>

              {/* Central Title */}
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  CogniDesk AI Intelligence
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Switch between <strong>Document Chat</strong> (ChromaDB RAG context search) and <strong>Normal Chat</strong> (direct offline AI).
                </p>
              </div>

              {/* "✨ Try asking:" Suggestions */}
              <div className="space-y-2 w-full pt-1">
                <div className="flex items-center justify-center space-x-1.5 text-xs text-blue-700 dark:text-cyan-300 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                  <span>Try asking:</span>
                </div>

                <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                  {suggestionCards.map((card, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(card.prompt)}
                      className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#111827] hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 hover:border-blue-300 dark:border-slate-800 dark:hover:border-cyan-700/60 text-slate-700 dark:text-slate-300 hover:text-blue-800 dark:hover:text-cyan-200 text-xs font-medium transition-all shadow-2xs hover:scale-102 active:scale-98 cursor-pointer"
                    >
                      {card.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Micro Guidance Hint */}
              <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                Click paperclip to attach document • Select mode for RAG • 100% Offline & Private
              </p>
            </div>

          ) : (
            
            /* Active Message Stream */
            activeThread.messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex space-x-3 ${isUser ? 'justify-end' : 'justify-start'} animate-pop-in`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-2xl ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Message Bubble Card */}
                    <div
                      className={`relative group p-3.5 md:p-4 text-xs md:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-600 text-white rounded-2xl rounded-tr-xs shadow-md shadow-blue-500/20'
                          : 'bg-white/95 dark:bg-[#111827]/90 border border-slate-200/90 dark:border-blue-900/40 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-xs shadow-2xs'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">
                        {msg.text ? (
                          msg.text
                        ) : (isWaitingFirstToken || isStreaming) ? (
                          <AIThinkingIndicator
                            label="Synthesizing AI response..."
                            sublabel="Querying neural weights & vector space"
                          />
                        ) : null}
                      </div>

                      {/* Actionable Settings Card if API Key or Provider Missing */}
                      {!isUser && msg.text && (msg.text.includes('No valid LLM provider configured') || msg.text.includes('Cloud provider error') || msg.text.includes('API key') || msg.text.includes('503')) && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex flex-col gap-2">
                          <div className="font-semibold flex items-center gap-1.5">
                            <SlidersHorizontal className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Cloud AI Configuration Required</span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            To generate live conversational responses on this hosted deployment, please configure an API key for Groq (Free tier available), Google Gemini, OpenAI, or Anthropic in Settings.
                          </p>
                          <a
                            href="/settings"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs w-fit transition-colors shadow-xs"
                          >
                            Open Settings
                          </a>
                        </div>
                      )}

                      {/* Copy Action on AI Message */}
                      {!isUser && msg.text && (
                        <button
                          onClick={() => handleCopyText(msg.text)}
                          className="opacity-0 group-hover:opacity-100 absolute right-2.5 top-2.5 p-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-opacity cursor-pointer shadow-2xs"
                          title="Copy text"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Source Citations Badges */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-blue-700 dark:text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Database className="w-3 h-3 text-cyan-500 dark:text-cyan-400" /> Sources:
                        </span>
                        {msg.citations.map((cit, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedCitation(cit)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-cyan-300 border border-blue-200/70 dark:border-blue-800/40 transition-all cursor-pointer shadow-2xs"
                          >
                            <FileText className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                            <span>{cit.docName}</span>
                            <span className="text-[10px] font-mono bg-blue-200/70 dark:bg-blue-900/60 px-1.5 py-0.2 rounded-full text-blue-900 dark:text-cyan-200">
                              {cit.page}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* AI Follow-up Suggestions Chips */}
                    {!isUser && (
                      <>
                        {msg.isLoadingSuggestions && (
                          <div className="flex items-center space-x-2 pt-2 text-xs text-blue-600 dark:text-cyan-400 animate-pulse">
                            <Sparkles className="w-3.5 h-3.5 animate-spin" />
                            <span>Thinking of follow-up questions...</span>
                          </div>
                        )}

                        {!isStreaming && msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="space-y-1.5 pt-2 animate-pop-in">
                            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              <Sparkles className="w-3 h-3 text-blue-500 dark:text-cyan-400" />
                              <span>Suggested Follow-ups:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.suggestions.map((suggestionText, sIdx) => (
                                <button
                                  key={sIdx}
                                  type="button"
                                  onClick={() => handleSendSuggestion(suggestionText)}
                                  disabled={isStreaming}
                                  className="group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50/90 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-cyan-300 border border-blue-200/80 dark:border-blue-800/60 hover:border-blue-400 dark:hover:border-cyan-400 shadow-2xs transition-all hover:scale-[1.02] active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left"
                                >
                                  <span>{suggestionText}</span>
                                  <Send className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 dark:text-cyan-400" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700/80 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Floating Rounded Chat Input Bar */}
        <div className="p-2.5 sm:p-3 md:p-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-white via-white/95 to-transparent dark:from-[#0A0E17] dark:via-[#0A0E17]/90 dark:to-transparent space-y-2">
          
          {/* Mode Switcher Pills & Document Filter */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 max-w-4xl mx-auto px-1">
            <div className="flex items-center space-x-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs backdrop-blur-xl">
              <button
                type="button"
                onClick={() => handleModeChange('normal')}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer min-h-[30px] sm:min-h-[32px] ${
                  chatMode === 'normal'
                    ? 'bg-white dark:bg-[#1e293b] text-blue-700 dark:text-cyan-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">Normal</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('document')}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer min-h-[30px] sm:min-h-[32px] ${
                  chatMode === 'document'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">Document (RAG)</span>
              </button>
            </div>

            {/* Target Document Selector (when in Document Mode and docs exist) */}
            {chatMode === 'document' && hasIndexedDocs && (
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold text-[10px] sm:text-[11px] shrink-0 hidden sm:inline">
                  Filter Doc:
                </span>
                <select
                  value={selectedDocId}
                  onChange={(e) => handleDocSelectChange(e.target.value)}
                  className="bg-slate-100 dark:bg-[#131c2e] text-slate-800 dark:text-slate-200 border border-slate-300/80 dark:border-blue-900/40 rounded-lg px-2 sm:px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 cursor-pointer font-medium max-w-[120px] sm:max-w-[200px] truncate"
                >
                  <option value="all">All Indexed ({indexedDocuments.length})</option>
                  {indexedDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Warning Banner when Document Chat active but no Indexed Docs exist */}
          {/* Status Banner when Document Chat active */}
          {chatMode === 'document' && !hasIndexedDocs && (
            <div className="max-w-4xl mx-auto p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between animate-pop-in">
              <span className="flex items-center gap-2">
                {isDocumentProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span>
                  {isDocumentProcessing
                    ? 'Document is currently being indexed into ChromaDB. You can already type your questions below.'
                    : 'No documents indexed in workspace yet. Attach a file using the paperclip or ask general questions.'}
                </span>
              </span>
              {!isDocumentProcessing && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-200 dark:bg-amber-800/40 dark:hover:bg-amber-700/50 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer shrink-0 text-xs transition-colors"
                >
                  Upload Document
                </button>
              )}
            </div>
          )}

          {/* Crisp Slate/Glass Rounded Input Pill */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="max-w-4xl mx-auto"
          >
            <div className="flex items-end space-x-2 bg-white/95 dark:bg-[#131c2e] border border-slate-300/90 dark:border-blue-900/50 rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-xs backdrop-blur-xl">
              
              {/* Attach Document / OCR File Button */}
              <button
                type="button"
                onClick={() => {
                  if (chatMode !== 'document') setChatMode('document');
                  fileInputRef.current?.click();
                }}
                disabled={isUploading || isStreaming}
                className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer mb-0.5 shrink-0 ${
                  chatMode === 'document'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-cyan-300 hover:text-blue-900 dark:hover:text-white'
                    : 'text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                }`}
                title="Attach Document or Image to Index (ChromaDB + OCR)"
              >
                {isUploading ? <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> : <Paperclip className="w-4 h-4" />}
              </button>

              {/* Auto-growing Textarea Input Field */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isStreaming}
                placeholder={
                  isStreaming
                    ? 'AI is generating response...'
                    : chatMode === 'normal'
                    ? 'Ask anything (Normal Chat mode)...'
                    : hasIndexedDocs
                    ? 'Ask anything about your documents (ChromaDB RAG)...'
                    : isDocumentProcessing
                    ? 'Indexing document... You can prepare your question here.'
                    : 'Ask anything, or attach a document using the paperclip...'
                }
                className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-xs md:text-sm py-1.5 leading-relaxed resize-none max-h-40 overflow-y-auto scrollbar-thin disabled:opacity-50 disabled:cursor-not-allowed"
              />

              {/* Send Button with micro-animation */}
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md shadow-blue-500/25 transition-all cursor-pointer shrink-0 mb-0.5 hover:scale-105 active:scale-95"
                title="Send Message (Enter to send, Shift+Enter for new line)"
              >
                {isStreaming ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between px-2 pt-1 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              <span className="hidden sm:inline">Enter to send • Shift+Enter for new line</span>
              <span className="sm:hidden">{isStreaming ? 'Thinking...' : 'Tap Send'}</span>
              <span>{isStreaming ? 'Streaming...' : chatMode === 'document' ? 'ChromaDB RAG' : 'Offline LLM'}</span>
            </div>
          </form>
        </div>

      </main>

      {/* Source Citation Text Preview Modal */}
      {selectedCitation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-blue-900/50 rounded-2xl max-w-lg w-full p-5 space-y-3.5 shadow-xl animate-pop-in text-slate-800 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-cyan-300">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedCitation.docName}</h4>
                  <p className="text-[11px] text-blue-600 dark:text-cyan-300 font-mono">
                    Chunk: {selectedCitation.page} • Similarity: {selectedCitation.score}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCitation(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Retrieved Vector Context Excerpt:
              </span>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-mono leading-relaxed max-h-60 overflow-y-auto">
                Indexed in ChromaDB vector database for similarity matching.
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedCitation(null)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
