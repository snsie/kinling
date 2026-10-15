// Lab UI state: the open session, the session list and what is running.
// Sessions autosave to the lab's own database shortly after each change.
import { useSyncExternalStore } from 'react';
import { ai } from '../ai/engine';
import type { ArcAct, CareAction, Personality, SaveData } from '../game/types';
import { evolveNow, rerunCall, runTurn, setTraits, type LabStoreApi } from './pipeline';
import { deleteSession, freshSession, listSessions, loadSession, parseSessionFile, readGameSave, restartSession, sessionFromGame, storeSession, type FreshOptions, type SessionInfo } from './session';
import { labCare, passTime, playBeatById, setArc } from './story';
import type { CallRecord, LabConfig, LabSession } from './types';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

export interface LabState {
  session: LabSession | null;
  sessions: SessionInfo[];
  busy: string | null;
  error: string | null;
  selectedTurnId: string | null;
  scriptProgress: { done: number; total: number } | null;
  gameSave: SaveData | null;
}

let state: LabState = { session: null, sessions: [], busy: null, error: null, selectedTurnId: null, scriptProgress: null, gameSave: null };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let stopScript = false;

function set(patch: Partial<LabState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
  if ('session' in patch && state.session) scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = state.session;
    if (s) void storeSession(s).then(refreshList);
  }, 500);
}

async function refreshList() {
  set({ sessions: await listSessions() });
}

export function useLab(): LabState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const api: LabStoreApi = {
  get: () => state.session!,
  update: (fn) => set({ session: fn(state.session!) }),
};

async function run(label: string, task: () => Promise<unknown>) {
  if (state.busy || !state.session) return;
  set({ busy: label, error: null });
  try {
    await task();
  } catch (err) {
    set({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    set({ busy: null, scriptProgress: null });
  }
}

export const lab = {
  async init() {
    await refreshList();
    const latest = state.sessions[0];
    if (latest) await lab.open(latest.id);
  },
  async open(id: string) {
    const session = await loadSession(id);
    if (session) set({ session, selectedTurnId: null, error: null });
  },
  start(session: LabSession) {
    set({ session, selectedTurnId: null, error: null });
  },
  newFresh(opts: FreshOptions) {
    lab.start(freshSession(opts, Date.now(), state.session?.config));
  },
  async loadGameSave() {
    try {
      const save = await readGameSave();
      set({ gameSave: save, error: save ? null : 'No game save found in this browser yet.' });
    } catch (err) {
      set({ error: `Could not read the game save: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
  importFromGame(kinlingId: string) {
    if (state.gameSave) lab.start(sessionFromGame(state.gameSave, kinlingId, Date.now(), state.session?.config));
  },
  restart() {
    if (state.session) lab.start(restartSession(state.session, Date.now()));
  },
  async remove() {
    const s = state.session;
    if (!s) return;
    if (saveTimer) clearTimeout(saveTimer);
    await deleteSession(s.id);
    set({ session: null });
    await refreshList();
  },
  rename(name: string) {
    api.update((s) => ({ ...s, name }));
  },
  exportJson() {
    const s = state.session;
    if (!s) return;
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.name.replace(/[^\w-]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  async importJson(file: File) {
    try {
      lab.start(parseSessionFile(await file.text()));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
  updateConfig(fn: (c: LabConfig) => LabConfig) {
    api.update((s) => ({ ...s, config: fn(s.config) }));
  },
  setTraits(p: Personality) {
    if (state.session) setTraits(api, p);
  },
  selectTurn(id: string | null) {
    set({ selectedTurnId: id });
  },
  send(text: string) {
    return run('Replying…', async () => {
      set({ selectedTurnId: null });
      await runTurn(api, text);
    });
  },
  evolve() {
    return run('Evolving…', () => evolveNow(api));
  },
  rerun(call: CallRecord, messages: ChatCompletionMessageParam[], temperature: number) {
    return run('Re-running…', () => rerunCall(api, call, messages, temperature));
  },
  runScript(lines: string[]) {
    const todo = lines.map((l) => l.trim()).filter(Boolean);
    stopScript = false;
    return run('Running script…', async () => {
      for (let i = 0; i < todo.length && !stopScript; i++) {
        set({ scriptProgress: { done: i, total: todo.length }, selectedTurnId: null });
        await runTurn(api, todo[i]!);
      }
    });
  },
  passTime(hours: number) {
    if (state.session && !state.busy) passTime(api, hours);
  },
  care(action: CareAction) {
    if (state.session && !state.busy) labCare(api, action);
  },
  playBeat(id: string) {
    if (state.session && !state.busy) playBeatById(api, id);
  },
  setArc(patch: { act?: ArcAct; distress?: number; awareness?: number }) {
    if (state.session) setArc(api, patch);
  },
  stop() {
    stopScript = true;
    ai.interrupt();
  },
  dismissError() {
    set({ error: null });
  },
};
