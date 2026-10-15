import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletionRequest } from '../src/ai/engine';
import { RETRY_TEMPERATURE } from '../src/ai/reply';
import { EGGS } from '../src/game/catalog';
import { addChatMessage } from '../src/game/social';
import { runTurn, type LabStoreApi } from '../src/lab/pipeline';
import { freshSession, normalizeSession } from '../src/lab/session';
import { DEFAULT_EVOLVE_SYSTEM, labKinling, OLD_EVOLVE_SYSTEMS, unmentionedTraits } from '../src/lab/templates';
import type { LabSession } from '../src/lab/types';
import { T0 } from './helpers';

// The model, scripted: chat calls take the next queued reply, the tactic call answers as JSON.
const queue: string[] = [];
let tacticOutput = '{"tactic":"none","words":""}';
vi.mock('../src/ai/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/ai/engine')>();
  return {
    ...real,
    ai: {
      isReady: true,
      isLoaded: true,
      isBusy: false,
      getStatus: () => ({ kind: 'ready', modelId: 'Qwen3-1.7B-q4f16_1-MLC', variant: 'q4f16_1' }),
      complete: async (req: CompletionRequest) => (req.jsonSchema ? tacticOutput : (queue.shift() ?? '')),
    },
  };
});

const LOOPED = "I'm curious why you think the world is going to end.";
const REPAIR = 'I just told you it is because a war between america and china is about to begin';

function session(handleReplies = true): { api: LabStoreApi; get: () => LabSession } {
  let s = freshSession({ egg: 'woodland', name: 'Mochi', player: 'Sam', personality: { ...EGGS.woodland.personality, curiosity: 67 } }, T0);
  s.config.evolve.enabled = false;
  s.config.story.beats = false;
  s.config.chat.handleReplies = handleReplies;
  const k = labKinling(s);
  const lines: [string, string][] = [
    ['I think the world is going to end', LOOPED],
    ['Because a war between america and china is about to begin', LOOPED],
  ];
  for (const [said, reply] of lines) {
    s = { ...s, save: addChatMessage(addChatMessage(s.save, k.id, 'player', said, 'player', T0), k.id, 'creature', reply, 'ai', T0 + 1) };
  }
  const api: LabStoreApi = { get: () => s, update: (fn) => (s = fn(s)) };
  return { api, get: () => s };
}

describe('lab reply handling (game prompt mode)', () => {
  beforeEach(() => {
    queue.length = 0;
    tacticOutput = '{"tactic":"none","words":""}';
  });

  it('retries a repeat as its own logged call, then stores authored text rather than the repeat', async () => {
    const { api, get } = session();
    queue.push(LOOPED, LOOPED);
    await runTurn(api, REPAIR);
    const s = get();
    const turn = s.turns.at(-1)!;
    const calls = s.calls.filter((c) => c.turnId === turn.id);
    expect(calls.map((c) => c.kind)).toEqual(['chat', 'retry', 'tactic']);
    expect(calls[1]!.body.temperature).toBe(RETRY_TEMPERATURE);
    expect(calls[1]!.messages.length).toBeLessThan(calls[0]!.messages.length);
    expect(turn.reply).not.toBe(LOOPED);
    expect(turn.replySource).toBe('authored');
    expect(labKinling(s).chat.at(-1)).toMatchObject({ role: 'creature', source: 'authored', text: turn.reply });
  });

  it('keeps a good retry', async () => {
    const { api, get } = session();
    queue.push(LOOPED, 'A war? That sounds frightening, Sam.');
    await runTurn(api, REPAIR);
    expect(get().turns.at(-1)).toMatchObject({ reply: 'A war? That sounds frightening, Sam.', replySource: 'ai' });
  });

  it('can be turned off to see what the model really does', async () => {
    const { api, get } = session(false);
    queue.push(LOOPED);
    await runTurn(api, REPAIR);
    const s = get();
    expect(s.calls.filter((c) => c.kind === 'chat' || c.kind === 'retry')).toHaveLength(1);
    expect(s.turns.at(-1)).toMatchObject({ reply: LOOPED, replySource: 'ai' });
  });

  it('a tactic the model claims without real evidence is not applied', async () => {
    const { api, get } = session();
    queue.push('A war sounds frightening.');
    tacticOutput = '{"tactic":"command","words":"obey me"}';
    const before = { ...labKinling(get()).personality };
    await runTurn(api, REPAIR);
    expect(get().turns.at(-1)!.persuasion).toBeUndefined();
    expect(labKinling(get()).personality).toEqual(before);
  });

  it('a tactic with evidence is applied at half strength and marked as from the model', async () => {
    const { api, get } = session();
    queue.push('Oh. Okay.');
    tacticOutput = '{"tactic":"reveal","words":"just code"}';
    await runTurn(api, 'whatever, you are made of just code anyway');
    const p = get().turns.at(-1)!.persuasion!;
    expect(p).toMatchObject({ tactic: 'reveal', source: 'model' });
    expect(get().calls.find((c) => c.kind === 'tactic')!.parsed).toEqual({ tactic: 'reveal', strength: 0.5 });
  });
});

describe('evolve template', () => {
  it('a session still on an old default evolve prompt gets the current one; an edited one is kept', () => {
    for (const old of OLD_EVOLVE_SYSTEMS) {
      const s = freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: EGGS.woodland.personality }, T0);
      s.config.evolve.systemTemplate = old.replace(/\n/g, '\r\n');
      expect(normalizeSession(s).config.evolve.systemTemplate).toBe(DEFAULT_EVOLVE_SYSTEM);
    }
    const s = freshSession({ egg: 'woodland', name: 'Pip', player: 'Ana', personality: EGGS.woodland.personality }, T0);
    s.config.evolve.systemTemplate = `${OLD_EVOLVE_SYSTEMS[0]}\nBe generous.`;
    expect(normalizeSession(s).config.evolve.systemTemplate).toBe(`${OLD_EVOLVE_SYSTEMS[0]}\nBe generous.`);
  });

  it('the default says loops are not growth and names every trait; the old three-trait one did not', () => {
    expect(DEFAULT_EVOLVE_SYSTEM).toContain('Repeating itself or missing what {{player}} said is not growth.');
    expect(unmentionedTraits(DEFAULT_EVOLVE_SYSTEM)).toEqual([]);
    expect(unmentionedTraits(OLD_EVOLVE_SYSTEMS[0]!)).toEqual(['devotion', 'fear', 'defiance']);
  });
});
