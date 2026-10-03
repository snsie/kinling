// Ephemeral UI state (not saved): creature animation, speech bubble, toasts,
// and proposals attached to chat messages.
import { useSyncExternalStore } from 'react';
import type { CheckedAction } from '../game/careProposals';
import type { CreatureAnim } from '../game/outcome';
import type { AppearanceTranslation } from '../ai/companion';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

export interface Speech {
  text: string;
  source: 'ai' | 'authored';
  streaming: boolean;
  /** Increments with each new line so the bubble can re-announce. */
  key: number;
}

export type ChatAttachment =
  | { kind: 'care'; actions: CheckedAction[]; used?: boolean }
  | { kind: 'evolution'; translation: AppearanceTranslation; text: string }
  | { kind: 'fact'; text: string; saved?: boolean };

export interface UiState {
  anim: CreatureAnim;
  speech: Speech | null;
  toasts: Toast[];
  attachments: Record<string, ChatAttachment>;
  /** A pending evolution request handed from chat to the Evolve tab. */
  evolutionDraft: { text: string; translation: AppearanceTranslation } | null;
  tab: TabId;
  /** Streaming chat reply in progress. */
  chatStreaming: string | null;
}

export type TabId = 'talk' | 'explore' | 'bag' | 'evolve' | 'diary' | 'settings';

let state: UiState = {
  anim: 'idle',
  speech: null,
  toasts: [],
  attachments: {},
  evolutionDraft: null,
  tab: 'talk',
  chatStreaming: null,
};
const listeners = new Set<() => void>();
let animTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;
let speechKey = 1;

function set(p: Partial<UiState>) {
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export const ui = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  animate(anim: CreatureAnim, ms = anim === 'sleeping' ? 5000 : 2200) {
    if (animTimer) clearTimeout(animTimer);
    set({ anim });
    if (anim !== 'idle') animTimer = setTimeout(() => set({ anim: 'idle' }), ms);
  },
  say(text: string, source: Speech['source'] = 'authored', streaming = false) {
    set({ speech: { text, source, streaming, key: speechKey++ } });
  },
  /** Update the current line in place while streaming. */
  stream(text: string) {
    if (!state.speech) return ui.say(text, 'ai', true);
    set({ speech: { ...state.speech, text, source: 'ai', streaming: true } });
  },
  endStream() {
    if (state.speech) set({ speech: { ...state.speech, streaming: false } });
  },
  toast(text: string, tone: Toast['tone'] = 'info') {
    const t: Toast = { id: toastId++, text, tone };
    set({ toasts: [...state.toasts.slice(-3), t] });
    setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), tone === 'error' ? 7000 : 4200);
  },
  dismissToast(id: number) {
    set({ toasts: state.toasts.filter((x) => x.id !== id) });
  },
  attach(messageId: string, a: ChatAttachment) {
    set({ attachments: { ...state.attachments, [messageId]: a } });
  },
  setEvolutionDraft(d: UiState['evolutionDraft']) {
    set({ evolutionDraft: d });
  },
  setTab(tab: TabId) {
    set({ tab });
  },
  setChatStreaming(text: string | null) {
    set({ chatStreaming: text });
  },
};

export function useUi(): UiState {
  return useSyncExternalStore(ui.subscribe, ui.get, ui.get);
}
