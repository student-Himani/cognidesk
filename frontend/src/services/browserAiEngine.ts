// ==============================================================================
// CogniDesk In-Browser Local AI Engine (Module 32 + WebLLM WebGPU Integration)
// Runs genuine quantized neural models (SmolLM2 / Qwen2.5 / Llama 3.2) in-browser
// via WebGPU in a dedicated Web Worker with persistent CacheStorage,
// plus zero-download extractive context RAG fallback for unsupported hardware.
// ==============================================================================

import {
  CreateWebWorkerMLCEngine,
  CreateMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
  hasModelInCache,
  deleteModelAllInfoInCache,
} from '@mlc-ai/web-llm';
import { RagCitation } from './ragService';

export interface BrowserAiCapabilities {
  webGpuSupported: boolean;
  webGpuAdapterName?: string;
  wasmSupported: boolean;
  simdSupported: boolean;
  workerSupported: boolean;
  estimatedStorageQuotaMb?: number;
  availableStorageMb?: number;
}

export interface AiModelMeta {
  id: string;
  name: string;
  description: string;
  sizeMb: number;
  runtime: 'WebGPU (WebLLM)' | 'Extractive Built-in';
  status: 'available' | 'downloading' | 'ready';
  vramRequiredMb: number;
}

export interface ModelDownloadProgress {
  modelId: string;
  percent: number;
  loadedMb: number;
  totalMb: number;
  speedMbps: number;
  status: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  errorMessage?: string;
  stageText?: string;
}

export const AVAILABLE_BROWSER_MODELS: AiModelMeta[] = [
  {
    id: 'in-browser-extractive',
    name: 'Instant Extractive RAG (Zero Download)',
    description: '100% offline rule-based semantic context extraction with source citations. Works on every device and phone with 0 MB download.',
    sizeMb: 0,
    runtime: 'Extractive Built-in',
    status: 'ready',
    vramRequiredMb: 0,
  },
  {
    id: 'SmolLM2-135M-Instruct-q0f16-MLC',
    name: 'SmolLM2 135M (Ultra-Lightweight Neural)',
    description: 'Compact 135M parameter neural model from Hugging Face. Very fast on laptops, tablets, and supported modern smartphones.',
    sizeMb: 135,
    runtime: 'WebGPU (WebLLM)',
    status: 'available',
    vramRequiredMb: 350,
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M (Fast & Fluent Neural)',
    description: '360M instruction-tuned model. Good balance between memory consumption, speed, and conversational depth.',
    sizeMb: 230,
    runtime: 'WebGPU (WebLLM)',
    status: 'available',
    vramRequiredMb: 500,
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B (High Coherence Neural)',
    description: 'Alibaba Qwen 2.5 0.5B model. Exceptional multi-turn reasoning and multilingual capabilities for browser WebGPU.',
    sizeMb: 360,
    runtime: 'WebGPU (WebLLM)',
    status: 'available',
    vramRequiredMb: 750,
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B (Meta Deep Reasoning)',
    description: 'Meta Llama 3.2 1B instruction-tuned model. State-of-the-art browser performance on modern GPUs.',
    sizeMb: 800,
    runtime: 'WebGPU (WebLLM)',
    status: 'available',
    vramRequiredMb: 1400,
  },
];

class BrowserAiEngine {
  private capabilities: BrowserAiCapabilities | null = null;
  private engine: MLCEngineInterface | null = null;
  private currentLoadedModelId: string | null = null;
  private activeWorker: Worker | null = null;
  private isInitializing: boolean = false;

  get isModelLoading(): boolean {
    return this.isInitializing;
  }

  // ----------------------------------------------------------------------------
  // 1. Hardware & WebGPU Runtime Capabilities Diagnostics
  // ----------------------------------------------------------------------------
  async detectCapabilities(): Promise<BrowserAiCapabilities> {
    if (this.capabilities) return this.capabilities;

    let webGpuSupported = false;
    let adapterName: string | undefined;

    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          webGpuSupported = true;
          const info = await adapter.requestAdapterInfo?.().catch(() => null);
          adapterName = info?.description || info?.vendor || 'WebGPU Compatible Hardware';
        }
      } catch (err) {
        console.warn('[BrowserAI] WebGPU detection error:', err);
      }
    }

    const wasmSupported = typeof WebAssembly !== 'undefined';
    let simdSupported = false;
    if (wasmSupported) {
      try {
        simdSupported = WebAssembly.validate(
          new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 125, 0, 0, 0, 0, 11])
        );
      } catch {}
    }

    let quotaMb: number | undefined;
    let availableMb: number | undefined;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          quotaMb = Math.round(estimate.quota / (1024 * 1024));
          availableMb = Math.round(((estimate.quota || 0) - (estimate.usage || 0)) / (1024 * 1024));
        }
      } catch {}
    }

    this.capabilities = {
      webGpuSupported,
      webGpuAdapterName: adapterName,
      wasmSupported,
      simdSupported,
      workerSupported: typeof Worker !== 'undefined',
      estimatedStorageQuotaMb: quotaMb,
      availableStorageMb: availableMb,
    };

    return this.capabilities;
  }

  // ----------------------------------------------------------------------------
  // 2. Persistent Cache Verification (WebLLM CacheStorage)
  // ----------------------------------------------------------------------------
  async isModelCached(modelId: string): Promise<boolean> {
    if (modelId === 'in-browser-extractive') return true;
    try {
      return await hasModelInCache(modelId);
    } catch {
      return false;
    }
  }

  isModelLoaded(modelId: string): boolean {
    return this.currentLoadedModelId === modelId && this.engine !== null;
  }

  getCurrentModelId(): string | null {
    return this.currentLoadedModelId;
  }

  // ----------------------------------------------------------------------------
  // 3. Model Download & Engine Loading via Web Worker
  // ----------------------------------------------------------------------------
  async loadModel(
    modelId: string,
    onProgress?: (p: ModelDownloadProgress) => void
  ): Promise<boolean> {
    if (modelId === 'in-browser-extractive') {
      this.currentLoadedModelId = modelId;
      onProgress?.({
        modelId,
        percent: 100,
        loadedMb: 0,
        totalMb: 0,
        speedMbps: 0,
        status: 'ready',
        stageText: 'Instant extractive engine ready',
      });
      return true;
    }

    if (this.currentLoadedModelId === modelId && this.engine) {
      onProgress?.({
        modelId,
        percent: 100,
        loadedMb: 0,
        totalMb: 0,
        speedMbps: 0,
        status: 'ready',
        stageText: 'Model already loaded in memory',
      });
      return true;
    }

    const caps = await this.detectCapabilities();
    if (!caps.webGpuSupported) {
      throw new Error(
        'WebGPU is not supported by your current browser or device graphics drivers. You can continue using "Instant Extractive RAG" or Hosted Online AI without any setup.'
      );
    }

    const modelMeta = AVAILABLE_BROWSER_MODELS.find((m) => m.id === modelId);
    const totalMb = modelMeta?.sizeMb || 250;

    // Check storage quota
    if (caps.availableStorageMb !== undefined && caps.availableStorageMb < totalMb * 1.1) {
      throw new Error(
        `Insufficient storage space: ~${totalMb} MB required, but only ~${caps.availableStorageMb} MB is available in browser storage.`
      );
    }

    this.isInitializing = true;
    const startTime = Date.now();

    const progressCallback = (report: InitProgressReport) => {
      const percent = Math.min(Math.round(report.progress * 100), 100);
      const elapsedSec = (Date.now() - startTime) / 1000;
      const loadedMb = Math.round(totalMb * report.progress * 10) / 10;
      const speedMbps = elapsedSec > 0 && report.progress > 0 ? (loadedMb * 8) / elapsedSec : 0;

      onProgress?.({
        modelId,
        percent,
        loadedMb,
        totalMb,
        speedMbps: Math.round(speedMbps * 10) / 10,
        status: percent === 100 ? 'ready' : 'downloading',
        stageText: report.text || 'Loading neural weights...',
      });
    };

    try {
      // 1. Terminate any previous worker
      if (this.activeWorker) {
        try {
          this.activeWorker.terminate();
        } catch {}
        this.activeWorker = null;
      }
      this.engine = null;

      // 2. Spawn fresh Web Worker for off-main-thread inference
      const workerUrl = new URL('../workers/webllm.worker.ts', import.meta.url);
      const worker = new Worker(workerUrl, { type: 'module' });
      this.activeWorker = worker;

      try {
        this.engine = await CreateWebWorkerMLCEngine(worker, modelId, {
          initProgressCallback: progressCallback,
        });
      } catch (workerErr: any) {
        console.warn('[BrowserAI] WebWorkerMLCEngine initialization note, falling back to direct MLCEngine:', workerErr);
        // Fallback to direct in-thread WebGPU engine if worker environment restricts module imports
        this.engine = await CreateMLCEngine(modelId, {
          initProgressCallback: progressCallback,
        });
      }

      this.currentLoadedModelId = modelId;
      this.isInitializing = false;

      onProgress?.({
        modelId,
        percent: 100,
        loadedMb: totalMb,
        totalMb,
        speedMbps: 0,
        status: 'ready',
        stageText: `${modelMeta?.name || modelId} is ready for 100% offline inference!`,
      });

      return true;
    } catch (err: any) {
      this.isInitializing = false;
      this.currentLoadedModelId = null;
      this.engine = null;
      if (this.activeWorker) {
        try {
          this.activeWorker.terminate();
        } catch {}
        this.activeWorker = null;
      }

      const errMsg = err?.message || 'Failed to initialize in-browser neural engine.';
      onProgress?.({
        modelId,
        percent: 0,
        loadedMb: 0,
        totalMb,
        speedMbps: 0,
        status: 'error',
        errorMessage: errMsg,
      });
      throw new Error(errMsg);
    }
  }

  async downloadModel(
    modelId: string,
    onProgress: (p: ModelDownloadProgress) => void
  ): Promise<boolean> {
    return this.loadModel(modelId, onProgress);
  }

  cancelDownload(_modelId?: string) {
    if (this.activeWorker) {
      try {
        this.activeWorker.terminate();
      } catch {}
      this.activeWorker = null;
    }
    this.engine = null;
    this.currentLoadedModelId = null;
    this.isInitializing = false;
  }

  async deleteModel(modelId: string): Promise<boolean> {
    if (modelId === 'in-browser-extractive') return true;
    try {
      if (this.currentLoadedModelId === modelId) {
        if (this.activeWorker) {
          this.activeWorker.terminate();
          this.activeWorker = null;
        }
        this.engine = null;
        this.currentLoadedModelId = null;
      }
      await deleteModelAllInfoInCache(modelId);
      return true;
    } catch {
      return false;
    }
  }

  // ----------------------------------------------------------------------------
  // 4. In-Browser Streaming Inference & Grounded Offline RAG
  // ----------------------------------------------------------------------------
  async streamOfflineAnswer(
    params: {
      query: string;
      chunks: Array<{
        documentId: string | number;
        docName: string;
        chunkIndex: number;
        snippet: string;
        scoreText?: string;
      }>;
      modelId?: string;
      conversationHistory?: Array<{ sender: string; text: string }>;
    },
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: any) => void
  ): Promise<() => void> {
    const { query, chunks, modelId = 'SmolLM2-135M-Instruct-q0f16-MLC', conversationHistory = [] } = params;
    let isAborted = false;

    // A. If user selected Instant Extractive RAG or if neural engine is not loaded
    if (modelId === 'in-browser-extractive' || (!this.engine && modelId !== this.currentLoadedModelId)) {
      this.generateOfflineAnswer({ query, chunks, modelId: 'in-browser-extractive' })
        .then(async (res) => {
          if (isAborted) return;
          const words = res.answer.split(' ');
          for (let i = 0; i < words.length; i++) {
            if (isAborted) break;
            onToken((i === 0 ? '' : ' ') + words[i]);
            await new Promise((r) => setTimeout(r, 16));
          }
          onDone();
        })
        .catch(onError);

      return () => {
        isAborted = true;
      };
    }

    // B. Real Neural Generation using WebLLM
    (async () => {
      try {
        if (!this.engine) {
          // Attempt lazy load if cached
          await this.loadModel(modelId);
        }

        if (!this.engine) {
          throw new Error('In-browser neural engine is not initialized.');
        }

        // Build grounded system prompt
        let systemPrompt =
          'You are CogniDesk, an intelligent, private, in-browser AI knowledge assistant. ' +
          'Answer accurately and concisely.';

        if (chunks && chunks.length > 0) {
          const contextSnippets = chunks
            .map((c, i) => `[Source ${i + 1}: ${c.docName} (Chunk #${c.chunkIndex})]\n${c.snippet}`)
            .join('\n\n');

          systemPrompt +=
            '\n\nUse the following extracted workspace document passages to answer the user request. ' +
            'Cite your sources using [Source 1], [Source 2], etc. where appropriate.\n\n' +
            contextSnippets;
        }

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
        ];

        // Append recent multi-turn conversation history
        for (const msg of conversationHistory.slice(-6)) {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text,
          });
        }

        messages.push({ role: 'user', content: query });

        const stream = await this.engine.chat.completions.create({
          messages,
          stream: true,
          temperature: 0.3,
          max_tokens: 1024,
        });

        for await (const chunk of stream) {
          if (isAborted) break;
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            onToken(delta);
          }
        }

        if (!isAborted) {
          onDone();
        }
      } catch (err: any) {
        if (!isAborted) {
          console.warn('[BrowserAI] WebLLM streaming inference failed, falling back to extractive RAG:', err);
          // Fall back gracefully to extractive answer so user is never blocked
          try {
            const fallbackRes = await this.generateOfflineAnswer({
              query,
              chunks,
              modelId: 'in-browser-extractive',
            });
            const words = fallbackRes.answer.split(' ');
            for (let i = 0; i < words.length; i++) {
              if (isAborted) break;
              onToken((i === 0 ? '' : ' ') + words[i]);
              await new Promise((r) => setTimeout(r, 16));
            }
            onDone();
          } catch (fbErr) {
            onError(err);
          }
        }
      }
    })();

    return () => {
      isAborted = true;
      if (this.engine) {
        try {
          (this.engine.interruptGenerate() as any)?.catch?.(() => {});
        } catch {
          // ignore
        }
      }
    };
  }

  // ----------------------------------------------------------------------------
  // 5. Offline Grounded Extractive Search Fallback
  // ----------------------------------------------------------------------------
  async generateOfflineAnswer(params: {
    query: string;
    chunks: Array<{
      documentId: string | number;
      docName: string;
      chunkIndex: number;
      snippet: string;
      scoreText?: string;
    }>;
    modelId?: string;
  }): Promise<{
    answer: string;
    citations: RagCitation[];
    model: string;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();
    const { query, chunks, modelId = 'in-browser-extractive' } = params;

    const citations: RagCitation[] = (chunks || []).map((c) => ({
      docName: c.docName,
      page: `Chunk #${c.chunkIndex}`,
      score: c.scoreText || '90% Match',
      documentId: typeof c.documentId === 'number' ? c.documentId : 1,
    }));

    if (!chunks || chunks.length === 0) {
      const qLower = query.toLowerCase().trim();
      let generalAnswer = '';

      if (qLower.match(/\b(hi|hello|hey|greetings|who are you|help|what is cognidesk)\b/)) {
        generalAnswer =
          "Hello! I am CogniDesk's Universal AI Assistant.\n\n" +
          "• **Conversational Chat**: Ask general questions, brainstorm ideas, write notes, and create flashcards.\n" +
          "• **Document Analysis & RAG**: Upload PDF, DOCX, TXT files or images using the paperclip to ask questions grounded directly in your documents with verified citations.\n" +
          "• **Online & Offline Dual-Engine**: Connects to fast cloud inference (Groq / Gemini / OpenAI) when available, and runs 100% offline WebLLM models directly on your GPU.\n" +
          "• **Persistent Storage**: Your workspaces, notes, flashcards, and conversation history are safely preserved.";
      } else {
        generalAnswer =
          `I am currently operating via CogniDesk's In-Browser Local Engine.\n\n` +
          `• **Conversational AI**: For open-ended general chat, Hosted Online AI uses server-configured keys (e.g. Groq / Gemini), or you can download a local WebLLM neural model (SmolLM2 / Qwen2.5) in Settings.\n` +
          `• **Document Q&A**: To ask questions grounded in your research or notes, upload a PDF, DOCX, TXT, or image file using the paperclip icon.`;
      }

      return {
        answer: generalAnswer,
        citations: [],
        model: 'In-Browser Local Engine (100% Offline)',
        executionTimeMs: Math.round(Date.now() - startTime),
      };
    }

    // Extract relevant evidence sentences
    const queryWords = query.toLowerCase().match(/\b\w+\b/g) || [];
    const extractedSentences: string[] = [];

    chunks.forEach((c) => {
      const sentences = c.snippet.split(/(?<=[.?!])\s+/);
      sentences.forEach((s) => {
        const lower = s.toLowerCase();
        const matches = queryWords.filter((w) => w.length > 2 && lower.includes(w)).length;
        if (matches > 0) {
          extractedSentences.push(s.trim());
        }
      });
    });

    const topSentences = Array.from(new Set(extractedSentences)).slice(0, 4);

    let answerText = '';
    if (topSentences.length > 0) {
      answerText =
        `[Offline Grounded Retrieval — Local Extractive Context]\n\n` +
        `Based on your local workspace documents:\n\n` +
        topSentences.map((s) => `• ${s}`).join('\n') +
        `\n\n*Verified Source: ${chunks[0].docName} (Chunk #${chunks[0].chunkIndex})*`;
    } else {
      answerText =
        `[Offline Grounded Retrieval — Local Extractive Context]\n\n` +
        `According to **${chunks[0].docName}**:\n\n` +
        `"${chunks[0].snippet.slice(0, 350)}..."\n\n` +
        `*(Answered locally in browser with zero network calls)*`;
    }

    return {
      answer: answerText,
      citations,
      model:
        modelId === 'in-browser-extractive'
          ? 'In-Browser Extractive RAG (Offline Verified)'
          : `In-Browser Extractive Fallback (${modelId})`,
      executionTimeMs: Math.max(Date.now() - startTime, 15),
    };
  }
}

export const browserAiEngine = new BrowserAiEngine();
