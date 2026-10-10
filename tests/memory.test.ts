import { describe, expect, it } from 'vitest';
import {
  applyAppraisal,
  memoryIsGrounded,
  mergeAppraisal,
  pendingAppraisals,
  personalityPressure,
  reflect,
  REFLECTION,
  retold,
  ruleAppraisal,
  shouldReflect,
} from '../src/game/appraisal';
import { holdConversation } from '../src/game/chatter';
import { offlineChatReply } from '../src/game/dialogue';
import { growthLines, personalityVoice, relationshipLine, siblingLines } from '../src/game/persona';
import { recall, whenLabel, type RecallItem } from '../src/game/recall';
import { addChatMessage, addPlayerFact, firstPerson, forgetMemory } from '../src/game/social';
import { feelingOf, noInfluence, recordMemory } from '../src/game/state';
import { PLAYER_ID, type SaveData } from '../src/game/types';
import { chatMessages, creatureSystemPrompt, dropRepeatedTail, dropUnaskedOffer, repeatsRecent } from '../src/ai/prompts';
import { parseAppraisal } from '../src/ai/proposals';
import { migrateSave } from '../src/persistence/migrations';
import { validateSave } from '../src/persistence/schema';
import { family, hatchedSave, HOUR, kin, MIN, T0 } from './helpers';

const item = (id: string, text: string, extra: Partial<RecallItem> = {}): RecallItem => ({ id, text, at: T0, importance: 1, ...extra });

/** A save where the player said `texts` to Mochi, each answered, all appraised by the rules. */
function chatted(texts: string[], save = hatchedSave(), start = T0): SaveData {
  let s = save;
  texts.forEach((text, i) => {
    const at = start + i * MIN;
    s = addChatMessage(s, kin(s).id, 'player', text, 'player', at);
    const msg = kin(s).chat.at(-1)!;
    s = addChatMessage(s, kin(s).id, 'creature', 'Oh!', 'authored', at + 1);
    s = applyAppraisal(s, kin(s).id, msg.id, ruleAppraisal('Sam', text), at + 2).save;
  });
  return s;
}

describe('recall', () => {
  it('lets a rare shared word outweigh common ones', () => {
    const items = [item('a', 'We went to the garden'), item('b', 'The garden was sunny'), item('c', 'I napped in the garden'), item('d', 'Sam got a puppy named Biscuit')];
    expect(recall(items, 'how is biscuit doing in the garden?', { now: T0, limit: 4 })[0]!.item.id).toBe('d');
  });

  it('adds at most one filler memory when nothing relates', () => {
    const items = [item('a', 'We found a swirl shell', { importance: 3 }), item('b', 'We picked clover')];
    const got = recall(items, 'what is two plus two', { now: T0, limit: 4, filler: 1 });
    expect(got).toHaveLength(1);
    expect(got[0]!.relevant).toBe(false);
    expect(got[0]!.item.id).toBe('a');
  });

  it('skips near-duplicates in favour of something different', () => {
    const items = [
      item('a', 'Sam got a puppy named Biscuit', { importance: 2 }),
      item('b', 'Sam got a fluffy puppy named Biscuit', { importance: 2 }),
      item('c', 'Biscuit the puppy chews everything', { importance: 1 }),
    ];
    const ids = recall(items, 'tell me about the puppy biscuit', { now: T0, limit: 2 }).map((r) => r.item.id);
    expect(ids).toContain('c');
    expect(ids).toHaveLength(2);
  });

  it('uses earlier turns for follow-up questions', () => {
    const items = [item('a', 'Sam got a puppy named Biscuit'), item('b', 'Sam likes the color blue')];
    expect(recall(items, 'what was its name again?', { now: T0, limit: 1, context: 'we got a new puppy' })[0]!.item.id).toBe('a');
  });

  it('boosts memories about a kinling named in the message', () => {
    const items = [item('a', 'We talked about snacks', { withIds: ['kin-pip'] }), item('b', 'We talked about snacks', { withIds: ['kin-fig'] })];
    expect(recall(items, 'how was the snack talk?', { now: T0, limit: 1, boostIds: new Set(['kin-fig']) })[0]!.item.id).toBe('b');
  });

  it('finds meaning matches through embeddings when words differ', () => {
    const items = [item('a', 'My friend was mean to me at school'), item('b', 'We picked clover'), item('c', 'The pond was cold'), item('d', 'I had a seed bun'), item('e', 'Sam named me Mochi')];
    const vec = (x: number, y: number) => Float32Array.from([x, y]);
    const vectors: Record<string, Float32Array> = { [items[0]!.text]: vec(1, 0.1), [items[1]!.text]: vec(0, 1), [items[2]!.text]: vec(0.1, 1), [items[3]!.text]: vec(0, 1), [items[4]!.text]: vec(0.2, 1) };
    const got = recall(items, "everything went wrong today", { now: T0, limit: 1, filler: 0, queryVector: vec(1, 0), vectorOf: (t) => vectors[t] });
    expect(got[0]!.item.id).toBe('a');
    expect(recall(items, "everything went wrong today", { now: T0, limit: 1, filler: 0 })).toHaveLength(0);
  });

  it('places memories in time', () => {
    expect(whenLabel(T0, T0 + 5 * MIN)).toBe('just now');
    expect(whenLabel(T0, T0 + 2 * HOUR)).toBe('earlier today');
    expect(whenLabel(T0, T0 + 24 * HOUR)).toBe('yesterday');
    expect(whenLabel(T0, T0 + 3 * 24 * HOUR)).toBe('3 days ago');
  });
});

describe('appraisal rules', () => {
  it('retells the player\'s words from the kinling\'s side', () => {
    expect(retold('hi Mochi! guess what, we just got a puppy named Biscuit')).toBe('they just got a puppy named Biscuit');
    expect(retold("I love rainy days, they're so cozy")).toBe("they love rainy days, they're so cozy");
    expect(retold("my piano recital is saturday and I'm nervous")).toBe("their piano recital is saturday and they're nervous");
  });

  it('recognises encouragement, unkindness, worries and small talk', () => {
    expect(ruleAppraisal('Sam', "you were so brave, I'm proud of you")).toMatchObject({ feeling: 'proud', growth: 'braver' });
    expect(ruleAppraisal('Sam', 'do you feel braver these days?').growth).toBe('none');
    expect(ruleAppraisal('Sam', 'you are so annoying, go away')).toMatchObject({ feeling: 'hurt', growth: 'shyer' });
    expect(ruleAppraisal('Sam', "my recital is saturday and I'm nervous")).toMatchObject({ feeling: 'worried', shared: true, importance: 2 });
    expect(ruleAppraisal('Sam', "my recital is saturday and I'm nervous").memory).toBe("Sam told me something was worrying them: their recital is saturday and they're nervous.");
    expect(ruleAppraisal('Sam', 'haha that is so silly').growth).toBe('more playful');
    expect(ruleAppraisal('Sam', 'I wonder what the stars are made of').growth).toBe('more curious');
    expect(ruleAppraisal('Sam', 'please be careful near the deep water').growth).toBe('more cautious');
    expect(ruleAppraisal('Sam', 'ok').memory).toBeNull();
  });

  it('accepts model memories only when grounded in what the player said', () => {
    const said = 'we just got a puppy named Biscuit';
    expect(memoryIsGrounded('Sam got a puppy named Biscuit.', said, ['Sam', 'Mochi'])).toBe(true);
    expect(memoryIsGrounded('Sam got a puppy named Biscuit and wants to swim in the pond.', said, ['Sam', 'Mochi'])).toBe(false);
  });

  it('takes growth from the rules and never remembers a bare question', () => {
    const tone = () => true;
    const rule = ruleAppraisal('Sam', 'we just got a puppy named Biscuit');
    const merged = mergeAppraisal(rule, { memory: 'Sam got a puppy named Biscuit.', importance: 'meaningful', feeling: 'excited' }, 'we just got a puppy named Biscuit', ['Sam', 'Mochi'], tone);
    expect(merged).toMatchObject({ memory: 'Sam got a puppy named Biscuit.', growth: 'none', feeling: 'excited', importance: 2 });
    const question = mergeAppraisal(ruleAppraisal('Sam', "what's my dog's name?"), { memory: "Sam's dog is named Biscuit.", importance: 'meaningful', feeling: 'happy' }, "what's my dog's name?", ['Sam'], tone);
    expect(question.memory).toBeNull();
    const invented = mergeAppraisal(rule, { memory: 'Sam is moving to Paris.', importance: 'big', feeling: 'worried' }, 'we just got a puppy named Biscuit', ['Sam'], tone);
    expect(invented.memory).toBe(rule.memory);
  });

  it('keeps the rules\' memory for very short messages and rejects broken quotes', () => {
    const tone = () => true;
    const lol = mergeAppraisal(ruleAppraisal('Sam', 'lol'), { memory: "Sam said 'lol", importance: 'small', feeling: 'excited' }, 'lol', ['Sam'], tone);
    expect(lol.memory).toBe('Sam and I were silly together.');
    const text = 'we went to the beach with grandma today';
    const broken = mergeAppraisal(ruleAppraisal('Sam', text), { memory: 'Sam said "we went to the beach with grandma', importance: 'small', feeling: 'happy' }, text, ['Sam'], tone);
    expect(broken.memory).toBe(ruleAppraisal('Sam', text).memory);
  });

  it('parses model output defensively', () => {
    expect(parseAppraisal('{"memory":"Sam got a puppy.","importance":"meaningful","feeling":"excited"}')).toMatchObject({ memory: 'Sam got a puppy.', importance: 'meaningful' });
    expect(parseAppraisal('{"memory":"x","importance":"huge","feeling":"ecstatic"}')).toMatchObject({ importance: 'small', feeling: 'neutral' });
    expect(parseAppraisal('not json')).toBeNull();
  });
});

describe('remembering a conversation', () => {
  it('remembers what was shared on its own, but not small talk', () => {
    const s = chatted(['we just got a puppy named Biscuit', 'ok', 'lol ok']);
    const chats = kin(s).memories.filter((m) => m.kind === 'player-chat').map((m) => m.text);
    expect(chats).toContain('Sam told me they just got a puppy named Biscuit.');
    expect(chats).not.toContain(expect.stringMatching(/\bok\b/));
  });

  it('turns a message into a memory with a feeling and an influence', () => {
    const s = chatted(["you were so brave at the pond, I'm proud of you"]);
    const m = kin(s).memories.find((x) => x.kind === 'player-chat')!;
    expect(m).toMatchObject({ valence: 2, importance: 2, withIds: [PLAYER_ID], private: true });
    expect(m.influence.confidence).toBe(1);
    expect(kin(s).appraisedThroughId).toBe(kin(s).chat.at(-2)!.id);
    const f = feelingOf(s, kin(s).id, PLAYER_ID)!;
    expect(f.warmth).toBeGreaterThan(20);
  });

  it('only appraises each message once, in order', () => {
    let s = hatchedSave();
    s = addChatMessage(s, kin(s).id, 'player', 'I love rainy days', 'player', T0);
    const id = kin(s).chat.at(-1)!.id;
    const once = applyAppraisal(s, kin(s).id, id, ruleAppraisal('Sam', 'I love rainy days'), T0).save;
    expect(applyAppraisal(once, kin(once).id, id, ruleAppraisal('Sam', 'I love rainy days'), T0).save).toBe(once);
    expect(pendingAppraisals(kin(once))).toHaveLength(0);
  });

  it('lists pending messages with their replies, newest few only', () => {
    let s = hatchedSave();
    for (let i = 0; i < 6; i++) {
      s = addChatMessage(s, kin(s).id, 'player', `message ${i}`, 'player', T0 + i);
      s = addChatMessage(s, kin(s).id, 'creature', `reply ${i}`, 'authored', T0 + i);
    }
    const pending = pendingAppraisals(kin(s));
    expect(pending.map((p) => p.message.text)).toEqual(['message 2', 'message 3', 'message 4', 'message 5']);
    expect(pending[0]!.reply!.text).toBe('reply 2');
  });

  it('merges hearing the same thing again, so it sticks', () => {
    const s = chatted(['you are so brave', 'you are so brave!', 'you are so brave!!']);
    const brave = kin(s).memories.filter((m) => m.kind === 'player-chat');
    expect(brave).toHaveLength(1);
    expect(brave[0]!.importance).toBe(3);
    expect(brave[0]!.influence.confidence).toBe(2);
  });

  it('lets unkind words cool feelings, but never below zero toward the player', () => {
    let s = hatchedSave();
    s.feelings = [{ from: kin(s).id, to: PLAYER_ID, warmth: 1, trust: 1, familiarity: 0, topics: [] }];
    s = chatted(['you are stupid', 'shut up'], s);
    const f = feelingOf(s, kin(s).id, PLAYER_ID)!;
    expect(f.warmth).toBe(0);
    expect(f.trust).toBe(0);
  });
});

describe('reflection', () => {
  it('moves personality toward what recent memories suggest, and remembers why', () => {
    const before = kin(hatchedSave()).personality.confidence;
    let s = chatted(["you were so brave at the pond, I'm proud of you", "I believe in you, you can do hard things"]);
    expect(shouldReflect(kin(s), T0 + 10 * MIN)).toBe(true);
    const r = reflect(s, kin(s).id, T0 + 10 * MIN);
    s = r.save;
    expect(r.change.confidence).toBe(2);
    expect(kin(s).personality.confidence).toBe(before + 2);
    expect(r.memory!.kind).toBe('reflection');
    expect(r.memory!.text).toMatch(/^Lately I've been feeling braver\. I keep thinking about when Sam cheered me on/);
    expect(s.events.at(-1)).toMatchObject({ kind: 'growth', text: 'Mochi has been feeling braver lately.' });
    expect(firstPerson(s, s.events.at(-1)!.text)).toBe('I have been feeling braver lately.');
    // Reflected influence is not counted again.
    expect(personalityPressure(kin(s)).confidence).toBe(0);
    expect(shouldReflect(kin(s), T0 + 11 * MIN)).toBe(false);
  });

  it('refreshes the same realisation instead of repeating it', () => {
    let s = chatted(["you were so brave, I'm proud of you", 'I believe in you']);
    s = reflect(s, kin(s).id, T0 + 10 * MIN).save;
    s = chatted(['I believe in you!', 'I believe in you!!'], s, T0 + 20 * MIN);
    const second = reflect(s, kin(s).id, T0 + 40 * MIN);
    expect(second.change.confidence).toBeGreaterThan(0);
    expect(kin(second.save).memories.filter((m) => m.kind === 'reflection')).toHaveLength(1);
    expect(second.save.events.filter((e) => e.kind === 'growth')).toHaveLength(2);
  });

  it('waits for enough to reflect on, or for a quiet spell', () => {
    const s = chatted(['haha you are silly']);
    expect(shouldReflect(kin(s), T0 + MIN)).toBe(false);
    expect(shouldReflect(kin(s), T0 + REFLECTION.quietMs + MIN)).toBe(false); // one small moment is not enough for a point
    const t = chatted(['haha you are silly', 'lol that joke', 'hehe tickle fight'], hatchedSave());
    expect(shouldReflect(kin(t), T0 + REFLECTION.quietMs + 10 * MIN)).toBe(true);
  });

  it('is capped per day and over a lifetime', () => {
    let s = hatchedSave();
    const k = kin(s);
    // Many strong memories at once still move a trait at most maxStep, then dailyCap per day.
    for (let i = 0; i < 10; i++) recordMemory(k, { kind: 'player-chat', text: `brave ${i}`, tags: [], importance: 3, influence: { ...noInfluence(), confidence: 2 } }, T0 + i);
    s = reflect(s, k.id, T0 + HOUR).save;
    expect(kin(s).personality.confidence - k.baseline.confidence).toBe(REFLECTION.maxStep);
    for (let i = 0; i < 10; i++) recordMemory(kin(s), { kind: 'player-chat', text: `more brave ${i}`, tags: [], importance: 3, influence: { ...noInfluence(), confidence: 2 } }, T0 + 2 * HOUR + i);
    s = reflect(s, k.id, T0 + 3 * HOUR).save;
    expect(kin(s).personality.confidence - k.baseline.confidence).toBe(REFLECTION.dailyCap);
    // Day after day, it stops at the lifetime limit.
    for (let day = 1; day <= 12; day++) {
      for (let i = 0; i < 4; i++) recordMemory(kin(s), { kind: 'player-chat', text: `day ${day} ${i}`, tags: [], importance: 3, influence: { ...noInfluence(), confidence: 2 } }, T0 + day * 24 * HOUR + i);
      s = reflect(s, k.id, T0 + day * 24 * HOUR + HOUR).save;
    }
    expect(kin(s).personality.confidence - k.baseline.confidence).toBe(REFLECTION.driftLimit);
  });

  it('forgetting a memory before reflecting removes its influence', () => {
    let s = chatted(["you were so brave, I'm proud of you", 'I believe in you']);
    for (const m of kin(s).memories.filter((x) => x.kind === 'player-chat')) s = forgetMemory(s, m.id);
    expect(personalityPressure(kin(s)).confidence).toBe(0);
    expect(reflect(s, kin(s).id, T0 + HOUR).change).toEqual({});
  });
});

describe('persona', () => {
  it('describes how personality sounds', () => {
    expect(personalityVoice({ curiosity: 80, confidence: 20, playfulness: 50, devotion: 70, fear: 10, defiance: 10 }).join(' ')).toMatch(/very curious.*shy.*bit of fun/);
  });

  it('describes the relationship with the player', () => {
    const s = hatchedSave();
    expect(relationshipLine(s, kin(s))).toMatch(/getting to know Sam|like Sam/);
    s.feelings = [{ from: kin(s).id, to: PLAYER_ID, warmth: 75, trust: 65, familiarity: 50, topics: [] }];
    expect(relationshipLine(s, kin(s))).toBe('You adore Sam; they are your favorite person. You trust them completely and tell them how you really feel.');
  });

  it('knows its siblings and their last chat', () => {
    let s = family(2);
    const [a, b] = s.kinlings;
    s = holdConversation(s, a!.id, b!.id, { now: T0, rand: () => 0.3 })!.save;
    const line = siblingLines(s, kin(s), T0 + 2 * HOUR)[0]!;
    expect(line).toMatch(/^Pip \(hatched from a aquatic egg; .+\): you are .+ Pip\. You last talked earlier today, about .+/);
  });

  it('says how the kinling has been changing', () => {
    let s = chatted(["you were so brave, I'm proud of you", 'I believe in you']);
    s = reflect(s, kin(s).id, T0 + HOUR).save;
    expect(growthLines(kin(s), T0 + 2 * HOUR)[0]).toMatch(/^Lately I've been feeling braver\..*\(earlier today\)$/);
  });
});

describe('chat prompt', () => {
  it('brings relevant memories next to the message, with a hint for questions about the player', () => {
    const s = chatted(['we just got a puppy named Biscuit', 'I love rainy days', 'my sister Maya turns seven next week']);
    const msgs = chatMessages(s, "what's my dog's name?", T0 + HOUR);
    const last = String(msgs.at(-1)!.content);
    expect(last).toMatch(/Memories that come to mind:\n- Sam shared|Memories that come to mind:\n- Sam told me they just got a puppy named Biscuit/);
    expect(last).toContain('Biscuit');
    expect(last).toContain('(earlier today)');
    expect(last).toContain('asking about their own life');
    expect(last.endsWith("what's my dog's name?")).toBe(true);
  });

  it('includes siblings, growth and relationship, and inventory only when it matters', () => {
    let s = family(2);
    s = chatted(["you were so brave, I'm proud of you", 'I believe in you'], s);
    s = reflect(s, kin(s).id, T0 + HOUR).save;
    const chatty = creatureSystemPrompt(s, 'how are you feeling?', T0 + 2 * HOUR);
    // Siblings are named; their details come in only when the message is about one.
    expect(chatty).toMatch(/living in a hollow under an old tree with Pip\./);
    expect(chatty).not.toMatch(/^Pip \(hatched from/m);
    expect(creatureSystemPrompt(s, 'how is Pip doing?', T0 + 2 * HOUR)).toMatch(/^Pip \(hatched from/m);
    expect(chatty).toContain("Lately: Lately I've been feeling braver");
    expect(chatty).toMatch(/getting to know Sam|You like Sam|close to Sam|You adore Sam/);
    // Appearance only when the message is about looks.
    expect(chatty).not.toContain('You look like this');
    expect(creatureSystemPrompt(s, 'I love your ears', T0)).toContain('You look like this');
    expect(chatty).not.toContain('Snacks: seed buns');
    expect(chatty).not.toContain('Things you could do together now');
    expect(creatureSystemPrompt(s, 'what keepsakes do you have?', T0)).toContain('Snacks: seed buns');
    expect(creatureSystemPrompt(s, 'what should we do today?', T0)).toContain('Things you could do together now');
    expect(chatty.length).toBeLessThan(6000);
  });

  it('retells facts in the third person', () => {
    let s = hatchedSave();
    s = addPlayerFact(s, 'I love rainy days', T0).save;
    const last = String(chatMessages(s, 'what weather do I like?', T0).at(-1)!.content);
    expect(last).toContain('- Sam: they love rainy days');
  });
});

describe('reply hygiene', () => {
  it('drops a trailing activity offer nobody asked for', () => {
    expect(dropUnaskedOffer('Your recital will go great. Want to play chase?', "I'm nervous about my recital")).toBe('Your recital will go great.');
    expect(dropUnaskedOffer("Rainy days are cozy. Let's play in the pond!", 'I love rainy days')).toBe('Rainy days are cozy.');
    expect(dropUnaskedOffer('We could explore! Want to play chase?', 'what should we do?')).toBe('We could explore! Want to play chase?');
    expect(dropUnaskedOffer('Want to play chase?', 'hi')).toBe('Want to play chase?');
  });

  it('notices repeats and drops a repeated closing line', () => {
    expect(repeatsRecent('I feel warm and safe. What do you think?', ['I feel warm and safe. What do you think?'])).toBe(true);
    expect(repeatsRecent('Biscuit sounds wonderful!', ['I feel warm and safe.'])).toBe(false);
    expect(dropRepeatedTail('The rug is soft. What do you think?', ['I like stars. What do you think?'])).toBe('The rug is soft.');
  });
});

describe('offline replies use memory and personality', () => {
  it('answers from what the player shared', () => {
    let s = chatted(['we just got a puppy named Biscuit']);
    expect(offlineChatReply(s, "what's my dog's name?", () => 0.9, T0 + HOUR)).toMatch(/I remember! .*Biscuit/);
    s = addPlayerFact(hatchedSave(), 'I love rainy days', T0).save;
    expect(offlineChatReply(s, 'do you remember what weather I like?', () => 0.9, T0 + HOUR)).toBe('I remember! You told me "I love rainy days".');
  });

  it('responds to feelings', () => {
    const s = hatchedSave();
    expect(offlineChatReply(s, "you were so brave, I'm proud of you", () => 0.9)).toMatch(/brave|best/);
    expect(offlineChatReply(s, 'I had a rough day and I am sad', () => 0.9)).toMatch(/here with you|sit with you/);
  });
});

describe('save format v5', () => {
  it('migrates a v4 save without turning old chat into memories', () => {
    let s = hatchedSave();
    s = addChatMessage(s, kin(s).id, 'player', 'I love rainy days', 'player', T0);
    const v4 = structuredClone(s) as unknown as Record<string, unknown> & { kinlings: Record<string, unknown>[] };
    v4.schemaVersion = 4;
    for (const k of v4.kinlings) {
      delete k.appraisedThroughId;
      delete k.lastReflectionAt;
      delete (k.socialDaily as Record<string, unknown>).reflectPersonality;
      k.memories = (k.memories as Record<string, unknown>[]).map(({ valence: _v, influence: _i, ...m }) => m);
    }
    const { save, migratedFrom } = migrateSave(v4);
    expect(migratedFrom).toBe(4);
    expect(kin(save).appraisedThroughId).toBe(kin(s).chat.at(-1)!.id);
    expect(pendingAppraisals(kin(save))).toHaveLength(0);
    expect(kin(save).memories.every((m) => m.valence === 0 && m.influence.confidence === 0)).toBe(true);
  });

  it('validates memories with feelings and influence', () => {
    const s = chatted(["you were so brave, I'm proud of you"]);
    expect(validateSave(s).ok).toBe(true);
    const bad = structuredClone(s);
    kin(bad).memories[0]!.influence.confidence = 9;
    expect(validateSave(bad).ok).toBe(false);
  });
});

