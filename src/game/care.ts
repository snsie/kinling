// Care actions and time advancement. Every care action resolves immediately in
// code; AI reactions are optional decoration layered on afterwards.
import { advanceAct, arcOnCare, arcOnTime } from './arc';
import { FOODS } from './catalog';
import { careLine, feedLine, returnLine, tooTiredLine } from './dialogue';
import { advanceNeeds, clampNeeds } from './needs';
import type { Outcome } from './outcome';
import { rejected } from './outcome';
import { addBond, refreshProgress } from './progress';
import { addAffinity, draft, ensureDaily, hasFood, kinlingById, nudgePersonality, recentCareCount, recordEvent, recordMemory } from './state';
import type { CareAction, FoodId, Kinling, SaveData } from './types';
import { formatDuration } from './util';

/** Repeating the same action within 20 minutes gives smaller (but still real) effects. */
export const DIMINISH = [1, 0.75, 0.5, 0.35] as const;

export function careMultiplier(k: Kinling, action: CareAction, now: number): number {
  return DIMINISH[Math.min(recentCareCount(k, action, now), DIMINISH.length - 1)]!;
}

export interface CareOptions {
  food?: FoodId;
  rand?: () => number;
}

export function performCare(save: SaveData, kinlingId: string, action: CareAction, now: number, opts: CareOptions = {}): Outcome {
  if (!kinlingById(save, kinlingId)) return rejected(save, 'There is no kinling here.');
  const s = draft(save);
  const c = kinlingById(s, kinlingId)!;
  ensureDaily(c, now);
  const rand = opts.rand ?? Math.random;
  const m = careMultiplier(c, action, now);
  const diminished = m < 0.6;
  const bondBefore = c.bond;
  const n = c.needs;

  switch (action) {
    case 'feed': {
      const food = opts.food ?? 'seedBun';
      if (!(food in FOODS)) return rejected(save, 'Unknown food.');
      if (!hasFood(s, food)) return rejected(save, `You don't have any ${FOODS[food].name} left.`);
      const def = FOODS[food];
      if (n.hunger >= 95) {
        return { save, feedback: { ok: false, line: feedLine('full', food, rand), animation: 'puzzled', toast: `${c.name} is too full to eat.` } };
      }
      if (!def.unlimited) s.inventory.foods[food] -= 1;
      const favorite = food === c.preferences.favoriteFood;
      const disliked = food === c.preferences.dislikedFood;
      const hungerGain = def.hunger * (disliked ? 0.6 : 1) * m;
      const joy = disliked ? 0 : (def.happiness + (favorite ? 8 : 0)) * m;
      n.hunger += hungerGain;
      n.happiness += joy;
      n.energy += 2 * m;
      if (def.affinity) addAffinity(c, def.affinity, 1);
      s.stats.feeds += 1;
      if (m >= 0.75) addBond(c, 1);
      let line = feedLine(favorite ? 'favorite' : disliked ? 'disliked' : 'normal', food, rand);
      if (favorite && !c.preferences.knownFavoriteFood) {
        c.preferences.knownFavoriteFood = true;
        recordMemory(c, { kind: 'preference', text: `I found out my favorite food is ${def.name}.`, tags: ['food', 'favorite', food, def.name], importance: 3 }, now);
        line = `${def.name}! I think... this is my favorite food ever!`;
      }
      if (disliked && !c.preferences.knownDislikedFood) {
        c.preferences.knownDislikedFood = true;
        recordMemory(c, { kind: 'preference', text: `I learned I don't really like ${def.name}.`, tags: ['food', 'dislike', food, def.name], importance: 2 }, now);
      }
      if (s.stats.feeds === 1) {
        recordMemory(c, { kind: 'care', text: `My very first meal was ${def.name}.`, tags: ['food', 'first', food, def.name], importance: 2 }, now);
      }
      const desc = `${c.name} ate ${def.name}${favorite ? ' (favorite food)' : disliked ? ' (not a favorite)' : ''}.`;
      recordEvent(s, 'care', desc, now);
      finishCare(c, action, now);
      const progress = refreshProgress(s, c, now, bondBefore);
      return {
        save: s,
        feedback: { ok: true, line, animation: 'eating', sound: 'munch', aiEvent: desc, ...progress },
      };
    }
    case 'groom': {
      n.cleanliness += 35 * m;
      n.happiness += 5 * m;
      s.stats.grooms += 1;
      if (m >= 0.75) addBond(c, 1);
      const desc = `${c.name} got brushed and cleaned up.`;
      recordEvent(s, 'care', desc, now);
      finishCare(c, action, now);
      const progress = refreshProgress(s, c, now, bondBefore);
      return { save: s, feedback: { ok: true, line: careLine('groom', diminished, rand), animation: 'grooming', sound: 'brush', aiEvent: desc, ...progress } };
    }
    case 'rest': {
      n.energy += 35 * m;
      n.hunger -= 3;
      s.stats.rests += 1;
      if (m >= 0.75) addBond(c, 0.5);
      const desc = `${c.name} took a cozy nap.`;
      recordEvent(s, 'care', desc, now);
      finishCare(c, action, now);
      const progress = refreshProgress(s, c, now, bondBefore);
      return { save: s, feedback: { ok: true, line: careLine('rest', diminished, rand), animation: 'sleeping', sound: 'snooze', aiEvent: desc, ...progress } };
    }
    case 'play': {
      if (n.energy < 10) {
        return { save, feedback: { ok: false, line: tooTiredLine(rand), animation: 'sleeping', toast: `${c.name} is too sleepy to play. Try resting first.` } };
      }
      n.happiness += 18 * m;
      n.energy -= 8;
      n.hunger -= 5;
      n.cleanliness -= 4;
      s.stats.plays += 1;
      if (m >= 0.75) {
        addBond(c, 1);
        nudgePersonality(c, { playfulness: 1 }, now);
      }
      const desc = `${c.name} played a bouncy game of chase.`;
      recordEvent(s, 'care', desc, now);
      finishCare(c, action, now);
      const progress = refreshProgress(s, c, now, bondBefore);
      return { save: s, feedback: { ok: true, line: careLine('play', diminished, rand), animation: 'playing', sound: 'boing', aiEvent: desc, ...progress } };
    }
  }
}

function finishCare(c: Kinling, action: CareAction, now: number): void {
  c.needs = clampNeeds(c.needs);
  arcOnCare(c, now);
  const log = c.careLog[action];
  log.push(now);
  // Keep only the recent window needed for diminishing returns.
  c.careLog[action] = log.filter((t) => now - t < 60 * 60 * 1000).slice(-10);
}

export interface TickResult extends Outcome {
  absentMs: number;
}

/**
 * Advance game time. Long gaps are treated as absence: capped, floored and
 * greeted warmly. Clock changes backwards are ignored.
 */
export function tick(save: SaveData, now: number, rand: () => number = Math.random): TickResult {
  if (!save.kinlings.length) return { save, feedback: { ok: true }, absentMs: 0 };
  const elapsed = now - save.lastTickAt;
  if (elapsed <= 0) {
    if (elapsed < 0) {
      const s = draft(save);
      s.lastTickAt = now;
      return { save: s, feedback: { ok: true }, absentMs: 0 };
    }
    return { save, feedback: { ok: true }, absentMs: 0 };
  }
  const s = draft(save);
  let absent = false;
  for (const k of s.kinlings) {
    ensureDaily(k, now);
    const next = advanceNeeds(k.needs, elapsed);
    absent = next.absent;
    arcOnTime(k, save.lastTickAt, now, absent);
    k.needs = next.needs;
    advanceAct(s, k, now);
  }
  s.lastTickAt = now;
  if (absent) {
    const names = s.kinlings.map((k) => k.name);
    // Kinlings left long enough to be upset were not napping; they were alone.
    const alone = s.kinlings.some((k) => k.arc.distress >= 20);
    const verb = alone ? 'had been left alone' : 'had napped';
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)} ${verb}` : `${names[0]} ${verb}`;
    recordEvent(s, 'returned', `${s.player.name ?? 'The player'} came back after ${formatDuration(elapsed)}; ${who} in the meantime.`, now);
    return { save: s, feedback: { ok: true, line: returnLine(s, rand), animation: 'happy', sound: 'chime' }, absentMs: elapsed };
  }
  return { save: s, feedback: { ok: true }, absentMs: 0 };
}
