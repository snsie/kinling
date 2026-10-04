import { describe, expect, it } from 'vitest';
import { performCare } from '../src/game/care';
import { authoredLines, holdConversation, pickTopic, TOPICS } from '../src/game/chatter';
import { cancelSiblingHatch, EGG_MILESTONES, eggWaiting, startSiblingHatch } from '../src/game/eggs';
import {
  applySocialOutcome,
  changeFeeling,
  DAILY_PAIR_CAP,
  describeFeelings,
  DRIFT_LIMIT,
  ensureFeeling,
  NEW_TOPIC_FAMILIARITY,
  SOCIAL_TRAIT_DAILY_CAP,
  TOPIC_WINDOW_MS,
} from '../src/game/feelings';
import { chooseEgg, hatch, nameCreature } from '../src/game/onboarding';
import { feelingOf, kinlingById } from '../src/game/state';
import { starterTraitsFor } from '../src/game/traits';
import { PERSONALITY_KEYS, PLAYER_ID, type SaveData } from '../src/game/types';
import { createRng, dayKey } from '../src/game/util';
import { validateSave } from '../src/persistence/schema';
import { family, hatchedSave, HOUR, kin, MIN, T0 } from './helpers';

describe('social outcome bounds', () => {
  it('holds every limit over 500 conversations, however extreme the proposals', () => {
    const s = family(4);
    const rand = createRng(42);
    const ids = s.kinlings.map((k) => k.id);
    const daily = new Map<string, { warmth: number; trust: number }>();
    const traitDaily = new Map<string, number>();
    let now = T0;
    for (let i = 0; i < 500; i++) {
      now += 7 * MIN;
      const a = ids[Math.floor(rand() * 4)]!;
      let b = ids[Math.floor(rand() * 4)]!;
      if (a === b) b = ids[(ids.indexOf(a) + 1) % 4]!;
      const wild = () => Math.round((rand() * 2 - 1) * 50);
      const before = structuredClone(s);
      const applied = applySocialOutcome(s, { a, b, topic: TOPICS[Math.floor(rand() * TOPICS.length)]!, feelings: { aToB: { warmth: wild(), trust: wild() }, bToA: { warmth: wild(), trust: wild() } }, memoryA: null, memoryB: null }, now);
      for (const [from, to, d] of [[a, b, applied.aToB], [b, a, applied.bToA]] as const) {
        expect(Math.abs(d.warmth)).toBeLessThanOrEqual(3);
        expect(Math.abs(d.trust)).toBeLessThanOrEqual(2);
        const key = `${dayKey(now)}:${from}>${to}`;
        const used = daily.get(key) ?? { warmth: 0, trust: 0 };
        used.warmth += d.warmth;
        used.trust += d.trust;
        daily.set(key, used);
        expect(Math.abs(used.warmth)).toBeLessThanOrEqual(DAILY_PAIR_CAP.warmth);
        expect(Math.abs(used.trust)).toBeLessThanOrEqual(DAILY_PAIR_CAP.trust);
      }
      for (const id of [a, b]) {
        const k = kinlingById(s, id)!;
        const k0 = kinlingById(before, id)!;
        const moved = PERSONALITY_KEYS.reduce((sum, t) => sum + Math.abs(k.personality[t] - k0.personality[t]), 0);
        expect(moved).toBeLessThanOrEqual(1);
        for (const t of PERSONALITY_KEYS) {
          expect(Math.abs(k.personality[t] - k.baseline[t])).toBeLessThanOrEqual(DRIFT_LIMIT);
          const key = `${dayKey(now)}:${id}:${t}`;
          traitDaily.set(key, (traitDaily.get(key) ?? 0) + k.personality[t] - k0.personality[t]);
          expect(Math.abs(traitDaily.get(key)!)).toBeLessThanOrEqual(SOCIAL_TRAIT_DAILY_CAP);
        }
      }
      // Toward the player too: never below zero.
      changeFeeling(kinlingById(s, a)!, ensureFeeling(s, a, PLAYER_ID), { warmth: -50, trust: -50 }, now);
    }
    for (const f of s.feelings) {
      expect(f.warmth).toBeGreaterThanOrEqual(f.to === PLAYER_ID ? 0 : -30);
      expect(f.warmth).toBeLessThanOrEqual(100);
    }
    expect(validateSave(s).ok).toBe(true);
  });

  it('kinlings keep their own personalities after a long warm friendship', () => {
    const s = family(2);
    const [a, b] = s.kinlings.map((k) => k.id) as [string, string];
    for (const f of s.feelings) f.warmth = 90;
    const gap = (x: SaveData) => PERSONALITY_KEYS.reduce((sum, t) => sum + Math.abs(kinlingById(x, a)!.personality[t] - kinlingById(x, b)!.personality[t]), 0);
    kinlingById(s, b)!.personality = { curiosity: 90, confidence: 90, playfulness: 90 };
    kinlingById(s, b)!.baseline = { curiosity: 90, confidence: 90, playfulness: 90 };
    for (let day = 0; day < 60; day++) {
      for (let i = 0; i < 10; i++) applySocialOutcome(s, { a, b, topic: 'play', feelings: { aToB: { warmth: 1, trust: 1 }, bToA: { warmth: 1, trust: 1 } }, memoryA: null, memoryB: null }, T0 + day * 24 * HOUR + i * 20 * MIN);
    }
    expect(gap(s)).toBeGreaterThan(0);
    for (const id of [a, b]) for (const t of PERSONALITY_KEYS) expect(Math.abs(kinlingById(s, id)!.personality[t] - kinlingById(s, id)!.baseline[t])).toBeLessThanOrEqual(DRIFT_LIMIT);
  });

  it('cool kinlings drift apart', () => {
    const s = family(2);
    const [a, b] = s.kinlings.map((k) => k.id) as [string, string];
    for (const f of s.feelings) if (f.to !== PLAYER_ID) f.warmth = -20;
    const ka = kinlingById(s, a)!;
    const kb = kinlingById(s, b)!;
    const before = Math.abs(ka.personality.playfulness - kb.personality.playfulness) + Math.abs(ka.personality.curiosity - kb.personality.curiosity) + Math.abs(ka.personality.confidence - kb.personality.confidence);
    applySocialOutcome(s, { a, b, topic: 'naps', feelings: { aToB: { warmth: 0, trust: 0 }, bToA: { warmth: 0, trust: 0 } }, memoryA: null, memoryB: null }, T0);
    const after = PERSONALITY_KEYS.reduce((sum, t) => sum + Math.abs(ka.personality[t] - kb.personality[t]), 0);
    expect(after).toBeGreaterThan(before);
  });

  it('gives familiarity only for topics new to the pair in the last day', () => {
    const s = family(2);
    const [a, b] = s.kinlings.map((k) => k.id) as [string, string];
    const talk = (topic: string, now: number) => applySocialOutcome(s, { a, b, topic, feelings: { aToB: { warmth: 0, trust: 0 }, bToA: { warmth: 0, trust: 0 } }, memoryA: null, memoryB: null }, now).familiarity;
    expect(talk('snacks', T0)).toBe(NEW_TOPIC_FAMILIARITY);
    for (let i = 1; i <= 20; i++) expect(talk('snacks', T0 + i * 30 * MIN)).toBe(0);
    expect(talk('naps', T0 + HOUR)).toBe(NEW_TOPIC_FAMILIARITY);
    expect(talk('snacks', T0 + TOPIC_WINDOW_MS + MIN)).toBe(NEW_TOPIC_FAMILIARITY);
    expect(feelingOf(s, a, b)!.familiarity).toBe(feelingOf(s, b, a)!.familiarity);
  });
});

describe('authored conversations', () => {
  it('records two or three grounded lines, the outcome and a memory for each', () => {
    const s = family(2);
    const [a, b] = s.kinlings.map((k) => k.id) as [string, string];
    const held = holdConversation(s, a, b, { near: 'bowl', now: T0, rand: createRng(3) })!;
    expect(held.log.lines.length).toBeGreaterThanOrEqual(2);
    expect(held.log.lines.length).toBeLessThanOrEqual(3);
    expect(held.log.lines[0]!.speaker).toBe(a);
    expect(held.save.conversations).toHaveLength(1);
    expect(kinlingById(held.save, a)!.memories.at(-1)).toMatchObject({ kind: 'kinling-chat', withIds: [b], private: false });
    expect(kinlingById(held.save, b)!.memories.at(-1)!.withIds).toEqual([a]);
    expect(validateSave(held.save).ok).toBe(true);
    expect(s.conversations).toHaveLength(0);
  });

  it('keeps at most 20 conversations', () => {
    let s = family(2);
    const [a, b] = s.kinlings.map((k) => k.id) as [string, string];
    for (let i = 0; i < 30; i++) s = holdConversation(s, a, b, { now: T0 + i * HOUR, rand: createRng(i) })!.save;
    expect(s.conversations).toHaveLength(20);
    expect(validateSave(s).ok).toBe(true);
  });

  it('nearby furniture steers the topic', () => {
    const s = family(2);
    const [a, b] = s.kinlings;
    const rand = createRng(8);
    const topics = Array.from({ length: 200 }, () => pickTopic(s, a!, b!, 'bed', T0, rand));
    expect(topics.filter((t) => t === 'naps').length).toBeGreaterThan(50);
    expect(topics).not.toContain('keepsakes'); // nothing on the shelf yet
  });

  it('cool kinlings sound cool, warm ones warm', () => {
    const s = family(2);
    const [a, b] = s.kinlings;
    for (const f of s.feelings) if (f.to !== PLAYER_ID) f.warmth = -25;
    const cool = authoredLines(s, a!, b!, 'play', createRng(1));
    expect(cool).toHaveLength(2);
    expect(["Not now.", "I don't feel like it."]).toContain(cool[1]!.text);
    for (const f of s.feelings) if (f.to !== PLAYER_ID) f.warmth = 80;
    const warm = authoredLines(s, a!, b!, 'play', createRng(1));
    expect(warm).toHaveLength(3);
    expect(['Ha! I\'ll get you!', 'Yes! Ready, set, go!']).toContain(warm[1]!.text);
  });

  it('describes feelings in words', () => {
    const s = family(3);
    const [a, b, c] = s.kinlings;
    feelingOf(s, a!.id, b!.id)!.warmth = 80;
    feelingOf(s, a!.id, c!.id)!.warmth = -12;
    const p = feelingOf(s, a!.id, PLAYER_ID)!;
    p.warmth = 50;
    p.trust = 65;
    expect(describeFeelings(s, a!.id)).toEqual([`adores ${b!.name}`, `wary of ${c!.name}`, 'trusts you']);
  });
});

describe('new eggs', () => {
  it('arrives at the first bond milestone and hatches through the usual steps', () => {
    let s = hatchedSave('woodland');
    expect(eggWaiting(s)).toBe(false);
    kin(s).bond = EGG_MILESTONES[0] - 0.5;
    const fed = performCare(s, kin(s).id, 'feed', T0, { food: 'dewberry' });
    expect(fed.feedback.eggArrived).toBe(true);
    s = fed.save;
    expect(s.events.some((e) => e.kind === 'egg')).toBe(true);
    expect(eggWaiting(s)).toBe(true);

    s = startSiblingHatch(s);
    expect(s.onboarding.step).toBe('egg');
    expect(cancelSiblingHatch(s).onboarding.step).toBe('done');
    s = chooseEgg(s, 'celestial');
    const out = hatch(s, T0 + 1);
    expect(out.feedback.ok).toBe(true);
    s = nameCreature(out.save, 'Luma', '', T0 + 2).save;
    expect(s.onboarding.step).toBe('done');
    expect(s.player.name).toBe('Sam');
    expect(s.kinlings).toHaveLength(2);
    expect(kin(s).name).toBe('Luma');
    for (const t of [...starterTraitsFor('woodland'), ...starterTraitsFor('celestial')]) expect(s.unlocks.traits).toContain(t);
    const [mochi, luma] = s.kinlings;
    expect(feelingOf(s, mochi!.id, luma!.id)).toBeTruthy();
    expect(feelingOf(s, luma!.id, mochi!.id)).toBeTruthy();
    expect(feelingOf(s, luma!.id, PLAYER_ID)).toBeTruthy();
    expect(eggWaiting(s)).toBe(false);
    expect(validateSave(s).ok).toBe(true);
  });

  it('will not hatch without a waiting egg, or past four kinlings', () => {
    let s = hatchedSave();
    s.onboarding = { step: 'hatch', egg: 'aquatic', draftAppearance: structuredClone(kin(s).appearance) };
    expect(hatch(s, T0).feedback.ok).toBe(false);
    s = family(4);
    for (const k of s.kinlings) k.bond = 500;
    expect(eggWaiting(s)).toBe(false);
    expect(startSiblingHatch(s)).toBe(s);
  });
});
