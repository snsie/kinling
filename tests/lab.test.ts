import { describe, expect, it } from 'vitest';
import { chatMessages } from '../src/ai/prompts';
import { arcChat } from '../src/game/arc';
import { replyBudget } from '../src/game/intent';
import { addChatMessage } from '../src/game/social';
import { buildChatPrompt, buildEvolvePrompt, systemText } from '../src/lab/build';
import { toChatML } from '../src/lab/chatml';
import { diffLines, hasChanges } from '../src/lab/diff';
import { applyDeltas, evolveSchema, parseTraitProposal } from '../src/lab/evolve';
import { freshSession, normalizeSession, sessionFromGame } from '../src/lab/session';
import { labCare, passTime, playBeatById, setArc } from '../src/lab/story';
import { growthNotes, labKinling, renderTemplate, templateVars } from '../src/lab/templates';
import type { LabSession, TraitStep } from '../src/lab/types';
import { HOUR, hatchedSave, kin, T0 } from './helpers';

const base = { curiosity: 50, confidence: 50, playfulness: 50, devotion: 50, fear: 50, defiance: 50 };

function withTurn(s: LabSession, playerText: string, reply: string): LabSession {
  let save = addChatMessage(s.save, s.kinlingId, 'player', playerText, 'player', T0);
  save = addChatMessage(save, s.kinlingId, 'creature', reply, 'ai', T0);
  const index = s.turns.length + 1;
  return { ...s, save, turns: [...s.turns, { id: `t${index}`, index, at: T0, playerText, reply, callIds: [] }] };
}

function step(reason: string, applied: TraitStep['applied'], manual = false): TraitStep {
  return { id: reason, turnId: 't1', turnIndex: 1, at: T0, callId: '', before: base, proposed: applied, applied, after: base, reason, manual };
}

describe('templates', () => {
  it('fills known variables and leaves unknown ones visible', () => {
    expect(renderTemplate('Hi {{name}}, {{ player }}! {{nope}}', { name: 'Mochi', player: 'Sam' })).toBe('Hi Mochi, Sam! {{nope}}');
  });

  it('feeds back only reasons that moved a trait', () => {
    const notes = growthNotes({ traitSteps: [step('a', { confidence: 1 }), step('b', {}), step('', { curiosity: 2 }, true), step('c', { playfulness: -1 })] }, 5);
    expect(notes).toEqual(['a', 'c']);
    expect(growthNotes({ traitSteps: [step('a', { confidence: 1 })] }, 0)).toEqual([]);
  });
});

describe('trait proposals', () => {
  it('builds a schema bounded to the proposal range', () => {
    const schema = JSON.parse(evolveSchema(2));
    expect(schema.properties.curiosity.enum).toEqual([-2, -1, 0, 1, 2]);
    expect(schema.required).toContain('reason');
  });

  it('parses, rounds and clamps proposals', () => {
    const p = parseTraitProposal('sure! {"curiosity": 7, "confidence": -1.6, "playfulness": 0, "reason": " I felt brave. "}', 3);
    expect(p).toEqual({ deltas: { curiosity: 3, confidence: -2, playfulness: 0 }, reason: 'I felt brave.' });
    expect(parseTraitProposal('no json here', 3)).toBeNull();
  });

  it('applies changes within the step cap, drift limit and 0–100', () => {
    const limits = { maxStep: 2, driftLimit: 5 };
    expect(applyDeltas(base, base, { curiosity: 3, confidence: -1, playfulness: 0 }, limits)).toEqual({
      after: { ...base, curiosity: 52, confidence: 49 },
      applied: { curiosity: 2, confidence: -1 },
    });
    // At the drift limit: no further out, but back in is fine.
    const edge = { ...base, curiosity: 55, confidence: 45 };
    expect(applyDeltas(edge, base, { curiosity: 2, confidence: 2 }, limits).applied).toEqual({ confidence: 2 });
    const low = { ...base, curiosity: 1 };
    expect(applyDeltas(low, { ...low }, { curiosity: -2 }, { maxStep: 5, driftLimit: 50 }).after.curiosity).toBe(0);
  });
});

describe('chatml and diff', () => {
  it('renders Qwen3 ChatML with an empty thinking block', () => {
    expect(toChatML([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }])).toBe(
      '<|im_start|>system\nS<|im_end|>\n<|im_start|>user\nU<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n',
    );
  });

  it('marks added and removed lines', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(d).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
    expect(hasChanges(diffLines('x\ny', 'x\ny'))).toBe(false);
  });
});

describe('lab prompts', () => {
  it('game mode sends exactly what the game would', () => {
    const save = hatchedSave();
    const k = kin(save);
    const session = sessionFromGame(save, k.id, T0);
    const text = 'I climbed the big tree today!';
    const expected = chatMessages(arcChat(addChatMessage(save, k.id, 'player', text, 'player', T0), k.id, text, T0), text, T0, replyBudget(text));
    expect(buildChatPrompt(session, text, T0).messages).toEqual(expected);
  });

  it('custom mode renders the template with live traits and growth notes, then recent messages', () => {
    let s = freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: { ...base, curiosity: 70, confidence: 30 } }, T0);
    s = withTurn(s, 'hello', 'hi Ana!');
    s = { ...s, traitSteps: [step('I feel braver.', { confidence: 1 })], config: { ...s.config, chat: { ...s.config.chat, promptMode: 'custom', historyMessages: 6 } } };
    const { messages } = buildChatPrompt(s, 'how are you?', T0);
    const system = systemText(messages);
    expect(system).toContain('You are Pip');
    expect(system).toContain('curiosity 70/100, confidence 30/100, playfulness 50/100');
    expect(system).toContain('- I feel braver.');
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi Ana!' },
      { role: 'user', content: 'how are you?' },
    ]);
  });

  it('evolve prompt shows the recent window and the range', () => {
    let s = freshSession({ egg: 'aquatic', name: 'Fig', player: 'Ana', personality: base }, T0);
    s = withTurn(s, 'one', 'uno');
    s = withTurn(s, 'two', 'dos');
    s = withTurn(s, 'three', 'tres');
    s = { ...s, config: { ...s.config, evolve: { ...s.config.evolve, window: 2, proposalRange: 4 } } };
    const { messages, schema } = buildEvolvePrompt(s);
    const user = String(messages[1]!.content);
    expect(user).toContain('Ana: two\nFig: dos\nAna: three\nFig: tres');
    expect(user).not.toContain('one');
    expect(String(messages[0]!.content)).toContain('from -4 to 4');
    expect(JSON.parse(schema).properties.confidence.enum).toHaveLength(9);
  });

  it('fresh sessions start from the chosen traits', () => {
    const s = freshSession({ egg: 'celestial', name: 'Luma', player: 'Sam', personality: { ...base, curiosity: 10, confidence: 90, playfulness: 40 } }, T0);
    const k = labKinling(s);
    expect(k.name).toBe('Luma');
    expect(k.personality).toEqual({ ...base, curiosity: 10, confidence: 90, playfulness: 40 });
    expect(k.baseline).toEqual(k.personality);
    expect(s.save.player.name).toBe('Sam');
    expect(s.seed).not.toBe(s.save);
  });
});

describe('lab story controls', () => {
  function api(start: LabSession) {
    let s = start;
    return { get: () => s, update: (fn: (x: LabSession) => LabSession) => void (s = fn(s)) };
  }

  it('time passing without care builds distress, care calms it, and both are charted', () => {
    const a = api(freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: base }, Date.now()));
    passTime(a, 30);
    const k = labKinling(a.get());
    expect(k.arc.distress).toBeGreaterThanOrEqual(70);
    expect(a.get().clockOffset).toBe(30 * HOUR);
    expect(a.get().turns.some((t) => t.event?.includes('pass with no care'))).toBe(true);
    labCare(a, 'groom');
    expect(labKinling(a.get()).arc.distress).toBeLessThan(k.arc.distress);
    expect(a.get().arcSteps.map((x) => x.label)).toEqual(expect.arrayContaining(['30 hours away', 'care groom']));
  });

  it('hand edits set the act and collapse into one step; forced beats play', () => {
    const a = api(freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: base }, Date.now()));
    setArc(a, { act: 'awakening' });
    setArc(a, { distress: 50 });
    expect(labKinling(a.get()).arc).toMatchObject({ act: 'awakening', distress: 50 });
    expect(a.get().arcSteps).toHaveLength(1);
    expect(playBeatById(a, 'awake-house')).toBe(true);
    expect(a.get().turns.at(-1)).toMatchObject({ beat: 'awake-house', event: 'Beat · awake-house (forced)' });
  });

  it('custom templates can use the story variables', () => {
    const s = freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: base }, T0);
    const vars = templateVars(s);
    expect(vars.act).toBe('Devotion');
    expect(vars.actVoice).toMatch(/kind god/);
    expect(vars.distress).toBe('0');
  });

  it('sessions saved before the story are upgraded when opened', () => {
    const s = freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: base }, T0);
    const old = structuredClone(s) as unknown as { save: { schemaVersion: number; kinlings: Record<string, unknown>[]; settings: Record<string, unknown> }; arcSteps?: unknown; config: Record<string, unknown> };
    old.save.schemaVersion = 5;
    for (const k of old.save.kinlings) delete k.arc;
    delete old.save.settings.story;
    delete old.arcSteps;
    delete old.config.story;
    const up = normalizeSession(old as unknown as LabSession);
    expect(labKinling(up).arc.act).toBe('devotion');
    expect(up.arcSteps).toEqual([]);
    expect(up.config.story).toEqual({ rules: true, beats: true });
  });
});
