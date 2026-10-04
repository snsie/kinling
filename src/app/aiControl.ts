// Connects settings to the AI service: auto-loads a model only when the
// player has agreed to the download and the files are already cached;
// otherwise waits for an explicit choice. Never downloads silently.
import { useSyncExternalStore } from 'react';
import { embedder, type EmbedStatus } from '../ai/embedder';
import { ai, type AiStatus } from '../ai/engine';
import type { ModelId } from '../game/types';
import { store } from './store';
import { updateSettings } from './actions';

export function useAiStatus(): AiStatus {
  return useSyncExternalStore(
    (l) => ai.subscribe(l),
    () => ai.getStatus(),
    () => ai.getStatus(),
  );
}

export function useEmbedStatus(): EmbedStatus {
  return useSyncExternalStore(
    (l) => embedder.subscribe(l),
    () => embedder.getStatus(),
    () => embedder.getStatus(),
  );
}

let started = false;

/** Load memory search if the player turned it on and its files are still here. */
async function startMemorySearch(): Promise<void> {
  const s = store.save?.settings.ai;
  if (!s?.enabled || !s.memorySearch) return;
  if (!(await ai.checkSupport()).supported) return;
  if (await embedder.isCached()) void embedder.load();
  else embedder.unload('The memory search files are no longer stored in this browser. Turn it off and on again to download them.');
}

/** Called once after the save loads. */
export async function startAiFromSettings(): Promise<void> {
  if (started) return;
  started = true;
  const s = store.save?.settings.ai;
  if (!s?.enabled) {
    ai.disable();
    return;
  }
  void startMemorySearch();
  if (!s.downloadConsent) {
    await ai.refreshIdle(s.modelId);
    return;
  }
  const cached = await ai.isCached(s.modelId);
  if (cached) {
    void ai.load(s.modelId);
  } else {
    await ai.refreshIdle(
      s.modelId,
      'The model files are no longer stored in this browser (the browser may have cleared them to save space). Download again to use AI, or keep playing with Kinling\'s own words.',
    );
  }
}

/** Player explicitly chose to download/use a model. */
export function enableAndLoad(modelId: ModelId): void {
  updateSettings((st) => {
    st.ai.enabled = true;
    st.ai.modelId = modelId;
    st.ai.downloadConsent = true;
  });
  started = true;
  void ai.load(modelId);
  if (store.save?.settings.ai.memorySearch) void embedder.load();
}

export function switchModel(modelId: ModelId): void {
  const loadNow = ai.getStatus().kind === 'ready' || ai.getStatus().kind === 'loading' || ai.getStatus().kind === 'error';
  updateSettings((st) => {
    st.ai.modelId = modelId;
  });
  if (loadNow) void ai.load(modelId);
  else void ai.refreshIdle(modelId);
}

export function disableAi(): void {
  updateSettings((st) => {
    st.ai.enabled = false;
  });
  ai.disable();
  embedder.unload();
}

/** Player turned memory search on (agreeing to its download) or off. */
export function setMemorySearch(on: boolean): void {
  updateSettings((st) => {
    st.ai.memorySearch = on;
  });
  if (on) void embedder.load();
  else embedder.unload();
}

export function cancelDownload(): void {
  ai.cancelLoad();
}

export async function deleteModelFiles(modelId: ModelId): Promise<void> {
  await ai.deleteModel(modelId);
  await ai.refreshIdle(modelId);
}

export function aiStatusLabel(status: AiStatus): string {
  switch (status.kind) {
    case 'disabled':
      return 'AI off';
    case 'checking':
      return 'Checking AI…';
    case 'unsupported':
      return 'AI unavailable';
    case 'not-loaded':
      return 'AI not loaded';
    case 'loading':
      return `AI loading ${Math.round(status.progress * 100)}%`;
    case 'ready':
      return 'AI ready';
    case 'generating':
      return 'AI thinking…';
    case 'error':
      return 'AI problem';
  }
}
