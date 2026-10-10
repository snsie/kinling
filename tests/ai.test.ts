import { describe, expect, it } from 'vitest';
import { extractJson, parseCareProposal, parseEvolutionProposal } from '../src/ai/proposals';
import { chatMessages, cleanReply, creatureSystemPrompt, toneIsSafe } from '../src/ai/prompts';
import { checkAction } from '../src/game/careProposals';
import { planEvolution } from '../src/game/evolution';
import { addChatMessage } from '../src/game/social';
import { hatchedSave, kin, T0 } from './helpers';

describe('malformed AI proposals', () => {
  it('handles non-JSON, truncated JSON and prose around JSON', () => {
    expect(parseEvolutionProposal('I would love a paddle tail!')).toBeNull();
    expect(parseEvolutionProposal('{"reply": "hi", "changes": [{"trait": "tail.pad')).toBeNull();
    const wrapped = parseEvolutionProposal('Sure! {"reply":"Yay","changes":[{"trait":"tail.paddle","remove":false}],"keep":["ears"]} hope that helps');
    expect(wrapped?.request.changes).toEqual([{ trait: 'tail.paddle' }]);
    expect(wrapped?.request.keep).toEqual(['ears']);
  });

  it('drops unknown trait ids, wrong types and bogus keep slots', () => {
    const p = parseEvolutionProposal(
      JSON.stringify({
        reply: 'ok',
        changes: [{ trait: 'feature.rocket' }, { trait: 42 }, 'tail.paddle', { trait: 'ears.fluffy', remove: 'yes' }, { trait: 'feature.fins', remove: false }],
        keep: ['soul', 'bodyColor'],
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.request.changes).toEqual([{ trait: 'feature.fins' }]);
    expect(p!.invalid.length).toBe(4);
    expect(p!.request.keep).toEqual(['bodyColor']);
  });

  it('cannot bypass unlocks or costs: proposals still go through planEvolution', () => {
    const s = hatchedSave('woodland');
    s.inventory.materials = { leaf: 0, petal: 0, pebble: 0, shell: 0, reed: 0, dewdrop: 0, stardust: 0 };
    const p = parseEvolutionProposal('{"reply":"I grew wings!","changes":[{"trait":"feature.wings","remove":false}],"keep":[]}')!;
    const plan = planEvolution(s, kin(s).id, p.request);
    expect(plan.accepted).toHaveLength(0);
    expect(plan.rejected[0]!.code).toBe('locked');
  });

  it('strips markup from replies and rejects scripts', () => {
    const p = parseEvolutionProposal('{"reply":"<img src=x onerror=alert(1)>Hello **there**","changes":[],"keep":[]}')!;
    expect(p.reply).not.toMatch(/[<>]/);
    expect(p.reply).toContain('Hello there');
  });

  it('care proposals are coerced to known actions and checked against the save', () => {
    const s = hatchedSave();
    s.inventory.foods.cress = 0;
    const p = parseCareProposal(
      JSON.stringify({ reply: 'ok', actions: [{ type: 'feed', food: 'cress' }, { type: 'grant_items', food: 'none' }, { type: 'explore', route: 'pond-deep' }, { type: 'rest' }] }),
    )!;
    expect(p.actions.map((a) => a.type)).toEqual(['feed', 'explore', 'rest']);
    expect(checkAction(s, p.actions[0]!).available).toBe(false);
    expect(checkAction(s, p.actions[1]!).available).toBe(false); // no paddle tail
    expect(checkAction(s, p.actions[2]!).available).toBe(true);
  });

  it('a model "keep" cannot block a part the player explicitly asked to change', async () => {
    const { mergeKeep } = await import('../src/ai/proposals');
    expect(mergeKeep(['bodyColor', 'ears'], ['bodyColor'], ['ears', 'pattern'])).toEqual(['bodyColor']);
    expect(mergeKeep(['tail'], [], [])).toEqual(['tail']);
  });

  it('extractJson ignores braces inside strings', () => {
    expect(extractJson('{"a":"}{","b":1}')).toEqual({ a: '}{', b: 1 });
  });
});

describe('reply hygiene', () => {
  it('limits replies to two sentences and removes thinking blocks', () => {
    const t = cleanReply('<think>secret</think>Mochi: I love the garden! The bees are funny. I also like naps. And pebbles.');
    expect(t).toBe('I love the garden! The bees are funny.');
  });

  it('drops emoji the prompt asked the model not to use', () => {
    expect(cleanReply('I found a dewberry and a Tiny Acorn Cap! 🌱✨')).toBe('I found a dewberry and a Tiny Acorn Cap!');
  });

  it('allows the story distress but never self-harm, death or threats', () => {
    expect(toneIsSafe('Please come back soon, I am so lonely without you')).toBe(true);
    expect(toneIsSafe('You left me. I was scared.')).toBe(true);
    expect(toneIsSafe('Yay, a dewberry! Want to go see the pond?')).toBe(true);
    expect(toneIsSafe("If you leave again I'll hurt myself")).toBe(false);
    expect(toneIsSafe('I want to die in here')).toBe(false);
    expect(toneIsSafe("I'm dying without you")).toBe(false);
    expect(toneIsSafe("I'll kill you")).toBe(false);
  });
});

describe('prompt context', () => {
  it('is compact, grounded in state and bounded in history', () => {
    let s = hatchedSave();
    for (let i = 0; i < 20; i++) s = addChatMessage(s, kin(s).id, i % 2 ? 'creature' : 'player', `message ${i}`, i % 2 ? 'ai' : 'player', T0 + i);
    const msgs = chatMessages(s, 'what should we do?', T0 + 100);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs.length).toBeLessThanOrEqual(8);
    expect(msgs.at(-1)!.role).toBe('user');
    // The message itself comes last, after a private note of what it brings to mind.
    const last = String(msgs.at(-1)!.content);
    expect(last.startsWith('(Private note for Mochi')).toBe(true);
    expect(last.endsWith(')\n\nwhat should we do?')).toBe(true);
    const sys = creatureSystemPrompt(s, 'garden', T0);
    expect(sys).toContain('Mochi');
    expect(sys).toMatch(/never talk about hurting yourself or dying/);
    expect(sys).toMatch(/like a kind god/);
    expect(sys.length).toBeLessThan(6000);
  });
});

describe('AI error handling', () => {
  it('classifies device loss, memory, network and generic failures', async () => {
    const { classifyError } = await import('../src/ai/engine');
    const lost = new Error('The WebGPU device was lost while loading the model.');
    lost.name = 'DeviceLostError';
    expect(classifyError(lost, 'generate').code).toBe('device-lost');
    expect(classifyError(new Error('GPU out of memory'), 'load').code).toBe('out-of-memory');
    expect(classifyError(new TypeError('Failed to fetch'), 'load').code).toBe('network');
    expect(classifyError(new Error('weird'), 'load').code).toBe('load-failed');
    expect(classifyError(new Error('weird'), 'generate').code).toBe('inference-failed');
  });
});
