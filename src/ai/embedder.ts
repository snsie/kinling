// On-device sentence embeddings for memory search. A tiny model runs in its
// own worker, separate from the chat model, so it can be switched on or off
// without reloading the chat model and can index memories while a reply is
// being written. Like the chat model, nothing leaves the device: the only
// network traffic is the one-time model download.
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { classifyError } from './engine';

export const EMBED_MODEL = 'snowflake-arctic-embed-s-q0f32-MLC-b4';
/** Approximate one-time download (weights + runtime). */
export const EMBED_DOWNLOAD_MB = 135;
// Arctic Embed expects this prefix on search queries (not on the stored texts).
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const BATCH = 16;
const CACHE_LIMIT = 2500;
const QUERY_TIMEOUT_MS = 4000;

export type EmbedStatus =
  | { kind: 'off'; note?: string }
  | { kind: 'loading'; progress: number; text: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type Listener = (status: EmbedStatus) => void;

export class EmbeddingService {
  private status: EmbedStatus = { kind: 'off' };
  private listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private engine: WebWorkerMLCEngine | null = null;
  private loadToken = 0;
  private cache = new Map<string, Float32Array>();
  // One request at a time: each call waits for the previous one.
  private chain: Promise<unknown> = Promise.resolve();

  getStatus(): EmbedStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(status: EmbedStatus) {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  get isReady(): boolean {
    return this.status.kind === 'ready';
  }

  async isCached(): Promise<boolean | null> {
    try {
      const lib = await import('@mlc-ai/web-llm');
      return await lib.hasModelInCache(EMBED_MODEL);
    } catch {
      return null;
    }
  }

  async load(): Promise<boolean> {
    if (this.status.kind === 'ready' || this.status.kind === 'loading') return this.status.kind === 'ready';
    this.teardown();
    const token = ++this.loadToken;
    this.set({ kind: 'loading', progress: 0, text: 'Preparing memory search…' });
    try {
      const lib = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'kinling-embed' });
      this.worker = worker;
      const engine = await lib.CreateWebWorkerMLCEngine(worker, EMBED_MODEL, {
        initProgressCallback: (report) => {
          if (token === this.loadToken) this.set({ kind: 'loading', progress: Math.max(0, Math.min(1, report.progress)), text: report.text });
        },
        logLevel: 'WARN',
      });
      if (token !== this.loadToken) return false;
      this.engine = engine;
      this.set({ kind: 'ready' });
      return true;
    } catch (err) {
      if (token !== this.loadToken) return false;
      this.teardown();
      this.set({ kind: 'error', message: classifyError(err, 'load').message });
      return false;
    }
  }

  unload(note?: string) {
    this.loadToken++;
    this.teardown();
    this.set({ kind: 'off', note });
  }

  private teardown() {
    this.worker?.terminate();
    this.worker = null;
    this.engine = null;
    this.chain = Promise.resolve();
  }

  private run<T>(fn: (engine: WebWorkerMLCEngine) => Promise<T>): Promise<T> {
    const engine = this.engine;
    if (!engine) return Promise.reject(new Error('Memory search is not loaded.'));
    const next = this.chain.then(() => fn(engine));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async embed(inputs: string[]): Promise<Float32Array[]> {
    const res = await this.run((engine) => engine.embeddings.create({ input: inputs, model: EMBED_MODEL }));
    return res.data.map((d) => Float32Array.from(d.embedding));
  }

  /** The cached embedding of a stored text, if it has been indexed. */
  vectorOf = (text: string): Float32Array | undefined => this.cache.get(text);

  /** Make sure every text has an embedding (only new ones are computed). */
  async index(texts: string[]): Promise<void> {
    if (!this.isReady) return;
    const missing = [...new Set(texts)].filter((t) => t && !this.cache.has(t));
    try {
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const vectors = await this.embed(batch);
        batch.forEach((t, j) => vectors[j] && this.cache.set(t, vectors[j]!));
      }
    } catch (err) {
      this.fail(err);
      return;
    }
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
  }

  /** Embedding of a search query, or null if it isn't ready in time. */
  async query(text: string): Promise<Float32Array | null> {
    if (!this.isReady || !text.trim()) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), QUERY_TIMEOUT_MS));
    try {
      return await Promise.race([this.embed([QUERY_PREFIX + text]).then((v) => v[0] ?? null), timeout]);
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private fail(err: unknown) {
    console.warn('[kinling ai] memory search failed; using word matching:', err);
    const info = classifyError(err, 'generate');
    if (info.code === 'device-lost' || info.code === 'out-of-memory') {
      this.teardown();
      this.set({ kind: 'error', message: 'Memory search stopped (the graphics device was reset). Turn it off and on again to retry.' });
    }
  }
}

export const embedder = new EmbeddingService();
