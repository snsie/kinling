// Need decay, absence handling and mood. Decay is forgiving and bounded:
// the creature can never be harmed by the player being away.
import type { Needs, NeedKey } from './types';
import { NEED_KEYS } from './types';
import { clamp } from './util';

/** Points lost per hour of game time while the player is around. */
export const DECAY_PER_HOUR: Record<NeedKey, number> = {
  hunger: 6,
  energy: 4,
  cleanliness: 3,
  happiness: 4,
};

/** Gaps longer than this between ticks count as the player being away. */
export const ABSENCE_THRESHOLD_MS = 3 * 60 * 1000;
/** At most this much absent time is ever applied, no matter how long the player was gone. */
export const ABSENCE_MAX_HOURS = 10;
/** Absence never pushes a need below these floors (needs already lower are left alone). */
export const ABSENCE_FLOOR: Record<NeedKey, number> = {
  hunger: 30,
  energy: 45,
  cleanliness: 30,
  happiness: 40,
};
/** While away the creature naps, so energy drifts up toward this level. */
export const ABSENCE_ENERGY_TARGET = 80;
export const ABSENCE_ENERGY_PER_HOUR = 8;
/** Active-play decay never goes below this floor either. */
export const ACTIVE_FLOOR = 5;

export const NEED_LABELS: Record<NeedKey, string> = {
  hunger: 'Hunger',
  energy: 'Energy',
  cleanliness: 'Cleanliness',
  happiness: 'Happiness',
};

export function clampNeeds(needs: Needs): Needs {
  const out = { ...needs };
  for (const k of NEED_KEYS) out[k] = clamp(out[k], 0, 100);
  return out;
}

export function decayActive(needs: Needs, elapsedMs: number): Needs {
  if (!(elapsedMs > 0)) return { ...needs };
  const hours = Math.min(elapsedMs, ABSENCE_THRESHOLD_MS) / 3_600_000;
  const out = { ...needs };
  for (const k of NEED_KEYS) {
    const v = needs[k];
    if (v <= ACTIVE_FLOOR) continue;
    out[k] = Math.max(ACTIVE_FLOOR, v - DECAY_PER_HOUR[k] * hours);
  }
  return out;
}

export function decayAbsent(needs: Needs, elapsedMs: number): Needs {
  if (!(elapsedMs > 0)) return { ...needs };
  const hours = Math.min(elapsedMs / 3_600_000, ABSENCE_MAX_HOURS);
  const out = { ...needs };
  for (const k of NEED_KEYS) {
    const v = needs[k];
    if (k === 'energy') {
      out.energy = v >= ABSENCE_ENERGY_TARGET ? v : Math.min(ABSENCE_ENERGY_TARGET, v + ABSENCE_ENERGY_PER_HOUR * hours);
      continue;
    }
    const floor = ABSENCE_FLOOR[k];
    if (v <= floor) continue;
    out[k] = Math.max(floor, v - DECAY_PER_HOUR[k] * hours);
  }
  return clampNeeds(out);
}

/** Advance needs by elapsed real time, choosing active or absent rules. */
export function advanceNeeds(needs: Needs, elapsedMs: number): { needs: Needs; absent: boolean } {
  if (!(elapsedMs > 0)) return { needs: { ...needs }, absent: false };
  if (elapsedMs > ABSENCE_THRESHOLD_MS) return { needs: decayAbsent(needs, elapsedMs), absent: true };
  return { needs: decayActive(needs, elapsedMs), absent: false };
}

export type Mood = 'joyful' | 'content' | 'sleepy' | 'hungry' | 'messy' | 'glum';

export function deriveMood(needs: Needs): Mood {
  if (needs.energy < 22) return 'sleepy';
  if (needs.hunger < 22) return 'hungry';
  if (needs.cleanliness < 20) return 'messy';
  if (needs.happiness < 28) return 'glum';
  const avg = (needs.hunger + needs.energy + needs.cleanliness + needs.happiness) / 4;
  if (needs.happiness >= 72 && avg >= 60) return 'joyful';
  return 'content';
}

export const MOOD_TEXT: Record<Mood, string> = {
  joyful: 'bouncy and happy',
  content: 'content',
  sleepy: 'a bit sleepy',
  hungry: 'a little peckish',
  messy: 'a bit muddy',
  glum: 'a little quiet',
};

export function needStatus(key: NeedKey, value: number): string {
  const tiers: Record<NeedKey, [string, string, string, string]> = {
    hunger: ['Hungry', 'Peckish', 'Satisfied', 'Full'],
    energy: ['Sleepy', 'Drowsy', 'Awake', 'Lively'],
    cleanliness: ['Muddy', 'Scruffy', 'Tidy', 'Sparkling'],
    happiness: ['Quiet', 'Okay', 'Happy', 'Joyful'],
  };
  const t = tiers[key];
  if (value < 25) return t[0];
  if (value < 50) return t[1];
  if (value < 80) return t[2];
  return t[3];
}
