// Feelings between kinlings (and toward the player), and the bounded way a
// conversation changes them. Every limit here is enforced in code, whoever
// proposed the change (authored rules today, the model later).
import { ensureDaily, kinlingById, playerFeelingFromBond, recordMemory } from './state';
import type { Feeling, Kinling, Personality, PersonalityKey, SaveData } from './types';
import { PLAYER_ID, TEMPERAMENT_KEYS } from './types';
import { clamp } from './util';

export const FEELING_FLOOR = -30;
export const FEELING_MAX = 100;
/** Feelings toward the player never drop below this. */
export const PLAYER_FLOOR = 0;
/** Kinlings drift toward partners they feel this warm about… */
export const WARM = 40;
/** …and away from (and avoid) partners they feel this cool about. */
export const COOL = -10;

/** Most one conversation can move a feeling. */
export const PER_CONVERSATION = { warmth: 3, trust: 2 } as const;
/** Most one kinling's feelings toward one partner can move in a day. */
export const DAILY_PAIR_CAP = { warmth: 6, trust: 4 } as const;
/** Familiarity gained from a topic the pair hasn't talked about in the last day. */
export const NEW_TOPIC_FAMILIARITY = 2;
export const TOPIC_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Personality change per participant per conversation, per trait per day, and over a lifetime. */
export const SOCIAL_STEP = 1;
export const SOCIAL_TRAIT_DAILY_CAP = 3;
export const DRIFT_LIMIT = 15;

export interface FeelingDelta {
  warmth: number;
  trust: number;
}

export interface SocialOutcome {
  a: string;
  b: string;
  topic: string;
  feelings: { aToB: FeelingDelta; bToA: FeelingDelta };
  /** Traits the partners may sway each other on (code decides direction and size). */
  influence?: PersonalityKey[];
  /** What each remembers of the conversation, already checked. */
  memoryA: string | null;
  memoryB: string | null;
}

export interface AppliedSocial {
  familiarity: number;
  aToB: FeelingDelta;
  bToA: FeelingDelta;
  personality: Record<string, Partial<Personality>>;
}

/** Feelings two kinlings start with when they first meet. */
export function firstMeeting(from: string, to: string): Feeling {
  return { from, to, warmth: 15, trust: 10, familiarity: 0, topics: [] };
}

/** The feeling record from → to, created (on a draft) if it doesn't exist yet. */
export function ensureFeeling(save: SaveData, from: string, to: string): Feeling {
  let f = save.feelings.find((x) => x.from === from && x.to === to);
  if (!f) {
    f = to === PLAYER_ID ? playerFeelingFromBond(from, kinlingById(save, from)?.bond ?? 0) : firstMeeting(from, to);
    save.feelings.push(f);
  }
  return f;
}

/** Apply a feeling change within the per-conversation, per-day and range limits. Returns what changed. */
export function changeFeeling(k: Kinling, f: Feeling, want: FeelingDelta, now: number): FeelingDelta {
  ensureDaily(k, now);
  const used = (k.socialDaily.feelingDelta[f.to] ??= { warmth: 0, trust: 0 });
  const floor = f.to === PLAYER_ID ? PLAYER_FLOOR : FEELING_FLOOR;
  const applied: FeelingDelta = { warmth: 0, trust: 0 };
  for (const key of ['warmth', 'trust'] as const) {
    const per = PER_CONVERSATION[key];
    const cap = DAILY_PAIR_CAP[key];
    let step = clamp(Math.round(want[key] || 0), -per, per);
    step = step > 0 ? Math.min(step, cap - used[key]) : Math.max(step, -cap - used[key]);
    const before = f[key];
    f[key] = clamp(before + step, floor, FEELING_MAX);
    applied[key] = f[key] - before;
    used[key] += applied[key];
  }
  return applied;
}

/**
 * One step of personality influence: toward the partner when warm, away when
 * cool, on the trait where they differ most. Bounded per day and to ±15 of
 * the kinling's baseline, so kinlings stay distinct instead of converging.
 */
function sway(k: Kinling, partner: Kinling, warmth: number, traits: readonly PersonalityKey[], now: number): Partial<Personality> {
  if (warmth > COOL && warmth < WARM) return {};
  ensureDaily(k, now);
  const toward = warmth >= WARM;
  const order = [...traits].sort((x, y) => Math.abs(partner.personality[y] - k.personality[y]) - Math.abs(partner.personality[x] - k.personality[x]));
  for (const key of order) {
    const diff = partner.personality[key] - k.personality[key];
    if (diff === 0) continue;
    const step = (toward ? Math.sign(diff) : -Math.sign(diff)) * SOCIAL_STEP;
    const used = k.socialDaily.socialPersonality[key];
    if (Math.abs(used + step) > SOCIAL_TRAIT_DAILY_CAP) continue;
    const next = k.personality[key] + step;
    if (next < 0 || next > 100 || Math.abs(next - k.baseline[key]) > DRIFT_LIMIT) continue;
    k.personality[key] = next;
    k.socialDaily.socialPersonality[key] = used + step;
    return { [key]: step };
  }
  return {};
}

/** Prune topics older than a day; true if `topic` is new to the pair. */
function noteTopic(f: Feeling, g: Feeling, topic: string, now: number): boolean {
  for (const x of [f, g]) x.topics = x.topics.filter((t) => now - t.at < TOPIC_WINDOW_MS && t.at <= now);
  const fresh = !f.topics.some((t) => t.topic === topic) && !g.topics.some((t) => t.topic === topic);
  if (fresh) {
    for (const x of [f, g]) {
      x.topics.push({ topic, at: now });
      if (x.topics.length > 8) x.topics.splice(0, x.topics.length - 8);
    }
  }
  return fresh;
}

/** Apply a conversation's outcome to a draft save. Unknown kinlings make it a no-op. */
export function applySocialOutcome(save: SaveData, outcome: SocialOutcome, now: number): AppliedSocial {
  const none: AppliedSocial = { familiarity: 0, aToB: { warmth: 0, trust: 0 }, bToA: { warmth: 0, trust: 0 }, personality: {} };
  const a = kinlingById(save, outcome.a);
  const b = kinlingById(save, outcome.b);
  if (!a || !b || a === b) return none;
  const ab = ensureFeeling(save, a.id, b.id);
  const ba = ensureFeeling(save, b.id, a.id);

  const familiarity = noteTopic(ab, ba, outcome.topic, now) ? NEW_TOPIC_FAMILIARITY : 0;
  for (const f of [ab, ba]) f.familiarity = clamp(f.familiarity + familiarity, 0, 100);
  const aToB = changeFeeling(a, ab, outcome.feelings.aToB, now);
  const bToA = changeFeeling(b, ba, outcome.feelings.bToA, now);

  // Both sway from the personalities as they were before this conversation.
  // Siblings rub off on each other's temperament; the story traits are each kinling's own.
  const traits = outcome.influence?.filter((t) => (TEMPERAMENT_KEYS as readonly string[]).includes(t)) ?? TEMPERAMENT_KEYS;
  const aBefore = { ...a, personality: { ...a.personality } };
  const personality: Record<string, Partial<Personality>> = {
    [a.id]: sway(a, b, ab.warmth, traits, now),
    [b.id]: sway(b, aBefore, ba.warmth, traits, now),
  };

  const tags = (other: Kinling) => [outcome.topic, other.name.toLowerCase(), 'friend'];
  if (outcome.memoryA) recordMemory(a, { kind: 'kinling-chat', text: outcome.memoryA, tags: tags(b), importance: 1, withIds: [b.id] }, now);
  if (outcome.memoryB) recordMemory(b, { kind: 'kinling-chat', text: outcome.memoryB, tags: tags(a), importance: 1, withIds: [a.id] }, now);
  return { familiarity, aToB, bToA, personality };
}

/** How `f.from` feels about someone, as a short verb phrase. */
export function feelingVerb(f: Feeling): string {
  if (f.warmth >= 70) return 'adores';
  if (f.warmth <= -20) return 'avoids';
  if (f.warmth <= COOL) return 'wary of';
  if (f.trust >= 60) return 'trusts';
  if (f.warmth >= WARM) return 'likes';
  if (f.familiarity < 10) return 'getting to know';
  return 'friendly with';
}

function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]!;
}

/**
 * e.g. ["adores Pip", "wary of Fig", "trusts you"], kinlings before the
 * player, with names sharing a feeling grouped ("likes Pip and you").
 */
export function describeFeelings(save: SaveData, kinlingId: string): string[] {
  const mine = save.feelings.filter((f) => f.from === kinlingId);
  const kin = mine.filter((f) => f.to !== PLAYER_ID).map((f) => ({ f, name: kinlingById(save, f.to)?.name ?? '' })).filter((x) => x.name);
  const player = mine.filter((f) => f.to === PLAYER_ID).map((f) => ({ f, name: 'you' }));
  const groups = new Map<string, string[]>();
  for (const { f, name } of [...kin, ...player]) {
    const verb = feelingVerb(f);
    groups.set(verb, [...(groups.get(verb) ?? []), name]);
  }
  return [...groups].map(([verb, names]) => `${verb} ${joinNames(names)}`);
}
