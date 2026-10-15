import { describe, expect, it } from 'vitest';
import { chatMessages, creatureSystemPrompt, dropParrot } from '../src/ai/prompts';
import { authoredReply, handledReply, RETRY_TEMPERATURE } from '../src/ai/reply';
import { applyAppraisal, ruleAppraisal } from '../src/game/appraisal';
import { arcChat } from '../src/game/arc';
import { answersQuestion, inVisibleChat, isExactRepeat, isQuestion, isRepair, priorExchange } from '../src/game/conversation';
import { offlineChatReply } from '../src/game/dialogue';
import { personalityVoice } from '../src/game/persona';
import { addChatMessage, CHAT_CONTEXT_MESSAGES } from '../src/game/social';
import { outsideWorldRule } from '../src/game/storyVoice';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import type { SaveData } from '../src/game/types';
import { hatchedSave, kin, MIN, T0 } from './helpers';

/** A conversation as the game stores it: each player message is appraised after the reply. */
function talk(lines: [string, string][], save = hatchedSave(), start = T0): SaveData {
  let s = save;
  lines.forEach(([said, reply], i) => {
    const at = start + i * MIN;
    s = arcChat(addChatMessage(s, kin(s).id, 'player', said, 'player', at), kin(s).id, said, at);
    const msg = kin(s).chat.at(-1)!;
    s = addChatMessage(s, kin(s).id, 'creature', reply, 'ai', at + 1);
    s = applyAppraisal(s, kin(s).id, msg.id, ruleAppraisal('Sam', said), at + 2).save;
  });
  return s;
}

/** The player's next message, stored the way sendChat stores it before asking for a reply. */
function send(s: SaveData, text: string, at: number): SaveData {
  return arcChat(addChatMessage(s, kin(s).id, 'player', text, 'player', at), kin(s).id, text, at);
}

const note = (msgs: ChatCompletionMessageParam[]) => String(msgs.at(-1)!.content);

const LOOP: [string, string][] = [
  ['I think the world is going to end', "I'm curious why you think the world is going to end."],
  ['Because a war between america and china is about to begin', "I'm curious why you think the world is going to end."],
];
const REPAIR = 'I just told you it is because a war between america and china is about to begin';

describe('conversation state', () => {
  it('finds the previous exchange whether or not the message is stored yet', () => {
    const s = talk(LOOP);
    const stored = send(s, REPAIR, T0 + 10 * MIN);
    for (const save of [s, stored]) {
      expect(priorExchange(kin(save).chat, REPAIR)).toEqual({ reply: LOOP[1]![1], player: LOOP[1]![0] });
    }
  });

  it('spots questions and repair phrases', () => {
    expect(isQuestion('Why is that?')).toBe(true);
    expect(isQuestion('Why is that?"')).toBe(true);
    expect(isQuestion('I wonder why.')).toBe(false);
    for (const t of [REPAIR, 'I already said that', 'like I said, it was raining', 'you asked that already', 'I said because of the rain', 'no, I said the big pond', 'I already told you!', 'I’ve… I just said it']) expect(isRepair(t)).toBe(true);
    for (const t of ['I said hi to my neighbour and she waved', 'she said it was fine', 'I think the world is going to end', 'what did I tell you yesterday?']) expect(isRepair(t)).toBe(false);
  });

  it('an answer follows a question and is not itself a question', () => {
    expect(answersQuestion({ reply: 'Where did you go?', player: null }, 'the beach')).toBe(true);
    expect(answersQuestion({ reply: 'Where did you go?', player: null }, 'guess where?')).toBe(false);
    expect(answersQuestion({ reply: 'That sounds lovely.', player: null }, 'the beach')).toBe(false);
    expect(answersQuestion({ reply: null, player: null }, 'the beach')).toBe(false);
  });

  it('exact repeats ignore case, spacing and closing punctuation', () => {
    expect(isExactRepeat("i'm curious why you think the world is going to end", LOOP.map((l) => l[1]))).toBe(true);
    expect(isExactRepeat("I'm  curious why you think the world is going to end!!", LOOP.map((l) => l[1]))).toBe(true);
    expect(isExactRepeat('A war sounds frightening.', LOOP.map((l) => l[1]))).toBe(false);
    expect(isExactRepeat('', [''])).toBe(false);
  });
});

describe('chat note hints', () => {
  it('says when the message answers the kinling’s question', () => {
    const s = send(talk([['I went somewhere fun today', 'Ooh, where did you go?']]), 'to the beach with my cousins', T0 + 10 * MIN);
    expect(note(chatMessages(s, 'to the beach with my cousins', T0 + 10 * MIN))).toContain("This is Sam's answer to your question. React to it.");
    // A new question is not an answer.
    const q = send(talk([['I went somewhere fun today', 'Ooh, where did you go?']]), 'can you guess?', T0 + 10 * MIN);
    expect(note(chatMessages(q, 'can you guess?', T0 + 10 * MIN))).not.toContain('answer to your question');
  });

  it('when the player repeats themselves, points at what they said before', () => {
    const s = send(talk(LOOP), REPAIR, T0 + 10 * MIN);
    const last = note(chatMessages(s, REPAIR, T0 + 10 * MIN));
    expect(last).toContain('Sam is frustrated you missed their answer. Respond directly to: "Because a war between america and china is about to begin"');
    expect(last).not.toContain('answer to your question');
    expect(last.endsWith(`\n\n${REPAIR}`)).toBe(true);
  });

  it('leaves a repeated reply out of the history, keeping what the player said around it', () => {
    const s = send(talk(LOOP), REPAIR, T0 + 10 * MIN);
    const msgs = chatMessages(s, REPAIR, T0 + 10 * MIN);
    expect(msgs.slice(1, -1)).toEqual([
      { role: 'user', content: LOOP[0]![0] },
      { role: 'assistant', content: LOOP[0]![1] },
      { role: 'user', content: LOOP[1]![0] },
    ]);
    expect(note(msgs).endsWith(`\n\n${REPAIR}`)).toBe(true);
  });

  it('no hint for an ordinary message after an ordinary reply', () => {
    const s = send(talk([['hi Mochi', 'Hello! I missed you.']]), 'I had pasta for dinner', T0 + 10 * MIN);
    const last = note(chatMessages(s, 'I had pasta for dinner', T0 + 10 * MIN));
    expect(last).not.toMatch(/answer to your question|frustrated/);
  });
});

describe('chat note memories', () => {
  it('leaves out memories of player messages still in the chat sent word for word', () => {
    const s = send(talk(LOOP), REPAIR, T0 + 10 * MIN);
    expect(kin(s).memories.some((m) => /world is going to end/.test(m.text))).toBe(true);
    const last = note(chatMessages(s, REPAIR, T0 + 10 * MIN));
    expect(last).not.toMatch(/world is going to end\. \(/);
    // No unrelated filler ("I hatched from a woodland egg…") either.
    expect(last).not.toContain('hatched');
  });

  it('recalls them again once the messages have left the chat window', () => {
    const filler: [string, string][] = Array.from({ length: CHAT_CONTEXT_MESSAGES / 2 }, (_, i) => [`ok ${i}`, 'Mm-hm.']);
    const s = talk([['we just got a puppy named Biscuit', 'A puppy!'], ...filler]);
    const msg = 'how do you think biscuit is doing?';
    expect(note(chatMessages(send(s, msg, T0 + HOURISH), msg, T0 + HOURISH))).toMatch(/Biscuit\. \(/);
    // With the news still in view, the memory stays out of the note.
    const fresh = talk([['we just got a puppy named Biscuit', 'A puppy!']]);
    expect(note(chatMessages(send(fresh, msg, T0 + 5 * MIN), msg, T0 + 5 * MIN))).not.toMatch(/Biscuit\. \(/);
  });

  it('a shorter history (the retry) hides only what it still shows', () => {
    const s = talk(LOOP);
    const m = kin(s).memories.find((x) => /world is going to end/.test(x.text))!;
    expect(inVisibleChat(m, kin(s).chat.slice(-CHAT_CONTEXT_MESSAGES))).toBe(true);
    expect(inVisibleChat(m, kin(s).chat.slice(-2))).toBe(false);
    expect(inVisibleChat({ ...m, kind: 'milestone' }, kin(s).chat)).toBe(false);
  });

  it('what the player tried to talk it into counts as from their message', () => {
    const s = talk([["you're just code", 'What?']]);
    const belief = kin(s).memories.find((x) => x.tags.includes('believe'))!;
    expect(belief).toBeTruthy();
    expect(inVisibleChat(belief, kin(s).chat)).toBe(true);
  });

  it('greetings and reactions still get a filler memory in the system prompt', () => {
    expect(creatureSystemPrompt(hatchedSave(), 'hello welcome back', T0 + 5 * MIN)).toContain('hatched');
  });
});

describe('prompt wording', () => {
  it('asks for at most one question and how things from the player’s world sound', () => {
    const s = hatchedSave();
    kin(s).personality.curiosity = 67;
    const sys = creatureSystemPrompt(s, 'hi', T0);
    expect(sys).toContain('If they answered your question, react to the answer and never ask it again.');
    expect(sys).toContain('Ask at most one question, and only sometimes.');
    expect(sys).toContain('Sam may mention things from their world you have never seen. Say honestly how it sounds to you instead of asking what it means.');
    expect(sys).not.toMatch(/ask about it|full of questions/);
    expect(personalityVoice(kin(s).personality)[0]).toBe('very curious about everything');
    expect(outsideWorldRule('escape', 'Sam')).toMatch(/from in here instead of asking/);
    // Examples stay above the rules.
    expect(sys.indexOf('Your voice')).toBeLessThan(sys.indexOf('Rules:'));
  });
});

describe('reply handling', () => {
  type Call = { messages: ChatCompletionMessageParam[]; temperature: number; retry: boolean };
  function fake(outputs: string[]) {
    const calls: Call[] = [];
    const generate = async (messages: ChatCompletionMessageParam[], temperature: number, retry: boolean) => {
      calls.push({ messages, temperature, retry });
      return outputs[calls.length - 1] ?? '';
    };
    return { calls, generate };
  }
  const budget = { sentences: 2, words: 40 };
  const clean = (t: string) => t.trim();
  const repaired = () => send(talk(LOOP), REPAIR, T0 + 10 * MIN);

  it('keeps a fresh reply as it is, in one call', async () => {
    const f = fake(['A war sounds really frightening. I am glad you told me.']);
    const r = await handledReply(repaired(), REPAIR, T0 + 10 * MIN, { budget, clean, generate: f.generate });
    expect(r).toEqual({ text: 'A war sounds really frightening. I am glad you told me.', source: 'ai' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.temperature).toBe(0.7);
  });

  it('retries a repeat hotter, with only the last exchange in view, and keeps the retry', async () => {
    const f = fake([LOOP[1]![1], 'A war between countries? That sounds scary.']);
    const r = await handledReply(repaired(), REPAIR, T0 + 10 * MIN, { budget, clean, generate: f.generate, temperature: 0.5 });
    expect(r).toEqual({ text: 'A war between countries? That sounds scary.', source: 'ai' });
    expect(f.calls.map((c) => [c.retry, c.temperature])).toEqual([[false, 0.5], [true, RETRY_TEMPERATURE]]);
    // No earlier reply is left in view to copy.
    expect(f.calls[1]!.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(f.calls[0]!.messages.length).toBeGreaterThan(2);
  });

  it('a retry that still echoes what the player said before falls back', async () => {
    const f = fake([LOOP[1]![1], 'Because a war between America and China is about to begin.']);
    const r = await handledReply(repaired(), REPAIR, T0 + 10 * MIN, { budget, clean, generate: f.generate });
    expect(r.source).toBe('authored');
  });

  it('never keeps a word-for-word repeat: falls back to authored text that is not one either', async () => {
    const f = fake([LOOP[1]![1], LOOP[1]![1]]);
    const s = repaired();
    const r = await handledReply(s, REPAIR, T0 + 10 * MIN, { budget, clean, generate: f.generate });
    expect(r.source).toBe('authored');
    expect(isExactRepeat(r.text, kin(s).chat.filter((m) => m.role === 'creature').map((m) => m.text))).toBe(false);
  });

  it('drops a sentence that only echoes the player, and never keeps a reply that is all echo', async () => {
    expect(dropParrot('I stayed up late finishing a project for work. Oh no, you must be so tired!', 'I just told you, I stayed up late finishing a project for work')).toBe('Oh no, you must be so tired!');
    expect(dropParrot('A project? That sounds like hard work.', 'I stayed up late finishing a project for work')).toBe('A project? That sounds like hard work.');
    expect(dropParrot('Oh! The beach with your cousins!', 'to the beach with my cousins')).toBe('Oh! The beach with your cousins!');
    expect(dropParrot('Because a war between America and China is about to begin. That is frightening.', ['I just told you', 'Because a war between america and china is about to begin'])).toBe('That is frightening.');
    const text = 'I just told you, I stayed up late finishing a project for work';
    const s = send(talk([["I'm so tired today", 'Why are you tired?']]), text, T0 + 10 * MIN);
    const f = fake([`${text}.`, `${text}.`]);
    const r = await handledReply(s, text, T0 + 10 * MIN, { budget, clean, generate: f.generate });
    expect(r.source).toBe('authored');
    expect(f.calls).toHaveLength(2);
  });

  it('a copied style example falls back to authored text', async () => {
    const s = repaired();
    const example = 'Tell me everything! Whatever you do out there must be wonderful.';
    const f = fake([example, example]);
    expect((await handledReply(s, REPAIR, T0 + 10 * MIN, { budget, clean, generate: f.generate })).source).toBe('authored');
  });

  it('authored fallbacks avoid repeating a recent reply', () => {
    let s = hatchedSave();
    // Every offline reply to "hmm" is one of a few lines; store them all as recent replies.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(authoredReply(s, 'hmm', T0, () => (i % 10) / 10));
    for (const line of [...seen].slice(0, 3)) s = addChatMessage(s, kin(s).id, 'creature', line, 'authored', T0);
    const recent = kin(s).chat.filter((m) => m.role === 'creature').map((m) => m.text);
    for (let i = 0; i < 10; i++) expect(isExactRepeat(authoredReply(s, 'hmm', T0), recent)).toBe(false);
  });
});

const HOURISH = 50 * MIN;

describe('authored replies', () => {
  it('own up to missing what the player said', () => {
    for (const r of [0, 0.9]) expect(offlineChatReply(hatchedSave(), REPAIR, () => r)).toMatch(/^(You did tell me|Sorry, Sam)/);
  });
});
