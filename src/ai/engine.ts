// Main-thread manager for the on-device model. One model, one worker, one
// request at a time. All inference happens locally through WebGPU; nothing
// here sends player text anywhere. The only network traffic is the one-time
// model download (Hugging Face) and WebLLM's runtime library (GitHub).
import type { ChatCompletionMessageParam, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import type { ModelId } from '../game/types';
import { MODELS } from './models';

export type AiErrorCode =
  | 'device-lost'
  | 'out-of-memory'
  | 'network'
  | 'evicted'
  | 'load-failed'
  | 'inference-failed'
  | 'worker-crashed';

export type AiStatus =
  | { kind: 'disabled' }
  | { kind: 'checking' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'not-loaded'; cached: boolean | null; note?: string }
  | { kind: 'loading'; modelId: ModelId; progress: number; text: string }
  | { kind: 'ready'; modelId: ModelId; variant: string }
  | { kind: 'generating'; modelId: ModelId; variant: string }
  | { kind: 'error'; code: AiErrorCode; message: string; modelId: ModelId };

export interface GpuSupport {
  supported: boolean;
  reason?: string;
  f16: boolean;
  adapter?: string;
}

export interface CompletionRequest {
  messages: ChatCompletionMessageParam[];
  maxTokens: number;
  temperature?: number;
  /** JSON schema string; turns on structured output. */
  jsonSchema?: string;
  /** Called with the full text so far while streaming. */
  onText?: (text: string) => void;
  timeoutMs?: number;
  /** Low-priority work (notes, suggestions) that a queued request may interrupt. */
  background?: boolean;
  /** Sampling overrides; defaults are 0.9, 0.3 and 0 (penalties apply to free text only). */
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Called once with token counts at the end of the stream. */
  onUsage?: (usage: CompletionUsage) => void;
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
}

/** The exact request body sent to WebLLM for a completion. */
export function completionBody(req: CompletionRequest) {
  return {
    messages: req.messages,
    stream: true as const,
    max_tokens: req.maxTokens,
    temperature: req.temperature ?? (req.jsonSchema ? 0.4 : 0.8),
    top_p: req.topP ?? 0.9,
    ...(req.jsonSchema
      ? { response_format: { type: 'json_object' as const, schema: req.jsonSchema } }
      : { frequency_penalty: req.frequencyPenalty ?? 0.3, presence_penalty: req.presencePenalty ?? 0 }),
    ...(req.onUsage ? { stream_options: { include_usage: true } } : {}),
    extra_body: { enable_thinking: false },
  };
}

export class AiBusyError extends Error {
  constructor() {
    super('The model is already answering something.');
    this.name = 'AiBusyError';
  }
}

export class AiNotReadyError extends Error {
  constructor() {
    super('The model is not loaded.');
    this.name = 'AiNotReadyError';
  }
}

export class AiInterruptedError extends Error {
  constructor(public readonly partial: string) {
    super('Generation was stopped.');
    this.name = 'AiInterruptedError';
  }
}

type Listener = (status: AiStatus) => void;
type WebLLM = typeof import('@mlc-ai/web-llm');

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function classifyError(err: unknown, phase: 'load' | 'generate'): { code: AiErrorCode; message: string } {
  const text = errorText(err);
  if (/DeviceLost|device (was|is) lost|GPUDevice.*lost|device lost/i.test(text)) {
    return { code: 'device-lost', message: 'The graphics device was reset (this can happen when GPU memory runs low). Retry, or switch to the smaller model.' };
  }
  if (/out of memory|OOM|allocation failed|exceeds the max/i.test(text)) {
    return { code: 'out-of-memory', message: 'Not enough GPU memory for this model. Try the smaller model.' };
  }
  if (/Failed to fetch|NetworkError|network|ERR_INTERNET|Load failed|fetch/i.test(text) && phase === 'load') {
    return { code: 'network', message: 'The model files could not be downloaded. Check your connection and retry.' };
  }
  if (/QuotaExceeded|quota/i.test(text)) {
    return { code: 'load-failed', message: 'This browser ran out of storage space for the model. Free up space or use the smaller model.' };
  }
  if (phase === 'load') return { code: 'load-failed', message: `The model could not be loaded. ${text.slice(0, 160)}` };
  return { code: 'inference-failed', message: 'The model had trouble answering. Your creature will use its own words for now.' };
}

export class AiService {
  private status: AiStatus = { kind: 'disabled' };
  private listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private engine: WebWorkerMLCEngine | null = null;
  private loadToken = 0;
  private cancelLoadFn: (() => void) | null = null;
  private busy = false;
  private interrupted = false;
  private backgroundActive = false;
  private support: GpuSupport | null = null;
  private lib: WebLLM | null = null;
  private activeModel: ModelId | null = null;
  private activeVariant = '';

  getStatus(): AiStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(status: AiStatus) {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  get isReady(): boolean {
    return this.status.kind === 'ready';
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private async webllm(): Promise<WebLLM> {
    if (!this.lib) this.lib = await import('@mlc-ai/web-llm');
    return this.lib;
  }

  async checkSupport(): Promise<GpuSupport> {
    if (this.support) return this.support;
    const nav = navigator as Navigator & { gpu?: { requestAdapter(opts?: unknown): Promise<GPUAdapterLike | null> } };
    if (!window.isSecureContext) {
      this.support = { supported: false, f16: false, reason: 'Local AI needs a secure (https or localhost) page.' };
    } else if (!nav.gpu) {
      this.support = { supported: false, f16: false, reason: 'This browser does not support WebGPU. Try a recent Chrome, Edge or Safari.' };
    } else {
      try {
        const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
          this.support = { supported: false, f16: false, reason: 'WebGPU is present but no compatible graphics adapter was found.' };
        } else {
          const info = adapter.info ?? {};
          this.support = {
            supported: true,
            f16: adapter.features.has('shader-f16'),
            adapter: [info.vendor, info.architecture].filter(Boolean).join(' ') || undefined,
          };
        }
      } catch (err) {
        this.support = { supported: false, f16: false, reason: `WebGPU could not start: ${errorText(err).slice(0, 120)}` };
      }
    }
    return this.support;
  }

  /** The concrete WebLLM model id used for a choice on this device. */
  async variantFor(modelId: ModelId): Promise<string> {
    const support = await this.checkSupport();
    return support.f16 ? modelId : MODELS[modelId].f32Fallback;
  }

  async isCached(modelId: ModelId): Promise<boolean | null> {
    try {
      const lib = await this.webllm();
      return await lib.hasModelInCache(await this.variantFor(modelId));
    } catch {
      return null;
    }
  }

  async deleteModel(modelId: ModelId): Promise<void> {
    const lib = await this.webllm();
    const variant = await this.variantFor(modelId);
    if (this.activeVariant === variant) await this.unload();
    await lib.deleteModelAllInfoInCache(variant);
  }

  /** Reflect settings when AI is turned off. */
  disable() {
    this.cancelLoad();
    this.teardown();
    this.set({ kind: 'disabled' });
  }

  async refreshIdle(modelId: ModelId, note?: string): Promise<void> {
    if (this.status.kind === 'loading' || this.status.kind === 'ready' || this.status.kind === 'generating') return;
    this.set({ kind: 'checking' });
    const support = await this.checkSupport();
    if (!support.supported) {
      this.set({ kind: 'unsupported', reason: support.reason ?? 'WebGPU is unavailable.' });
      return;
    }
    const cached = await this.isCached(modelId);
    this.set({ kind: 'not-loaded', cached, note });
  }

  /** Load (and if needed download) a model. Resolves true when ready. */
  async load(modelId: ModelId): Promise<boolean> {
    const support = await this.checkSupport();
    if (!support.supported) {
      this.set({ kind: 'unsupported', reason: support.reason ?? 'WebGPU is unavailable.' });
      return false;
    }
    this.cancelLoad();
    this.teardown();
    const token = ++this.loadToken;
    const variant = await this.variantFor(modelId);
    const cached = await this.isCached(modelId);
    if (cached === false && typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set({ kind: 'error', code: 'network', message: 'You are offline and the model is not downloaded yet. Connect to download it.', modelId });
      return false;
    }
    this.set({ kind: 'loading', modelId, progress: 0, text: cached ? 'Loading model from this browser…' : 'Starting download…' });
    let lib: WebLLM;
    try {
      lib = await this.webllm();
    } catch (err) {
      this.set({ kind: 'error', modelId, ...classifyError(err, 'load') });
      return false;
    }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'kinling-llm' });
    this.worker = worker;
    const cancelled = new Promise<'cancelled'>((resolve) => {
      this.cancelLoadFn = () => resolve('cancelled');
    });
    const crashed = new Promise<never>((_, reject) => {
      worker.addEventListener('error', (e) => {
        const err = new Error(`Worker error: ${e.message || 'unknown'}`);
        reject(err);
        // A crash after loading leaves no usable engine: surface it so the player can retry.
        if (token === this.loadToken && this.engine) {
          this.teardown();
          this.set({ kind: 'error', code: 'worker-crashed', message: 'The AI worker stopped unexpectedly. Retry to reload the model.', modelId });
        }
      });
    });
    crashed.catch(() => undefined);
    try {
      const result = await Promise.race([
        lib.CreateWebWorkerMLCEngine(worker, variant, {
          initProgressCallback: (report) => {
            if (token !== this.loadToken) return;
            this.set({ kind: 'loading', modelId, progress: Math.max(0, Math.min(1, report.progress)), text: report.text });
          },
          logLevel: 'WARN',
        }),
        cancelled,
        crashed,
      ]);
      if (result === 'cancelled' || token !== this.loadToken) return false;
      this.engine = result;
      this.activeModel = modelId;
      this.activeVariant = variant;
      this.cancelLoadFn = null;
      this.set({ kind: 'ready', modelId, variant });
      return true;
    } catch (err) {
      if (token !== this.loadToken) return false;
      this.teardown();
      this.set({ kind: 'error', modelId, ...classifyError(err, 'load') });
      return false;
    }
  }

  cancelLoad() {
    if (this.status.kind !== 'loading' && !this.cancelLoadFn) return;
    this.loadToken++;
    this.cancelLoadFn?.();
    this.cancelLoadFn = null;
    this.teardown();
    if (this.status.kind === 'loading') this.set({ kind: 'not-loaded', cached: null, note: 'Download paused. Files already fetched are kept for next time.' });
  }

  async unload(): Promise<void> {
    this.loadToken++;
    try {
      await this.engine?.unload();
    } catch {
      // ignore: we terminate the worker anyway
    }
    this.teardown();
    if (this.status.kind !== 'disabled') this.set({ kind: 'not-loaded', cached: null });
  }

  private teardown() {
    this.worker?.terminate();
    this.worker = null;
    this.engine = null;
    this.busy = false;
    this.backgroundActive = false;
    this.activeModel = null;
    this.activeVariant = '';
  }

  /**
   * Wait until the model is free (requests are strictly one at a time).
   * Resolves false if it is not ready within the timeout or stops being usable.
   */
  whenIdle(timeoutMs = 25_000): Promise<boolean> {
    if (this.isReady && !this.busy) return Promise.resolve(true);
    if (this.status.kind !== 'generating' && this.status.kind !== 'ready') return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), timeoutMs);
      const unsubscribe = this.subscribe((st) => {
        if (st.kind === 'ready' && !this.busy) done(true);
        else if (st.kind !== 'generating') done(false);
      });
    });
  }

  /** True while a model is loaded (idle or answering). */
  get isLoaded(): boolean {
    return this.status.kind === 'ready' || this.status.kind === 'generating';
  }

  /** Like complete(), but waits its turn if another request is running. */
  async completeQueued(req: CompletionRequest, waitMs = 25_000): Promise<string> {
    const deadline = Date.now() + waitMs;
    // The player is waiting: background work gives way.
    if (this.busy && this.backgroundActive) this.interrupt();
    for (;;) {
      if (!(await this.whenIdle(Math.max(0, deadline - Date.now())))) throw new AiNotReadyError();
      try {
        return await this.complete(req);
      } catch (err) {
        // Another waiter got the model first; try again until the deadline.
        if (err instanceof AiBusyError && Date.now() < deadline) continue;
        throw err;
      }
    }
  }

  /** Stop the current generation, keeping whatever text was produced. */
  interrupt() {
    if (!this.busy || !this.engine) return;
    this.interrupted = true;
    try {
      this.engine.interruptGenerate();
    } catch {
      // ignore
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    if (!this.engine || !this.activeModel || this.status.kind !== 'ready') throw new AiNotReadyError();
    if (this.busy) throw new AiBusyError();
    const engine = this.engine;
    const modelId = this.activeModel;
    const variant = this.activeVariant;
    this.busy = true;
    this.backgroundActive = req.background === true;
    this.interrupted = false;
    this.set({ kind: 'generating', modelId, variant });
    let text = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        engine.interruptGenerate();
      } catch {
        // ignore
      }
    }, req.timeoutMs ?? 45_000);
    try {
      // Every request is independent: the full context is sent each time.
      await engine.resetChat();
      // Always stream, even for JSON. WebLLM's non-streaming path checks a
      // leftover interrupt flag *before* generating and returns "" without
      // clearing it, so after a cancelled reply every non-streamed request
      // would come back empty. Streaming requests reset that flag first.
      const stream = await engine.chat.completions.create(completionBody(req));
      for await (const chunk of stream) {
        if (chunk.usage) req.onUsage?.({ promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens });
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        text += delta;
        req.onText?.(text);
      }
      if (this.interrupted && !timedOut) throw new AiInterruptedError(text);
      return text;
    } catch (err) {
      if (err instanceof AiInterruptedError) throw err;
      const info = classifyError(err, 'generate');
      if (info.code === 'device-lost' || info.code === 'out-of-memory') {
        this.teardown();
        this.set({ kind: 'error', modelId, ...info });
      }
      throw err;
    } finally {
      clearTimeout(timer);
      this.busy = false;
      this.backgroundActive = false;
      if (this.getStatus().kind === 'generating') this.set({ kind: 'ready', modelId, variant });
    }
  }
}

interface GPUAdapterLike {
  features: { has(name: string): boolean };
  info?: { vendor?: string; architecture?: string };
}

export const ai = new AiService();
