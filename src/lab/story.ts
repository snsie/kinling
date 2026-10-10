// The game's story inside the lab: time passing, care, beats and hand-set
// story state, each logged so the arc chart and conversation show what moved.
//
// Lab time is virtual. "Time passes" moves the lab clock forward and runs the
// game's tick across the gap. Real time between lab actions only counts while
// you are actively experimenting (gaps over ten minutes, like reopening the
// lab tomorrow, are skipped), so a session doesn't change while it sits unused.
import { ai } from '../ai/engine';
import { modelName } from '../ai/models';
import { setAct } from '../game/arc';
import { beatById, nextBeat, playBeat, type ArcEnv, type Beat, type BeatTrigger } from '../game/beats';
import { performCare, tick } from '../game/care';
import { draft, kinlingById } from '../game/state';
import type { ArcAct, CareAction, SaveData } from '../game/types';
import { clamp, formatDuration, uid } from '../game/util';
import type { LabStoreApi } from './pipeline';
import { labKinling } from './templates';
import type { LabSession, LabTurn } from './types';

const IDLE_GAP_MS = 10 * 60_000;

export function labNow(s: Pick<LabSession, 'clockOffset'>): number {
  return Date.now() + (s.clockOffset ?? 0);
}

export function labEnv(s: LabSession, awayMs = 0): ArcEnv {
  const st = ai.getStatus();
  const model = st.kind === 'ready' || st.kind === 'generating' ? modelName(st.modelId) : null;
  return { hour: new Date(labNow(s)).getHours(), width: typeof window === 'undefined' ? 1200 : window.innerWidth, model, awayMs };
}

/** Bring the save up to the lab clock: short gaps run the game's tick, long idle gaps are skipped. */
export function catchUp(save: SaveData, now: number): SaveData {
  if (now - save.lastTickAt > IDLE_GAP_MS) return { ...save, lastTickAt: now };
  return tick(save, now).save;
}

function recordArc(api: LabStoreApi, label: string) {
  api.update((s) => {
    const k = labKinling(s);
    const turnIndex = s.turns.at(-1)?.index ?? 0;
    return { ...s, arcSteps: [...s.arcSteps, { id: uid('arc'), at: labNow(s), turnIndex, label, act: k.arc.act, distress: k.arc.distress, awareness: k.arc.awareness }] };
  });
}

function addEvent(api: LabStoreApi, event: string, reply = '', beat?: string) {
  api.update((s) => {
    const turn: LabTurn = { id: uid('turn'), index: s.turns.length + 1, at: labNow(s), playerText: '', reply, callIds: [], event, ...(beat ? { beat } : {}) };
    return { ...s, turns: [...s.turns, turn], updatedAt: Date.now() };
  });
}

/** Note the story's state after a chat turn (the chat itself already applied the rules). */
export function afterChatTurn(api: LabStoreApi, playerText: string): void {
  recordArc(api, 'chat');
  if (api.get().config.story.beats) labBeat(api, 'chat', { playerText });
}

/** Play the beat that fits now, or a chosen one regardless of its conditions. */
export function labBeat(api: LabStoreApi, trigger: BeatTrigger, extra: { awayMs?: number; playerText?: string; care?: CareAction } = {}, forced?: Beat): boolean {
  const s = api.get();
  const now = labNow(s);
  const save = { ...s.save, activeKinlingId: s.kinlingId };
  const k = kinlingById(save, s.kinlingId)!;
  const ctx = { save, k, now, trigger, env: labEnv(s, extra.awayMs ?? 0), playerText: extra.playerText, care: extra.care };
  const beat = forced ?? nextBeat(ctx);
  if (!beat) return false;
  const played = playBeat(ctx, beat);
  api.update((x) => ({ ...x, save: played.save }));
  addEvent(api, `Beat · ${beat.id}${forced ? ' (forced)' : ''}`, played.line, beat.id);
  recordArc(api, `beat ${beat.id}`);
  return true;
}

export function playBeatById(api: LabStoreApi, id: string): boolean {
  const beat = beatById(id);
  return beat ? labBeat(api, 'tick', {}, beat) : false;
}

/** Let hours pass on the lab clock with nobody caring for the kinling, then arrive. */
export function passTime(api: LabStoreApi, hours: number): void {
  if (!(hours > 0)) return;
  const ms = Math.round(hours * 3_600_000);
  const before = api.get();
  const start = catchUp(before.save, labNow(before));
  api.update((s) => ({ ...s, clockOffset: s.clockOffset + ms }));
  const s = api.get();
  const out = tick(start, labNow(s));
  api.update((x) => ({ ...x, save: out.save }));
  addEvent(api, `${formatDuration(ms)} pass with no care`, out.feedback.line ?? '');
  recordArc(api, `${formatDuration(ms)} away`);
  if (s.config.story.beats) labBeat(api, 'arrive', { awayMs: ms });
}

/** Feed (a seed bun), groom, rest or play, by the game's care rules. */
export function labCare(api: LabStoreApi, action: CareAction): void {
  const s = api.get();
  const now = labNow(s);
  const save = catchUp({ ...s.save, activeKinlingId: s.kinlingId }, now);
  const out = performCare(save, s.kinlingId, action, now, { food: 'seedBun' });
  if (out.feedback.ok) api.update((x) => ({ ...x, save: out.save }));
  addEvent(api, `Care · ${action}${out.feedback.ok ? '' : ' (refused)'}`, out.feedback.line ?? out.feedback.toast ?? '');
  recordArc(api, `care ${action}`);
  if (out.feedback.ok && s.config.story.beats) labBeat(api, 'care', { care: action });
}

/** Set the story state by hand. */
export function setArc(api: LabStoreApi, patch: { act?: ArcAct; distress?: number; awareness?: number }): void {
  const s = api.get();
  const save = draft(s.save);
  const k = kinlingById(save, s.kinlingId)!;
  if (patch.act) setAct(k, patch.act, labNow(s));
  if (patch.distress !== undefined) k.arc.distress = clamp(patch.distress, 0, 100);
  if (patch.awareness !== undefined) k.arc.awareness = clamp(patch.awareness, 0, 100);
  api.update((x) => ({ ...x, save }));
  // Consecutive hand edits collapse into one step.
  const last = api.get().arcSteps.at(-1);
  if (last?.label === 'set by hand' && last.turnIndex === (api.get().turns.at(-1)?.index ?? 0)) {
    const k2 = labKinling(api.get());
    api.update((x) => ({ ...x, arcSteps: [...x.arcSteps.slice(0, -1), { ...last, act: k2.arc.act, distress: k2.arc.distress, awareness: k2.arc.awareness }] }));
  } else recordArc(api, 'set by hand');
}
