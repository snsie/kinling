// The controller: every player action goes through here. Game rules resolve
// immediately; then sound/animation/speech; then (optionally) an AI reaction.
import { useSyncExternalStore } from 'react';
import { ai } from '../ai/engine';
import { appraiseMessage, chatReply, greet, reactTo, routeMessage, suggestFact, summarizeChat, translateAppearance, translateCare, warmRecall, writeDiary } from '../ai/companion';
import { resolveAdventure, type AdventureOutcome } from '../game/adventure';
import { applyAppraisal, growthPhrase, pendingAppraisals, reflect, shouldReflect } from '../game/appraisal';
import { performCare } from '../game/care';
import { checkAction, type ProposedAction } from '../game/careProposals';
import { greetingLine, stageUpLine } from '../game/dialogue';
import { applyEvolution, revertAppearance, type EvolutionRequest } from '../game/evolution';
import type { Feedback } from '../game/outcome';
import { addChatMessage, addDiaryEntry, addPlayerFact, extractFact, pendingDiaryEvents, removePlayerFact, forgetMemory, setChatSummary, setMemoryPinned } from '../game/social';
import { traitLabel } from '../game/traits';
import type { CareAction, FoodId, Personality, PersonalityKey, SaveData, Settings } from '../game/types';
import type { MinigameResult } from '../minigame/engine';
import { cancelSiblingHatch, startSiblingHatch } from '../game/eggs';
import { activeKinling, draft, kinlingById, selectKinling } from '../game/state';
import { playSfx } from './sfx';
import { store, type StoreSnapshot } from './store';
import { ui } from './ui';

export function useStore(): StoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function now() {
  return Date.now();
}

/** Show feedback from a rules outcome: line, animation, sound, toasts. */
export function presentFeedback(f: Feedback): void {
  if (f.line) ui.say(f.line, 'authored');
  if (f.animation) ui.animate(f.animation);
  playSfx(f.sound);
  if (f.toast) ui.toast(f.toast, f.ok ? 'success' : 'warn');
  if (f.unlocked?.length) ui.toast(`New evolution option${f.unlocked.length > 1 ? 's' : ''}: ${f.unlocked.map(traitLabel).join(', ')}`, 'success');
  // A stage-up says enough on its own; otherwise celebrate the new level.
  if (f.levelUp && !f.stageUp) ui.toast(`Your kinling reached level ${f.levelUp}!`, 'success');
  if (f.stageUp) {
    ui.toast(`Your kinling grew into a ${f.stageUp}!`, 'success');
    setTimeout(() => ui.say(stageUpLine(f.stageUp!), 'authored'), 2600);
  }
  if (f.eggArrived) ui.toast('A new egg appeared in the hollow! Hatch it from home.', 'success');
}

/** Make another kinling the one Care, Talk, Explore and Evolve act on. */
export function chooseKinling(id: string): void {
  const save = store.save;
  if (!save || save.activeKinlingId === id || readOnlyWarning()) return;
  if (store.update((s) => selectKinling(s, id), { meaningful: true })) ui.hush();
}

export function beginEggHatch(): void {
  if (readOnlyWarning()) return;
  store.update((s) => startSiblingHatch(s));
}

export function leaveEggForLater(): void {
  store.update((s) => cancelSiblingHatch(s));
}

/** If the model is ready and idle, replace the authored line with a short AI reaction. */
function maybeReact(eventText: string | undefined, delayMs = 400) {
  if (!eventText || !ai.isReady) return;
  setTimeout(() => {
    const save = store.save;
    if (!save || !activeKinling(save) || ai.isBusy) return;
    let started = false;
    void reactTo(save, eventText, now(), (t) => {
      if (!t) return;
      started = true;
      ui.stream(t);
    }).then((res) => {
      if (res) ui.say(res.text, 'ai');
      else if (started) ui.endStream();
    });
  }, delayMs);
}

function readOnlyWarning(): boolean {
  if (store.canWrite) return false;
  ui.toast('This tab is read-only because Kinling is open in another tab. Use "Play here" to switch.', 'warn');
  return true;
}

export function doCare(action: CareAction, food?: FoodId): boolean {
  const save = store.save;
  const k = save && activeKinling(save);
  if (!save || !k || readOnlyWarning()) return false;
  const out = performCare(save, k.id, action, now(), { food });
  if (out.feedback.ok) store.update(() => out.save);
  presentFeedback(out.feedback);
  if (out.feedback.ok) maybeReact(out.feedback.aiEvent);
  return out.feedback.ok;
}

/** `kinlingId` is the kinling that set out, even if another was selected meanwhile. */
export function finishAdventure(result: MinigameResult, kinlingId?: string): AdventureOutcome | null {
  const save = store.save;
  if (!save || readOnlyWarning()) return null;
  const out = resolveAdventure(save, kinlingId ?? activeKinling(save)?.id ?? '', result, now());
  if (out.feedback.ok) store.update(() => out.save);
  presentFeedback({ ...out.feedback, toast: out.feedback.ok ? undefined : out.feedback.toast });
  if (!out.feedback.ok && out.feedback.toast) ui.toast(out.feedback.toast, 'warn');
  if (out.feedback.ok) maybeReact(out.feedback.aiEvent, 900);
  return out;
}

export function doEvolve(request: EvolutionRequest): boolean {
  const save = store.save;
  const k = save && activeKinling(save);
  if (!save || !k || readOnlyWarning()) return false;
  const out = applyEvolution(save, k.id, request, now());
  if (out.feedback.ok) store.update(() => out.save);
  presentFeedback(out.feedback);
  if (out.feedback.ok) maybeReact(out.feedback.aiEvent, 700);
  return out.feedback.ok;
}

export function doRevert(): boolean {
  const save = store.save;
  const k = save && activeKinling(save);
  if (!save || !k || readOnlyWarning()) return false;
  const out = revertAppearance(save, k.id, now());
  if (out.feedback.ok) store.update(() => out.save);
  presentFeedback(out.feedback);
  return out.feedback.ok;
}

/** Run a proposed action after the player confirmed it. Re-validated against the live save. */
export function runProposedAction(action: ProposedAction): { ok: boolean; explore?: ProposedAction & { type: 'explore' } } {
  const save = store.save;
  if (!save) return { ok: false };
  const check = checkAction(save, action);
  if (!check.available) {
    ui.toast(check.reason ?? 'That is not possible right now.', 'warn');
    return { ok: false };
  }
  switch (action.type) {
    case 'feed':
      return { ok: doCare('feed', action.food) };
    case 'groom':
    case 'rest':
    case 'play':
      return { ok: doCare(action.type) };
    case 'explore':
      return { ok: true, explore: action };
  }
}

export function greetOnArrival(): void {
  const save = store.save;
  if (!save || !activeKinling(save)) return;
  const fb = store.consumeLastTick();
  if (fb?.line) presentFeedback(fb);
  else ui.say(greetingLine(save), 'authored');
}

/** Called when the model becomes ready during a session: optional AI greeting if nothing is happening. */
export function aiGreeting(): void {
  const save = store.save;
  if (!save || !activeKinling(save) || ai.isBusy) return;
  void greet(save, now(), (t) => t && ui.stream(t)).then((r) => {
    if (r) ui.say(r.text, 'ai');
  });
}

// ---------------------------------------------------------------------------
// Conversation

let chatInFlight = false;

export async function sendChat(text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || chatInFlight) return;
  const before = store.save;
  const k = before && activeKinling(before);
  if (!k || readOnlyWarning()) return;
  chatInFlight = true;
  let reply: Awaited<ReturnType<typeof respond>> = { messageId: null, offerFact: false };
  try {
    reply = await respond(k.id, clean);
  } finally {
    ui.setChatStreaming(null);
    chatInFlight = false;
  }
  void afterChat(clean, reply.offerFact ? reply.messageId : null);
}

/** Store the player's message to a kinling and answer it. Returns the reply's message id. */
async function respond(kinlingId: string, clean: string): Promise<{ messageId: string | null; offerFact: boolean }> {
  store.update((s) => addChatMessage(s, kinlingId, 'player', clean, 'player', now()));
  const save = store.save!;

  // Explicit "remember that..." facts are stored in the player's own words.
  const fact = extractFact(clean);
  if (fact) {
    const res = addPlayerFact(save, fact, now());
    if (res.fact) {
      store.update(() => res.save);
      ui.toast(`Saved to "Things you told ${kinlingById(save, kinlingId)?.name ?? 'your kinling'}"`, 'success');
    }
  }

  ui.setChatStreaming('');
  // "remember that…" is always a chat message, whatever words it contains.
  const intent = fact ? 'chat' : await routeMessage(clean);

  if (intent === 'evolve') {
    const translation = await translateAppearance(store.save!, clean, 'evolve');
    const reply = translation.reply || (translation.request.changes.length ? 'Ooh, a new look? Let\'s see what I could become!' : 'Hmm, I\'m not sure I can grow that. Want to look at my evolution options together?');
    const id = addCreatureMessage(kinlingId, reply, translation.source === 'ai' && translation.reply ? 'ai' : 'authored');
    if (id && translation.request.changes.length) ui.attach(id, { kind: 'evolution', translation, text: clean });
    return { messageId: id, offerFact: false };
  }

  if (intent === 'care') {
    const care = await translateCare(store.save!, clean, now());
    if (care.actions.length) {
      const checked = care.actions.map((a) => checkAction(store.save!, a));
      const reply = care.reply || 'Ooh, good idea! Shall we?';
      const id = addCreatureMessage(kinlingId, reply, care.source === 'ai' && care.reply ? 'ai' : 'authored');
      if (id) ui.attach(id, { kind: 'care', actions: checked });
      return { messageId: id, offerFact: false };
    }
  }

  const res = await chatReply(store.save!, clean, now(), (t) => ui.setChatStreaming(t));
  const reply = fact && !res.text ? 'I\'ll remember that!' : res.text;
  const id = addCreatureMessage(kinlingId, reply, res.source);
  ui.say(reply, res.source);
  return { messageId: id, offerFact: !fact };
}

/**
 * Low-priority work once a reply is shown: turn the conversation into
 * memories (and reflect on them when enough has piled up), offer to save a
 * fact the player shared, and fold older chat into the conversation notes.
 * Model work gives way the moment the player sends another message.
 */
async function afterChat(playerText: string, factReplyId: string | null): Promise<void> {
  const remembered = await rememberChat();
  if (!ai.isReady) return;
  // The kinling already remembered this message; asking to remember it again would be odd.
  if (factReplyId && store.save && !remembered.has(factReplyId)) {
    const fact = await suggestFact(store.save, playerText);
    if (fact) ui.attach(factReplyId, { kind: 'fact', text: fact });
  }
  const save = store.save;
  if (!save || !store.canWrite) return;
  const notes = await summarizeChat(save);
  if (notes && store.canWrite) store.update((s) => setChatSummary(s, notes.kinlingId, notes.text, notes.throughId, now()));
}

let remembering = false;

/**
 * Appraise player messages not yet remembered, oldest first, then let any
 * kinling with enough on its mind reflect. Stops early when the model is busy
 * with the player; the rest is picked up after the next message. Returns the
 * ids of the replies whose player message became a memory.
 */
async function rememberChat(): Promise<Set<string>> {
  const remembered = new Set<string>();
  if (remembering) return remembered;
  remembering = true;
  try {
    for (;;) {
      const save = store.save;
      if (!save || !store.canWrite) return remembered;
      const next = save.kinlings.flatMap((k) => pendingAppraisals(k).map((p) => ({ k, ...p })))[0];
      if (!next) break;
      const appraisal = await appraiseMessage(save, next.k.id, next.message.text, next.reply?.text ?? null);
      if (!appraisal || !store.canWrite) break;
      store.update((s) => {
        const r = applyAppraisal(s, next.k.id, next.message.id, appraisal, now());
        if (r.memory && next.reply) remembered.add(next.reply.id);
        return r.save;
      });
    }
    for (const k of store.save?.kinlings ?? []) {
      if (!store.canWrite || !shouldReflect(k, now())) continue;
      let changed: Partial<Personality> = {};
      store.update((s) => {
        const r = reflect(s, k.id, now());
        changed = r.change;
        return r.save;
      });
      const keys = Object.keys(changed) as PersonalityKey[];
      if (keys.length) ui.toast(`${k.name} has been feeling ${keys.slice(0, 2).map((key) => growthPhrase(key, changed[key]!)).join(' and ')} lately.`, 'info');
    }
  } finally {
    remembering = false;
  }
  if (store.save) warmRecall(store.save);
  return remembered;
}

function addCreatureMessage(kinlingId: string, text: string, source: 'ai' | 'authored'): string | null {
  let id: string | null = null;
  store.update((s) => {
    const next = addChatMessage(s, kinlingId, 'creature', text, source, now());
    id = next.kinlings.find((k) => k.id === kinlingId)?.chat.at(-1)?.id ?? null;
    return next;
  });
  return id;
}

export function stopGenerating(): void {
  ai.interrupt();
}

// ---------------------------------------------------------------------------
// Diary, memories, facts, settings

let diaryInFlight = false;

export async function writeDiaryEntry(onText?: (t: string) => void): Promise<boolean> {
  const save = store.save;
  if (!save || !activeKinling(save) || diaryInFlight || readOnlyWarning()) return false;
  const events = pendingDiaryEvents(save);
  if (!events.length) return false;
  diaryInFlight = true;
  try {
    const res = await writeDiary(save, events, onText);
    store.update((s) => addDiaryEntry(s, res.text, res.source, events.map((e) => e.id), now()));
    ui.toast('Diary entry written.', 'success');
    playSfx('chime');
    return true;
  } finally {
    diaryInFlight = false;
  }
}

export function addFact(text: string): boolean {
  const save = store.save;
  if (!save || readOnlyWarning()) return false;
  const res = addPlayerFact(save, text, now());
  if (!res.fact) return false;
  store.update(() => res.save);
  return true;
}

export function removeFact(id: string) {
  if (readOnlyWarning()) return;
  store.update((s) => removePlayerFact(s, id));
}

export function pinMemory(id: string, pinned: boolean) {
  if (readOnlyWarning()) return;
  store.update((s) => setMemoryPinned(s, id, pinned));
}

export function deleteMemory(id: string) {
  if (readOnlyWarning()) return;
  store.update((s) => forgetMemory(s, id));
}

export function updateSettings(fn: (s: Settings) => void) {
  store.update((save: SaveData) => {
    const next = draft(save);
    fn(next.settings);
    return next;
  });
}
