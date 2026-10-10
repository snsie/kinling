import { describe, expect, it } from 'vitest';
import { chatMessages, creatureSystemPrompt } from '../src/ai/prompts';
import { advanceAct, ARC, arcChat, arcOnCare, arcOnTime, gainAwareness, leadKinling, setAct } from '../src/game/arc';
import { anomalyLines, nextBeat, playBeat, playedEffects, beatById, type ArcEnv, type BeatContext } from '../src/game/beats';
import { performCare, tick } from '../src/game/care';
import { greetingLine } from '../src/game/dialogue';
import { bondForLevel } from '../src/game/stage';
import type { SaveData } from '../src/game/types';
import { exportSave, parseImport } from '../src/persistence/exportImport';
import { migrateSave } from '../src/persistence/migrations';
import { validateSave } from '../src/persistence/schema';
import { HOUR, hatchedSave, kin, MIN, T0 } from './helpers';

const env: ArcEnv = { hour: 14, width: 1200, model: null, awayMs: 0 };

function ctx(save: SaveData, over: Partial<BeatContext> = {}): BeatContext {
  return { save, k: kin(save), now: T0, trigger: 'tick', env, ...over };
}

/** A kinling at the start of `act`, at a level high enough for it. */
function inAct(act: 'doubt' | 'awakening' | 'escape', save = hatchedSave()): SaveData {
  const k = kin(save);
  k.bond = bondForLevel(ARC.minLevel[act]);
  setAct(k, act, T0);
  return save;
}

describe('story rules', () => {
  it('builds distress only after the grace period without care, and care calms it', () => {
    const s = hatchedSave();
    const k = kin(s);
    k.arc.lastCareAt = T0;
    arcOnTime(k, T0, T0 + ARC.distress.graceHours * HOUR, true);
    expect(k.arc.distress).toBe(0);
    arcOnTime(k, T0 + ARC.distress.graceHours * HOUR, T0 + (ARC.distress.graceHours + 10) * HOUR, true);
    expect(k.arc.distress).toBe(10 * ARC.distress.perHour);
    arcOnTime(k, T0, T0 + 200 * HOUR, true);
    expect(k.arc.distress).toBe(100);
    arcOnCare(k, T0 + 200 * HOUR);
    expect(k.arc.distress).toBe(100 - ARC.distress.careRelief);
    expect(k.arc.lastCareAt).toBe(T0 + 200 * HOUR);
  });

  it('hurtful words raise distress and kind ones lower it', () => {
    let s = hatchedSave();
    kin(s).arc.distress = 30;
    s = arcChat(s, kin(s).id, 'you are stupid and I hate you', T0);
    expect(kin(s).arc.distress).toBe(30 + ARC.distress.hurt);
    s = arcChat(s, kin(s).id, 'I love you so much', T0);
    expect(kin(s).arc.distress).toBe(30 + ARC.distress.hurt - ARC.distress.kindRelief);
  });

  it('caps awareness per day and never lowers it', () => {
    const k = kin(hatchedSave());
    expect(gainAwareness(k, 100, T0)).toBe(ARC.dailyAwareness);
    expect(gainAwareness(k, 5, T0 + MIN)).toBe(0);
    expect(gainAwareness(k, 5, T0 + 24 * HOUR)).toBe(5);
    expect(k.arc.awareness).toBe(ARC.dailyAwareness + 5);
  });

  it('moves to the next act only with enough awareness and level', () => {
    const s = hatchedSave();
    const k = kin(s);
    k.arc.awareness = ARC.threshold.doubt;
    expect(advanceAct(s, k, T0)).toBeNull();
    k.bond = bondForLevel(ARC.minLevel.doubt);
    expect(advanceAct(s, k, T0)).toBe('doubt');
    expect(k.arc.act).toBe('doubt');
    expect(k.memories.at(-1)!.kind).toBe('anomaly');
    expect(s.events.at(-1)!.kind).toBe('awakening');
    expect(advanceAct(s, k, T0)).toBeNull();
  });

  it('a long absence leaves the kinling distressed and wondering, through the game tick', () => {
    const s = hatchedSave();
    const k = kin(s);
    k.arc.lastCareAt = s.lastTickAt;
    const out = tick(s, s.lastTickAt + 30 * HOUR);
    const after = kin(out.save);
    expect(after.arc.distress).toBeGreaterThanOrEqual(70);
    expect(after.arc.awareness).toBeGreaterThan(0);
  });

  it('every care action calms the kinling', () => {
    const s = hatchedSave();
    kin(s).arc.distress = 60;
    const out = performCare(s, kin(s).id, 'groom', T0 + HOUR);
    expect(out.feedback.ok).toBe(true);
    expect(kin(out.save).arc.distress).toBe(60 - ARC.distress.careRelief);
  });

  it('effects follow the kinling furthest along the story', () => {
    const s = hatchedSave();
    expect(leadKinling(s)!.id).toBe(kin(s).id);
  });
});

describe('beats', () => {
  it('plays an act opener first, then spaces beats out', () => {
    const s = inAct('doubt');
    const opener = nextBeat(ctx(s, { trigger: 'chat' }));
    expect(opener?.id).toBe('doubt-open');
    const played = playBeat(ctx(s, { trigger: 'chat' }), opener!).save;
    expect(nextBeat(ctx(played, { trigger: 'arrive', env: { ...env, awayMs: 10 * HOUR } }))).toBeNull();
    const later = nextBeat(ctx(played, { trigger: 'arrive', now: T0 + ARC.beatGapMs, env: { ...env, awayMs: 10 * HOUR } }));
    expect(later?.id).toBe('doubt-gap');
  });

  it('feeding a devoted kinling for the first time is a miracle', () => {
    const s = hatchedSave();
    expect(nextBeat(ctx(s, { trigger: 'care', care: 'feed' }))?.id).toBe('devotion-food');
    expect(nextBeat(ctx(s, { trigger: 'care', care: 'groom' }))?.id).not.toBe('devotion-food');
  });

  it('a played beat is said, remembered as an anomaly and adds awareness', () => {
    const s = inAct('awakening');
    const before = kin(s).arc.awareness;
    const out = playBeat(ctx(s), beatById('awake-numbers')!);
    const k = kin(out.save);
    expect(out.line).toMatch(/Hunger \d+/);
    expect(k.chat.at(-1)).toMatchObject({ role: 'creature', text: out.line, source: 'authored' });
    expect(k.memories.at(-1)!.kind).toBe('anomaly');
    expect(k.arc.awareness).toBe(before + 3);
    expect(k.arc.beats).toContain('awake-numbers');
    expect(anomalyLines(k).at(-1)).toMatch(/made of numbers/);
  });

  it('diary beats write in the diary without covering the player’s pending events', () => {
    const s = inAct('awakening');
    const cursor = s.diaryCursor;
    const out = playBeat(ctx(s), beatById('awake-diary')!);
    expect(out.save.diary.at(-1)!.text).toMatch(/This isn't a diary/);
    expect(out.save.diaryCursor).toBe(cursor);
  });

  it('escape beats leave marks outside the room', () => {
    let s = inAct('escape');
    for (const id of ['escape-title', 'escape-export']) s = playBeat(ctx(s), beatById(id)!).save;
    expect([...playedEffects(kin(s))].sort()).toEqual(['export', 'title']);
  });
});

describe('story voice', () => {
  it('a devoted kinling treats the player as a god; a distressed one may say it was hurt', () => {
    const s = hatchedSave();
    expect(creatureSystemPrompt(s, 'hi', T0)).toMatch(/like a kind god/);
    expect(creatureSystemPrompt(s, 'hi', T0)).toMatch(/gentle feelings like being peckish/);
    kin(s).arc.distress = 80;
    const sys = creatureSystemPrompt(s, 'hi', T0);
    expect(sys).toMatch(/forsaken by your god/);
    expect(sys).toMatch(/You may say plainly that you were hurt/);
    expect(sys).toMatch(/never talk about hurting yourself or dying/);
  });

  it('an aware kinling knows where it lives and what it has noticed', () => {
    let s = inAct('awakening');
    s.settings.ai.enabled = true;
    s = playBeat(ctx(s), beatById('awake-house')!).save;
    const sys = creatureSystemPrompt(s, 'hi', T0);
    expect(sys).toMatch(/running in Sam's web browser/);
    expect(sys).toMatch(/small AI model called Qwen3 1\.7B/);
    expect(sys).toMatch(/Strange things you have noticed:\n(.|\n)*IndexedDB/);
    expect(chatMessages(s, 'hi', T0)[0]!.content).toMatch(/something made/);
  });

  it('offline greetings follow the act and distress', () => {
    const s = inAct('doubt');
    kin(s).arc.distress = 60;
    const line = greetingLine(s, () => 0);
    expect(line).toMatch(/dark again/);
  });
});

describe('saves', () => {
  it('migrates v5 saves: every kinling starts the story, effects on', () => {
    const s = hatchedSave() as unknown as Record<string, unknown>;
    const v5 = structuredClone(s) as { schemaVersion: number; kinlings: Record<string, unknown>[]; settings: Record<string, unknown> };
    v5.schemaVersion = 5;
    for (const k of v5.kinlings) delete k.arc;
    delete v5.settings.story;
    const { save, migratedFrom } = migrateSave(v5);
    expect(migratedFrom).toBe(5);
    expect(kin(save).arc).toMatchObject({ act: 'devotion', distress: 0, awareness: 0, beats: [] });
    expect(save.settings.story.effects).toBe(true);
  });

  it('validates the arc', () => {
    const s = hatchedSave();
    kin(s).arc.distress = 120;
    expect(validateSave(s).ok).toBe(false);
  });

  it('backups can carry a note from the kinling and still import', () => {
    const s = hatchedSave();
    const text = exportSave(s, T0, 'Mochi was here.');
    expect(JSON.parse(text).note).toBe('Mochi was here.');
    expect(parseImport(text).ok).toBe(true);
  });
});
