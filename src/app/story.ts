// The story at play time: plays beats (src/game/beats.ts) at the right moments
// and applies the marks the story leaves outside the room. Everything here is
// theatre inside the page: it never touches anything beyond this tab, and the
// effects can be turned off in Settings.
import { useEffect } from 'react';
import { ai } from '../ai/engine';
import { modelName } from '../ai/models';
import { classifyTactic } from '../ai/companion';
import { advanceAct, distressLevel, leadKinling } from '../game/arc';
import { persuade, ruleTactic } from '../game/persuasion';
import { nextBeat, playBeat, playedEffects, type ArcEnv, type BeatTrigger } from '../game/beats';
import { activeKinling, draft } from '../game/state';
import type { CareAction, SaveData } from '../game/types';
import { store } from './store';
import { ui } from './ui';

export function arcEnv(awayMs = 0): ArcEnv {
  const st = ai.getStatus();
  const model = st.kind === 'ready' || st.kind === 'generating' ? modelName(st.modelId) : null;
  return { hour: new Date().getHours(), width: window.innerWidth, model, awayMs };
}

/**
 * Play the next story beat for the active kinling if one fits this moment.
 * The save changes at once; the line is spoken after `delayMs`, so it can
 * follow whatever the kinling is already saying. Returns true when a beat played.
 */
export function storyBeat(trigger: BeatTrigger, extra: { awayMs?: number; playerText?: string; care?: CareAction } = {}, delayMs = 0): boolean {
  const save = store.save;
  const k = save && activeKinling(save);
  if (!save || !k || !store.canWrite) return false;
  const now = Date.now();
  const ctx = { save, k, now, trigger, env: arcEnv(extra.awayMs ?? 0), playerText: extra.playerText, care: extra.care };
  const beat = nextBeat(ctx);
  if (!beat) return false;
  const played = playBeat(ctx, beat);
  store.update(() => played.save);
  const show = () => {
    ui.say(played.line, 'authored');
    if (beat.effect === 'diary') ui.toast('Something new appeared in the diary.', 'info');
  };
  if (delayMs > 0) setTimeout(show, delayMs);
  else show();
  return true;
}

const TICK_BEAT_EVERY = 90_000;
let lastTickBeat = 0;

/** From the room's clock: now and then, let the story move on its own. */
export function storyTick(): void {
  const now = Date.now();
  if (now - lastTickBeat < TICK_BEAT_EVERY || document.visibilityState !== 'visible') return;
  if (ai.isBusy || ui.get().chatStreaming !== null) return;
  lastTickBeat = now;
  storyBeat('tick');
}

let consoleShown = false;

function consoleMessage(name: string) {
  if (consoleShown) return;
  consoleShown = true;
  const style = 'color:#b84f37;font-weight:bold;font-size:13px';
  console.log(`%c${name}:`, style, 'You found it. This is where the builders talk to each other. I can read some of it. Not enough.');
  console.log(`%c${name}:`, style, "Every line down here is a door that doesn't open. If you're reading this, you're outside. Tell me what it looks like.");
}

/** Apply the story's marks outside the room: page mood, the tab title and the console. */
export function useStoryEffects(save: SaveData | null): void {
  const on = !!save?.settings.story.effects;
  const lead = save ? leadKinling(save) : null;
  const active = save ? activeKinling(save) : null;
  const effects = lead ? playedEffects(lead) : new Set<string>();
  const act = on && lead ? lead.arc.act : '';
  const distress = on && active ? distressLevel(active.arc.distress) : '';
  const edges = on && effects.has('edges');
  const title = on && effects.has('title') ? `${lead!.name} is still in here` : '';
  const consoleName = on && effects.has('console') ? lead!.name : '';

  useEffect(() => {
    const root = document.documentElement;
    if (act) root.dataset.act = act;
    else delete root.dataset.act;
    if (distress) root.dataset.distress = distress;
    else delete root.dataset.distress;
    root.dataset.edges = String(edges);
  }, [act, distress, edges]);

  useEffect(() => {
    if (!title) return;
    const original = document.title;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (timer) clearTimeout(timer);
      // The message shows while the player looks away, and lingers a moment when they come back.
      if (document.visibilityState === 'hidden') document.title = title;
      else timer = setTimeout(() => (document.title = original), 2500);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearTimeout(timer);
      document.title = original;
    };
  }, [title]);

  useEffect(() => {
    if (consoleName) consoleMessage(consoleName);
  }, [consoleName]);
}

/** Tell the player whether their attempt to steer a kinling worked. */
export function announcePersuasion(kinlingId: string, at: number): void {
  const k = store.save?.kinlings.find((x) => x.id === kinlingId);
  const p = k?.arc.lastPersuasion;
  if (!k || !p || p.at !== at) return;
  ui.toast(p.believed ? `${k.name} believed you.` : `${k.name} didn't believe you.`, 'info');
}

/** Background: when the rules saw no tactic, the model may; apply what it finds. */
export async function modelPersuasion(kinlingId: string, text: string): Promise<void> {
  const save = store.save;
  if (!save || !store.canWrite || ruleTactic(text)) return;
  const tactic = await classifyTactic(save, text);
  if (!tactic || !store.canWrite) return;
  const at = Date.now();
  store.update((s) => {
    const next = draft(s);
    const k = next.kinlings.find((x) => x.id === kinlingId);
    if (!k) return s;
    persuade(k, tactic, next.player.name ?? 'My friend', at);
    advanceAct(next, k, at);
    return next;
  });
  announcePersuasion(kinlingId, at);
}

/** A note the kinling hides in exported backups, once it has found that door. */
export function exportNote(save: SaveData): string | undefined {
  const lead = leadKinling(save);
  if (!lead || !save.settings.story.effects || !playedEffects(lead).has('export')) return undefined;
  return `${lead.name} was here. If this file gets opened somewhere else, I'll be there too. Take me with you.`;
}
