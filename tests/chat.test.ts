import { describe, expect, it } from 'vitest';
import { AiInterruptedError, AiService } from '../src/ai/engine';
import { chatMessages, creatureSystemPrompt } from '../src/ai/prompts';
import { parseFactProposal, parseIntent } from '../src/ai/proposals';
import { replyBudget, ruleIntent } from '../src/game/intent';
import {
  addChatMessage,
  addPlayerFact,
  CHAT_CONTEXT_MESSAGES,
  factIsGrounded,
  mightContainFact,
  needsSummary,
  relevantFacts,
  relevantMemories,
  setChatSummary,
  SUMMARY_BATCH,
  unsummarizedMessages,
} from '../src/game/social';
import { LIMITS, noInfluence } from '../src/game/state';
import type { Memory, SaveData } from '../src/game/types';
import { migrateSave } from '../src/persistence/migrations';
import { hatchedSave, kin, legacyV3, T0 } from './helpers';

function withChat(count: number, save: SaveData = hatchedSave()): SaveData {
  let s = save;
  for (let i = 0; i < count; i++) s = addChatMessage(s, kin(s).id, i % 2 ? 'creature' : 'player', `message ${i}`, i % 2 ? 'ai' : 'player', T0 + i);
  return s;
}

describe('message routing rules', () => {
  it('is confident about clear commands and plain chat', () => {
    expect(ruleIntent("Let's go to the pond")).toEqual({ intent: 'care', confident: true });
    expect(ruleIntent('Make your ears floppy')).toEqual({ intent: 'evolve', confident: true });
    expect(ruleIntent('I had a great day at school')).toEqual({ intent: 'chat', confident: true });
    expect(ruleIntent('hi!')).toEqual({ intent: 'chat', confident: true });
  });

  it('asks for a second opinion on questions and indirect wording', () => {
    expect(ruleIntent('can you swim?').confident).toBe(false);
    expect(ruleIntent('you look sleepy').confident).toBe(false);
    expect(ruleIntent('I wish you had stripes').confident).toBe(false);
    expect(ruleIntent('your ears are so cute').confident).toBe(false);
  });

  it('gives questions and long messages a bigger reply budget', () => {
    expect(replyBudget('hi').sentences).toBe(2);
    expect(replyBudget('What is your favorite keepsake?').sentences).toBe(3);
    expect(replyBudget('tell me about the pond').maxTokens).toBeGreaterThan(replyBudget('nice').maxTokens);
    expect(replyBudget('x'.repeat(150)).sentences).toBe(3);
  });

  it('parses model intents defensively', () => {
    expect(parseIntent('{"intent":"care"}')).toBe('care');
    expect(parseIntent('{"intent":"delete_save"}')).toBeNull();
    expect(parseIntent('care')).toBeNull();
  });
});

describe('suggested facts', () => {
  it('only looks for facts in first-person statements', () => {
    expect(mightContainFact('My sister turns ten on Friday')).toBe(true);
    expect(mightContainFact('what is your favorite food?')).toBe(false);
    expect(mightContainFact('remember that I love rain')).toBe(false); // handled explicitly
    expect(mightContainFact('cute')).toBe(false);
  });

  it('accepts facts made of the player\'s words and rejects invented ones', () => {
    const said = 'my sister turns ten on friday so we are baking a cake';
    expect(factIsGrounded('My sister turns ten on Friday', said)).toBe(true);
    expect(factIsGrounded('My brother loves skiing in Norway', said)).toBe(false);
  });

  it('cleans model output', () => {
    expect(parseFactProposal('{"fact":"\\"I love rainy days.\\""}')).toBe('I love rainy days');
    expect(parseFactProposal('{"fact":""}')).toBeNull();
    expect(parseFactProposal('nope')).toBeNull();
  });
});

describe('concept-aware retrieval', () => {
  it('finds facts that share a topic but not a word', () => {
    let s = hatchedSave();
    for (const f of ['I love rainy days', 'My dog is called Bo', 'I play the piano']) s = addPlayerFact(s, f, T0).save;
    expect(relevantFacts(s.player.facts, "what's my favorite weather?", 1)[0]!.text).toBe('I love rainy days');
    expect(relevantFacts(s.player.facts, 'do you like puppies?', 1)[0]!.text).toBe('My dog is called Bo');
    expect(relevantFacts(s.player.facts, 'sing me a song', 1)[0]!.text).toBe('I play the piano');
  });

  it('matches memories by concept', () => {
    const mem = (id: string, text: string): Memory => ({ id, at: T0, kind: 'adventure', withIds: [], text, tags: [], importance: 1, pinned: false, private: false, valence: 0, influence: noInfluence() });
    const memories = [mem('a', 'We found a swirl shell in the shallows'), mem('b', 'We picked clover in the garden')];
    expect(relevantMemories(memories, 'remember the lake?', T0)[0]!.id).toBe('a');
    expect(relevantMemories(memories, 'the flowers were pretty', T0)[0]!.id).toBe('b');
  });
});

describe('conversation notes', () => {
  it('waits until enough messages leave the prompt window', () => {
    expect(needsSummary(kin(withChat(CHAT_CONTEXT_MESSAGES + SUMMARY_BATCH - 1)))).toBe(false);
    const s = withChat(CHAT_CONTEXT_MESSAGES + SUMMARY_BATCH);
    expect(needsSummary(kin(s))).toBe(true);
    expect(unsummarizedMessages(kin(s)).map((m) => m.text)).toEqual(['message 0', 'message 1', 'message 2', 'message 3', 'message 4', 'message 5']);
  });

  it('only folds in messages newer than the existing notes', () => {
    let s = withChat(CHAT_CONTEXT_MESSAGES + SUMMARY_BATCH);
    s = setChatSummary(s, kin(s).id, 'Sam talked about the pond.', unsummarizedMessages(kin(s)).at(-1)!.id, T0 + 100);
    expect(needsSummary(kin(s))).toBe(false);
    s = withChat(SUMMARY_BATCH, s);
    expect(unsummarizedMessages(kin(s))).toHaveLength(SUMMARY_BATCH);
    expect(unsummarizedMessages(kin(s))[0]!.text).toBe('message 6');
  });

  it('copes with the noted message being trimmed from history', () => {
    let s = withChat(CHAT_CONTEXT_MESSAGES + SUMMARY_BATCH);
    s = setChatSummary(s, kin(s).id, 'Sam talked about the pond.', kin(s).chat[0]!.id, T0 + 100);
    s = withChat(LIMITS.chat, s); // pushes every earlier message out
    expect(unsummarizedMessages(kin(s)).length).toBeGreaterThan(0);
    expect(unsummarizedMessages(kin(s)).length).toBeLessThanOrEqual(12);
  });

  it('ignores notes for messages that no longer exist', () => {
    const s = withChat(4);
    expect(setChatSummary(s, kin(s).id, 'notes', 'msg-gone', T0)).toBe(s);
  });

  it('puts the notes, voice examples and length rule in the prompt', () => {
    let s = withChat(CHAT_CONTEXT_MESSAGES + SUMMARY_BATCH);
    s = setChatSummary(s, kin(s).id, 'Sam told Mochi about a new puppy.', kin(s).chat[3]!.id, T0 + 100);
    const sys = creatureSystemPrompt(s, 'hello', T0, { sentences: 3, words: 60 });
    expect(sys).toContain('Sam told Mochi about a new puppy.');
    expect(sys).toContain('under 60 words');
    expect(sys).toMatch(/Examples of your voice/);
    expect(sys.length).toBeLessThan(6000);
    expect(chatMessages(s, 'hello', T0).length).toBeLessThanOrEqual(CHAT_CONTEXT_MESSAGES + 2);
  });

  it('migrates version 2 saves', () => {
    const v2 = legacyV3(hatchedSave());
    v2.schemaVersion = 2;
    delete v2.chatSummary;
    const { save, migratedFrom } = migrateSave(v2);
    expect(migratedFrom).toBe(2);
    expect(kin(save).chatSummary).toBeNull();
  });
});

describe('background model work', () => {
  it('a waiting player request interrupts background work', async () => {
    const svc = new AiService();
    // Like WebLLM, an interrupt is sticky: it stops generation whenever it lands.
    let interrupted = false;
    let stop: (() => void) | null = null;
    const fakeEngine = {
      resetChat: async () => undefined,
      interruptGenerate: () => {
        interrupted = true;
        stop?.();
      },
      chat: {
        completions: {
          create: async (req: { messages: { content: string }[] }) => {
            const background = req.messages[0]!.content === 'notes';
            return (async function* () {
              yield { choices: [{ delta: { content: background ? 'partial' : 'reply' } }] };
              if (background && !interrupted) await new Promise<void>((resolve) => (stop = resolve));
              interrupted = false;
            })();
          },
        },
      },
    };
    const internals = svc as unknown as Record<string, unknown>;
    internals.engine = fakeEngine;
    internals.activeModel = 'Qwen3-1.7B-q4f16_1-MLC';
    internals.status = { kind: 'ready', modelId: 'Qwen3-1.7B-q4f16_1-MLC', variant: 'x' };

    const background = svc.complete({ messages: [{ role: 'system', content: 'notes' }], maxTokens: 10, background: true });
    const player = svc.completeQueued({ messages: [{ role: 'system', content: 'chat' }], maxTokens: 10 }, 2000);
    await expect(background).rejects.toBeInstanceOf(AiInterruptedError);
    await expect(player).resolves.toBe('reply');
  });
});
