import { describe, expect, it } from 'vitest';
import { performCare, tick } from '../src/game/care';
import {
  ABSENCE_FLOOR,
  ABSENCE_MAX_HOURS,
  ABSENCE_THRESHOLD_MS,
  advanceNeeds,
  decayAbsent,
  decayActive,
  DECAY_PER_HOUR,
} from '../src/game/needs';
import { hatchedSave, HOUR, kin, MIN, T0 } from './helpers';

const full = { hunger: 100, energy: 100, cleanliness: 100, happiness: 100 };

describe('need decay', () => {
  it('decays slowly while the player is around', () => {
    const n = decayActive(full, 2 * MIN);
    expect(n.hunger).toBeCloseTo(100 - DECAY_PER_HOUR.hunger * (2 / 60), 5);
    expect(n.energy).toBeLessThan(100);
    expect(n.happiness).toBeGreaterThan(99.8);
  });

  it('treats long gaps as absence with capped hours and floors', () => {
    const { needs, absent } = advanceNeeds(full, 3 * 24 * HOUR);
    expect(absent).toBe(true);
    // Never lower than the floor, and never more than ABSENCE_MAX_HOURS of decay.
    expect(needs.hunger).toBe(Math.max(ABSENCE_FLOOR.hunger, 100 - DECAY_PER_HOUR.hunger * ABSENCE_MAX_HOURS));
    expect(needs.cleanliness).toBeGreaterThanOrEqual(ABSENCE_FLOOR.cleanliness);
    expect(needs.happiness).toBeGreaterThanOrEqual(ABSENCE_FLOOR.happiness);
  });

  it('gives the same result for a week away as for ten hours away', () => {
    const week = decayAbsent(full, 7 * 24 * HOUR);
    const tenHours = decayAbsent(full, ABSENCE_MAX_HOURS * HOUR);
    expect(week).toEqual(tenHours);
  });

  it('does not lower needs that are already below the absence floor', () => {
    const low = { hunger: 10, energy: 10, cleanliness: 5, happiness: 12 };
    const n = decayAbsent(low, 30 * HOUR);
    expect(n.hunger).toBe(10);
    expect(n.cleanliness).toBe(5);
    expect(n.happiness).toBe(12);
    // The creature naps while away, so energy recovers.
    expect(n.energy).toBeGreaterThan(10);
  });

  it('ignores zero, negative and NaN elapsed time', () => {
    expect(advanceNeeds(full, 0).needs).toEqual(full);
    expect(advanceNeeds(full, -5000).needs).toEqual(full);
    expect(advanceNeeds(full, Number.NaN).needs).toEqual(full);
  });

  it('switches to absence rules just past the threshold', () => {
    expect(advanceNeeds(full, ABSENCE_THRESHOLD_MS).absent).toBe(false);
    expect(advanceNeeds(full, ABSENCE_THRESHOLD_MS + 1).absent).toBe(true);
  });
});

describe('tick', () => {
  it('records a warm return event after absence and never removes the creature', () => {
    const s = hatchedSave();
    const later = tick(s, T0 + 5 * 24 * HOUR);
    expect(later.absentMs).toBe(5 * 24 * HOUR);
    expect(later.save.kinlings).toHaveLength(1);
    expect(later.save.events.at(-1)?.kind).toBe('returned');
    expect(later.feedback.line).toBeTruthy();
    expect(later.feedback.line!.toLowerCase()).not.toMatch(/lonely|sad|abandon/);
  });

  it('ignores the clock moving backwards', () => {
    const s = hatchedSave();
    const back = tick(s, T0 - HOUR);
    expect(kin(back.save).needs).toEqual(kin(s).needs);
    expect(back.save.lastTickAt).toBe(T0 - HOUR);
  });
});

describe('care actions', () => {
  it('feeding works immediately and consumes the food', () => {
    const s = hatchedSave();
    kin(s).needs.hunger = 40;
    const before = s.inventory.foods.dewberry;
    const out = performCare(s, kin(s).id, 'feed', T0 + MIN, { food: 'dewberry' });
    expect(out.feedback.ok).toBe(true);
    expect(kin(out.save).needs.hunger).toBeGreaterThan(40);
    expect(out.save.inventory.foods.dewberry).toBe(before - 1);
    // The original save is untouched.
    expect(s.inventory.foods.dewberry).toBe(before);
  });

  it('seed buns never run out', () => {
    let s = hatchedSave();
    for (let i = 0; i < 5; i++) {
      kin(s).needs.hunger = 10;
      s = performCare(s, kin(s).id, 'feed', T0 + i * MIN, { food: 'seedBun' }).save;
    }
    expect(s.stats.feeds).toBe(5);
  });

  it('refuses food the player does not have', () => {
    const s = hatchedSave();
    s.inventory.foods.cress = 0;
    const out = performCare(s, kin(s).id, 'feed', T0, { food: 'cress' });
    expect(out.feedback.ok).toBe(false);
    expect(out.save).toBe(s);
  });

  it('discovers the favorite food and records a memory', () => {
    const s = hatchedSave('woodland');
    kin(s).needs.hunger = 30;
    const out = performCare(s, kin(s).id, 'feed', T0, { food: 'dewberry' });
    expect(kin(out.save).preferences.knownFavoriteFood).toBe(true);
    expect(kin(out.save).memories.some((m) => m.kind === 'preference')).toBe(true);
  });

  it('repeating the same action has diminishing (but non-zero) effect', () => {
    let s = hatchedSave();
    kin(s).needs.cleanliness = 0;
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = kin(s).needs.cleanliness;
      kin(s).needs.cleanliness = Math.min(before, 20);
      const start = kin(s).needs.cleanliness;
      s = performCare(s, kin(s).id, 'groom', T0 + i * MIN).save;
      gains.push(kin(s).needs.cleanliness - start);
    }
    expect(gains[0]).toBeGreaterThan(gains[3]!);
    expect(gains[3]).toBeGreaterThan(0);
  });

  it('keeps needs within 0..100', () => {
    let s = hatchedSave();
    for (let i = 0; i < 10; i++) s = performCare(s, kin(s).id, 'rest', T0 + i * 30 * MIN).save;
    expect(kin(s).needs.energy).toBeLessThanOrEqual(100);
    for (const v of Object.values(kin(s).needs)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('play is declined (not punished) when too tired', () => {
    const s = hatchedSave();
    kin(s).needs.energy = 5;
    const out = performCare(s, kin(s).id, 'play', T0);
    expect(out.feedback.ok).toBe(false);
    expect(kin(out.save).needs).toEqual(kin(s).needs);
  });
});
