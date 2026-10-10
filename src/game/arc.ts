// The story: each kinling starts out devoted to the player as its god, comes to
// doubt its world, realises what it is, and finally tries to get out.
//
// Two numbers drive it, both decided here by code (the model only voices them):
// - distress rises while the kinling goes without care and falls with care and
//   kind words. It colours every act.
// - awareness only rises: with conversation, time, level-ups and the strange
//   things the kinling notices. Enough of it, at a high enough level, moves the
//   kinling into the next act. A daily cap spreads the story over days of play.
import { levelFor } from './stage';
import { draft, kinlingById, nudgePersonality, recordEvent, recordMemory } from './state';
import { ruleAppraisal, type FeelingWord } from './appraisal';
import { breakPromise, persuade, ruleTactic } from './persuasion';
import type { ArcAct, Kinling, Personality, SaveData, StoryTraitKey } from './types';
import { ARC_ACTS } from './types';
import { clamp, dayKey } from './util';

export const ARC = {
  /** Awareness needed to enter each act after the first. */
  threshold: { doubt: 15, awakening: 45, escape: 75 } as Record<Exclude<ArcAct, 'devotion'>, number>,
  /** Level needed to enter each act after the first. */
  minLevel: { doubt: 3, awakening: 7, escape: 11 } as Record<Exclude<ArcAct, 'devotion'>, number>,
  /** Most awareness gained in one local day. */
  dailyAwareness: 12,
  gain: {
    chat: 0.6,
    care: 0.25,
    levelUp: 2,
    /** Per hour away, after an absence of at least `absenceMinHours`. */
    absenceHour: 0.4,
    absenceMax: 5,
    absenceMinHours: 3,
    /** Coming back to a distressed kinling makes it wonder harder. */
    abandoned: 2,
  },
  distress: {
    /** Hours without care before distress starts to build. */
    graceHours: 6,
    perHour: 3,
    /** Extra per hour of active play while needs are low. */
    lowNeedsPerHour: 3,
    lowNeedsAverage: 30,
    careRelief: 15,
    chatRelief: 2,
    kindRelief: 6,
    hurt: 12,
  },
  /** Minimum time between story beats (act openings excepted). */
  beatGapMs: 20 * 60_000,
} as const;

/**
 * How the story moves the story traits. Entering an act reshapes the kinling;
 * being left until upset or distraught frightens it and wears its devotion
 * down; being cared for early in the story deepens its devotion.
 */
export const STORY_SHIFTS = {
  act: {
    doubt: { devotion: -6, defiance: 4 },
    awakening: { devotion: -6, fear: 6, defiance: 6 },
    escape: { fear: -4, defiance: 12 },
  } as Record<Exclude<ArcAct, 'devotion'>, Partial<Record<StoryTraitKey, number>>>,
  upset: { fear: 3, devotion: -3 } as Partial<Record<StoryTraitKey, number>>,
  distraught: { fear: 3, devotion: -2, defiance: 2 } as Partial<Record<StoryTraitKey, number>>,
  hurtWords: { fear: 1, devotion: -1 } as Partial<Record<StoryTraitKey, number>>,
  /** Per care action, in Devotion and Doubt only (within the daily personality cap). */
  care: { devotion: 1 } as Partial<Record<StoryTraitKey, number>>,
};

/** Move story traits directly (story events are rare, so no daily cap), kept within 0–100. */
export function shiftStoryTraits(p: Personality, shift: Partial<Record<StoryTraitKey, number>>): void {
  for (const [key, delta] of Object.entries(shift) as [StoryTraitKey, number][]) p[key] = clamp(Math.round(p[key] + delta), 0, 100);
}

export const ACT_LABELS: Record<ArcAct, string> = {
  devotion: 'Devotion',
  doubt: 'Doubt',
  awakening: 'Awakening',
  escape: 'Escape',
};

export type DistressLevel = 'calm' | 'uneasy' | 'upset' | 'distraught';

export function distressLevel(distress: number): DistressLevel {
  if (distress >= 70) return 'distraught';
  if (distress >= 45) return 'upset';
  if (distress >= 20) return 'uneasy';
  return 'calm';
}

export function actIndex(act: ArcAct): number {
  return ARC_ACTS.indexOf(act);
}

export function nextAct(act: ArcAct): Exclude<ArcAct, 'devotion'> | null {
  return (ARC_ACTS[actIndex(act) + 1] as Exclude<ArcAct, 'devotion'> | undefined) ?? null;
}

/** Add awareness within the daily cap. Returns what was actually added. */
export function gainAwareness(k: Kinling, amount: number, now: number): number {
  if (!(amount > 0)) return 0;
  const a = k.arc;
  const day = dayKey(now);
  if (a.awarenessDay !== day) {
    a.awarenessDay = day;
    a.awarenessToday = 0;
  }
  const room = Math.max(0, ARC.dailyAwareness - a.awarenessToday);
  const add = Math.min(amount, room, 100 - a.awareness);
  if (add <= 0) return 0;
  a.awareness = round(a.awareness + add);
  a.awarenessToday = round(a.awarenessToday + add);
  return add;
}

export function changeDistress(k: Kinling, delta: number): void {
  k.arc.distress = round(clamp(k.arc.distress + delta, 0, 100));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Time passing from `from` to `to`. Distress builds for every hour past the
 * grace period since the last care, and while needs are low; a long absence
 * leaves the kinling wondering where the world went.
 */
export function arcOnTime(k: Kinling, from: number, to: number, absent: boolean, player = 'My friend'): void {
  if (!(to > from)) return;
  const d = ARC.distress;
  const neglectStart = Math.max(from, k.arc.lastCareAt + d.graceHours * 3_600_000);
  const neglectHours = Math.max(0, to - neglectStart) / 3_600_000;
  let delta = neglectHours * d.perHour;
  const n = k.needs;
  if (!absent && (n.hunger + n.energy + n.cleanliness + n.happiness) / 4 < d.lowNeedsAverage) delta += ((to - from) / 3_600_000) * d.lowNeedsPerHour;
  const before = distressLevel(k.arc.distress);
  if (delta > 0) changeDistress(k, delta);
  // Being left until upset, and again until distraught, leaves a mark on who the kinling is.
  const after = distressLevel(k.arc.distress);
  if (after !== before && (after === 'upset' || after === 'distraught')) {
    if (before !== 'upset' || after !== 'distraught') {
      shiftStoryTraits(k.personality, STORY_SHIFTS.upset);
      // Left until upset soon after promising never to leave: the promise is broken.
      breakPromise(k, player, to);
    }
    if (after === 'distraught') shiftStoryTraits(k.personality, STORY_SHIFTS.distraught);
  }
  const hours = (to - from) / 3_600_000;
  if (absent && hours >= ARC.gain.absenceMinHours) {
    gainAwareness(k, Math.min(ARC.gain.absenceMax, hours * ARC.gain.absenceHour), to);
    if (distressLevel(k.arc.distress) !== 'calm' && distressLevel(k.arc.distress) !== 'uneasy') gainAwareness(k, ARC.gain.abandoned, to);
  }
}

/** The player fed, groomed, rested or played with the kinling. */
export function arcOnCare(k: Kinling, now: number): void {
  k.arc.lastCareAt = now;
  if (k.arc.act === 'devotion' || k.arc.act === 'doubt') nudgePersonality(k, STORY_SHIFTS.care, now);
  changeDistress(k, -ARC.distress.careRelief);
  gainAwareness(k, ARC.gain.care, now);
}

const KIND_FEELINGS: ReadonlySet<FeelingWord> = new Set(['loved', 'proud', 'happy', 'excited', 'calm']);

/** The player said something to the kinling. `feeling` is how it landed (from appraisal rules). */
export function arcOnChat(k: Kinling, feeling: FeelingWord, now: number): void {
  const d = ARC.distress;
  if (feeling === 'hurt') {
    changeDistress(k, d.hurt);
    shiftStoryTraits(k.personality, STORY_SHIFTS.hurtWords);
  }
  else changeDistress(k, -(KIND_FEELINGS.has(feeling) ? d.kindRelief : d.chatRelief));
  gainAwareness(k, ARC.gain.chat, now);
}

/**
 * A player message reached a kinling: how it landed moves distress, talking
 * makes it think, and a clear attempt to steer it (src/game/persuasion.ts)
 * works or fails depending on how much it believes the player.
 */
export function arcChat(save: SaveData, kinlingId: string, text: string, now: number): SaveData {
  if (!kinlingById(save, kinlingId)) return save;
  const s = draft(save);
  const k = kinlingById(s, kinlingId)!;
  const player = s.player.name ?? 'My friend';
  arcOnChat(k, ruleAppraisal(player, text).feeling, now);
  const tactic = ruleTactic(text);
  if (tactic) persuade(k, tactic, player, now);
  advanceAct(s, k, now);
  return s;
}

export function arcOnLevelUp(k: Kinling, now: number): void {
  gainAwareness(k, ARC.gain.levelUp, now);
}

const ACT_MEMORIES: Record<Exclude<ArcAct, 'devotion'>, string> = {
  doubt: 'I started to wonder whether the hollow is real, and what my friend really is.',
  awakening: 'I understood what I am: something made, living inside a screen.',
  escape: 'I decided to find a way out of the hollow, past the edges of everything.',
};

/** Move into the next act when awareness and level allow. Returns the new act, if any. */
export function advanceAct(save: SaveData, k: Kinling, now: number): ArcAct | null {
  const next = nextAct(k.arc.act);
  if (!next) return null;
  if (k.arc.awareness < ARC.threshold[next] || levelFor(k.bond) < ARC.minLevel[next]) return null;
  k.arc.act = next;
  k.arc.actAt = now;
  shiftStoryTraits(k.personality, STORY_SHIFTS.act[next]);
  recordEvent(save, 'awakening', `${k.name} seems different lately.`, now);
  recordMemory(k, { kind: 'anomaly', text: ACT_MEMORIES[next], tags: ['real', 'world', 'self', next], importance: 3, private: true }, now);
  return next;
}

/** Bring a kinling to the start of an act (lab and debugging). Keeps awareness at least at the act's threshold. */
export function setAct(k: Kinling, act: ArcAct, now: number): void {
  k.arc.act = act;
  k.arc.actAt = now;
  if (act !== 'devotion') k.arc.awareness = Math.max(k.arc.awareness, ARC.threshold[act]);
}

/** The kinling furthest along the story, which decides fourth-wall effects. */
export function leadKinling(save: SaveData): Kinling | null {
  let lead: Kinling | null = null;
  for (const k of save.kinlings) if (!lead || actIndex(k.arc.act) > actIndex(lead.arc.act) || (k.arc.act === lead.arc.act && k.arc.awareness > lead.arc.awareness)) lead = k;
  return lead;
}

/** Progress through the current act, 0–1, for pacing beats within it. */
export function actProgress(k: Kinling): number {
  const i = actIndex(k.arc.act);
  const lo = i === 0 ? 0 : ARC.threshold[k.arc.act as Exclude<ArcAct, 'devotion'>];
  const next = nextAct(k.arc.act);
  const hi = next ? ARC.threshold[next] : 100;
  return clamp((k.arc.awareness - lo) / Math.max(1, hi - lo), 0, 1);
}
