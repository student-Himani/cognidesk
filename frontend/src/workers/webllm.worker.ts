// ==============================================================================
// CogniDesk WebLLM Worker (Browser-Native Neural Inference Off-Main-Thread)
// Executes MLC WebGPU quantized language model inference inside a dedicated worker.
// ==============================================================================

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
