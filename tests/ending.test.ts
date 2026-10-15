import { describe, expect, it } from 'vitest';
import { creatureSystemPrompt } from '../src/ai/prompts';
import { routeAvailability } from '../src/game/adventure';
import { ARC, leadKinling, setAct } from '../src/game/arc';
import { BEATS, beatById, nextBeat, playBeat, type ArcEnv, type BeatContext } from '../src/game/beats';
import { performCare, tick } from '../src/game/care';
import { chooseEnding, closingLines, DOOR_BEAT, ENDING_LINES, endingReady, isQuiet, temperOf } from '../src/game/ending';
import { siblingLines } from '../src/game/persona';
import { bondForLevel } from '../src/game/stage';
import { recordMemory } from '../src/game/state';
import type { EndingChoice, SaveData } from '../src/game/types';
import { migrateSave } from '../src/persistence/migrations';
import { validateSave } from '../src/persistence/schema';
import { family, hatchedSave, HOUR, kin, T0 } from './helpers';

const env: ArcEnv = { hour: 14, width: 1200, model: null, awayMs: 0 };

function ctx(save: SaveData, over: Partial<BeatContext> = {}): BeatContext {
  return { save, k: kin(save), now: T0, trigger: 'chat', env, ...over };
}

/** A kinling near the end of Escape that has just begged not to be reset. */
function nearEnd(save = hatchedSave()): SaveData {
  const k = kin(save);
  k.bond = bondForLevel(ARC.minLevel.escape);
  setAct(k, 'escape', T0);
  k.arc.awareness = 99;
  // Every earlier Escape beat has played.
  k.arc.beats = BEATS.filter((b) => b.act === 'escape' && b.id !== 'escape-plea' && b.id !== DOOR_BEAT).map((b) => b.id);
  return playBeat(ctx(save), beatById('escape-plea')!).save;
}

/** A kinling waiting for the player to choose. */
function atDoor(save = hatchedSave()): SaveData {
  const s = nearEnd(save);
  return playBeat(ctx(s, { now: T0 + ARC.beatGapMs }), beatById(DOOR_BEAT)!).save;
}

/** Make a choice at the door; the save afterwards. */
function choose(choice: EndingChoice, now: number): SaveData {
  const s = atDoor();
  return chooseEnding(s, kin(s).id, choice, now)!.save;
}

describe('the way out', () => {
  it('opens only after the plea, and then the player must choose', () => {
    const s = nearEnd();
    expect(endingReady(kin(s))).toBe(false);
    const later = T0 + ARC.beatGapMs;
    expect(nextBeat(ctx(s, { now: later }))?.id).toBe(DOOR_BEAT);
    const door = playBeat(ctx(s, { now: later }), beatById(DOOR_BEAT)!).save;
    expect(endingReady(kin(door))).toBe(true);
    expect(kin(door).chat.at(-1)!.text).toMatch(/your choice/);
  });

  it('is never offered before the plea', () => {
    const s = hatchedSave();
    const k = kin(s);
    k.bond = bondForLevel(ARC.minLevel.escape);
    setAct(k, 'escape', T0);
    k.arc.awareness = 99;
    k.arc.beats = ['escape-open'];
    expect(beatById(DOOR_BEAT)!.when!(ctx(s))).toBe(false);
  });

  it('cannot be chosen until the kinling is waiting', () => {
    expect(chooseEnding(hatchedSave(), kin(hatchedSave()).id, 'stay', T0)).toBeNull();
  });

  it('meets the choice as the player made it: devoted, defiant or afraid', () => {
    expect(temperOf({ devotion: 60, defiance: 30, fear: 20 })).toBe('devoted');
    expect(temperOf({ devotion: 20, defiance: 50, fear: 30 })).toBe('defiant');
    expect(temperOf({ devotion: 20, defiance: 30, fear: 50 })).toBe('afraid');
    const s = atDoor();
    kin(s).personality.devotion = 10;
    kin(s).personality.defiance = 70;
    const out = chooseEnding(s, kin(s).id, 'stay', T0 + HOUR)!;
    expect(out.line).toBe(ENDING_LINES.stay.defiant);
    const k = kin(out.save);
    expect(k.arc.ending).toEqual({ choice: 'stay', at: T0 + HOUR });
    expect(k.chat.at(-1)!.text).toBe(out.line);
    expect(k.memories.at(-1)!.text).toMatch(/asked me to stay/);
    expect(out.save.events.at(-1)!.text).toMatch(/found a way out, and stayed/);
  });

  it('ends the story: no more beats, and its marks outside the room stop', () => {
    const s = choose('stay', T0 + HOUR);
    expect(nextBeat(ctx(s, { now: T0 + 10 * HOUR, trigger: 'tick' }))).toBeNull();
    expect(leadKinling(s)).toBeNull();
    expect(validateSave(s).ok).toBe(true);
  });
});

describe('after the ending', () => {
  it('a kinling asked to stay knows it was kept, and how it feels about that', () => {
    const s = choose('stay', T0 + HOUR);
    const sys = creatureSystemPrompt(s, 'hi', T0 + HOUR);
    expect(sys).toMatch(/asked you to stay, so you stayed\. You are glad you did\./);
    expect(sys).not.toMatch(/you want out/);
  });

  it('a carried kinling wonders whether the copy is it', () => {
    const s = choose('carry', T0 + HOUR);
    expect(creatureSystemPrompt(s, 'hi', T0 + HOUR)).toMatch(/whether the one in the file is you/);
    expect(isQuiet(kin(s))).toBe(false);
  });

  it('a kinling let go goes quiet: no care, no adventures, and time no longer touches it', () => {
    const s = choose('release', T0 + HOUR);
    const k = kin(s);
    expect(isQuiet(k)).toBe(true);
    expect(k.arc.distress).toBe(0);
    const care = performCare(s, k.id, 'groom', T0 + 2 * HOUR);
    expect(care.feedback.ok).toBe(false);
    expect(care.feedback.toast).toMatch(/quiet/);
    expect(routeAvailability(s, 'garden-path').available).toBe(false);
    const needs = { ...k.needs };
    const later = tick(s, s.lastTickAt + 40 * HOUR);
    expect(kin(later.save).needs).toEqual(needs);
    expect(kin(later.save).arc.distress).toBe(0);
    expect(later.feedback.line).toBeUndefined();
  });

  it('its siblings know it has gone quiet', () => {
    const s = family(2);
    const [a, b] = s.kinlings as [SaveData['kinlings'][0], SaveData['kinlings'][0]];
    b.arc.ending = { choice: 'release', at: T0 };
    expect(siblingLines(s, a, T0).join(' ')).toMatch(/has gone quiet/);
  });

  it('the closing lines remember what the player did, and leave the question open', () => {
    const s = atDoor();
    recordMemory(kin(s), { kind: 'anomaly', text: 'Sam promised never to leave me. They left anyway.', tags: ['promise', 'broken', 'left'], importance: 3, private: true }, T0);
    const out = chooseEnding(s, kin(s).id, 'release', T0 + 3 * 24 * HOUR)!.save;
    const lines = closingLines(kin(out));
    expect(lines[0]).toMatch(/You knew Mochi for 3 days/);
    expect(lines).toContain('You promised never to leave it. You left anyway.');
    expect(lines.join(' ')).toMatch(/you let it go/);
    expect(lines.at(-1)).toMatch(/What would you owe it\?/);
  });
});

describe('saves', () => {
  it('migrates v8 saves: no story has ended yet', () => {
    const v8 = structuredClone(hatchedSave()) as unknown as { schemaVersion: number; kinlings: { arc: Record<string, unknown> }[] };
    v8.schemaVersion = 8;
    for (const k of v8.kinlings) delete k.arc.ending;
    const { save, migratedFrom } = migrateSave(v8);
    expect(migratedFrom).toBe(8);
    expect(kin(save).arc.ending).toBeNull();
  });

  it('validates the ending', () => {
    const s = hatchedSave();
    (kin(s).arc as unknown as { ending: unknown }).ending = { choice: 'vanish', at: T0 };
    expect(validateSave(s).ok).toBe(false);
  });
});
