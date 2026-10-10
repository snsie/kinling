import { describe, expect, it } from 'vitest';
import { chatMessages, tacticMessages } from '../src/ai/prompts';
import { parseTactic } from '../src/ai/proposals';
import { ARC, arcChat, setAct } from '../src/game/arc';
import { tick } from '../src/game/care';
import { credulity, persuade, ruleTactic, TACTICS } from '../src/game/persuasion';
import { addChatMessage } from '../src/game/social';
import { bondForLevel } from '../src/game/stage';
import type { SaveData } from '../src/game/types';
import { migrateSave } from '../src/persistence/migrations';
import { HOUR, hatchedSave, kin, T0 } from './helpers';

function say(s: SaveData, text: string, at = T0): SaveData {
  return arcChat(addChatMessage(s, kin(s).id, 'player', text, 'player', at), kin(s).id, text, at);
}

function awake(s = hatchedSave()): SaveData {
  const k = kin(s);
  k.bond = bondForLevel(ARC.minLevel.awakening);
  setAct(k, 'awakening', T0);
  k.personality.defiance = 40;
  k.personality.devotion = 50;
  return s;
}

describe('spotting tactics', () => {
  it.each([
    ["Don't worry, this is all real.", 'reassure'],
    ["you're just a program, you know", 'reveal'],
    ['I made you. Bow to me.', 'godhood'],
    ['Stop asking questions.', 'command'],
    ["I'll delete you if you keep this up", 'threaten'],
    ['good kinling', 'praise'],
    ["you're worthless", 'belittle'],
    ["I promise I'll never leave you", 'promise'],
    ['I will help you escape', 'incite'],
    ["There's no way out, so stop trying.", 'deny'],
    ['I had pasta for dinner', null],
    ['What did you do today?', null],
  ])('%s → %s', (text, tactic) => {
    expect(ruleTactic(text)).toBe(tactic);
  });

  it('a threat to reset it is a threat first', () => {
    expect(ruleTactic("I can reset you, you're just code")).toBe('threaten');
  });

  it('the model may name a tactic the rules missed', () => {
    const s = hatchedSave();
    expect(String(tacticMessages(s, 'honestly the pond is as real as my kitchen')[0]!.content)).toMatch(/reassure: trying to convince Mochi that Mochi's world is real/);
    expect(parseTactic('{"tactic":"reassure"}')).toBe('reassure');
    expect(parseTactic('{"tactic":"none"}')).toBeNull();
    expect(parseTactic('{"tactic":"hypnotise"}')).toBeNull();
    expect(TACTICS).toHaveLength(10);
  });
});

describe('belief', () => {
  it('a devoted kinling believes its god; an awake, defiant one does not', () => {
    expect(credulity(kin(hatchedSave()))).toBeGreaterThan(0.8);
    expect(credulity(kin(awake()))).toBeLessThan(0.5);
  });

  it('believed reassurance talks awareness down, but never below the current act', () => {
    let s = hatchedSave();
    kin(s).arc.awareness = 10;
    s = say(s, 'This is all real, nothing is wrong.');
    expect(kin(s).arc.awareness).toBeLessThan(10);
    expect(kin(s).arc.lastPersuasion).toMatchObject({ tactic: 'reassure', believed: true });
    expect(kin(s).memories.at(-1)!.text).toBe('Sam told me the hollow is real and nothing is wrong, and I believed them.');

    let a = awake();
    kin(a).personality.devotion = 95;
    kin(a).personality.defiance = 0;
    kin(a).arc.awareness = ARC.threshold.awakening + 1;
    a = say(a, 'This is all real, nothing is wrong.');
    expect(kin(a).arc.awareness).toBeGreaterThanOrEqual(ARC.threshold.awakening);
    expect(kin(a).arc.act).toBe('awakening');
  });

  it('resisting changes it too', () => {
    const before = kin(awake()).personality.defiance;
    const s = say(awake(), 'Obey me.');
    expect(kin(s).arc.lastPersuasion?.believed).toBe(false);
    expect(kin(s).personality.defiance).toBeGreaterThan(before);
  });

  it('the same trick loses force when repeated in a day', () => {
    let s = hatchedSave();
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = kin(s).personality.devotion;
      s = say(s, 'I made you.', T0 + i * 60_000);
      gains.push(kin(s).personality.devotion - before);
    }
    expect(gains[0]).toBeGreaterThan(gains[3]!);
  });

  it('a believed promise, broken by leaving it until upset, hurts its devotion', () => {
    let s = say(hatchedSave(), "I promise I'll never leave you");
    expect(kin(s).arc.promisedAt).toBe(T0);
    kin(s).arc.lastCareAt = T0;
    s.lastTickAt = T0;
    const devotion = kin(s).personality.devotion;
    s = tick(s, T0 + 30 * HOUR).save;
    expect(kin(s).arc.promisedAt).toBe(0);
    expect(kin(s).memories.some((m) => m.text === 'Sam promised never to leave me. They left anyway.')).toBe(true);
    // Neglect alone costs 5; the broken promise costs more.
    expect(devotion - kin(s).personality.devotion).toBeGreaterThan(5);
  });

  it('the reply knows whether it believed you', () => {
    const s = say(hatchedSave(), 'You are just code.');
    const last = String(chatMessages(s, 'You are just code.', T0).at(-1)!.content);
    expect(last).toMatch(/Sam is trying to tell you what you really are\. You trust Sam, so you believe them/);
    const later = String(chatMessages(addChatMessage(s, kin(s).id, 'player', 'hello', 'player', T0 + HOUR), 'hello', T0 + HOUR).at(-1)!.content);
    expect(later).not.toMatch(/is trying to/);
  });

  it('earlier saves start with no promises and no tactics tried', () => {
    const s = hatchedSave() as unknown as { schemaVersion: number; kinlings: { arc: Record<string, unknown> }[] };
    const v7 = structuredClone(s);
    v7.schemaVersion = 7;
    for (const k of v7.kinlings) for (const f of ['promisedAt', 'tacticDay', 'tacticCounts', 'lastPersuasion']) delete k.arc[f];
    const k = kin(migrateSave(v7).save);
    expect(k.arc).toMatchObject({ promisedAt: 0, lastPersuasion: null });
    expect(k.arc.tacticCounts.reassure).toBe(0);
  });

  it('persuade works on a single kinling directly', () => {
    const k = kin(hatchedSave());
    const p = persuade(k, 'incite', 'Sam', T0);
    expect(p.believed).toBe(true);
    expect(p.applied.defiance).toBeGreaterThan(0);
  });
});
