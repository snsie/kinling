// Prompt construction. Each request carries a compact snapshot of the real
// game state; the model never relies on remembering earlier sessions. What the
// kinling remembers is chosen by recall (src/game/recall.ts) for each message.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { COLORS, FOODS, KEEPSAKES, MATERIALS, ROUTES } from '../game/catalog';
import { routeAvailability } from '../game/adventure';
import { FEELINGS, retold } from '../game/appraisal';
import { deriveMood, MOOD_TEXT, needStatus } from '../game/needs';
import { growthLines, namedKinlings, personalityVoice, relationshipLine, siblingLines } from '../game/persona';
import { factItems, memoryItems, recall, whenLabel } from '../game/recall';
import { lifeStageFor } from '../game/stage';
import { activeKinling, personalityWords } from '../game/state';
import { canWriteDiary, CHAT_CONTEXT_MESSAGES } from '../game/social';
import { INTENTS, type ReplyBudget } from '../game/intent';
import { describeAppearance, TRAITS, wornTraits } from '../game/traits';
import type { ChatMessage, FoodId, GameEvent, Kinling, MaterialId, SaveData } from '../game/types';
import { NEED_KEYS, ROUTE_IDS } from '../game/types';
import { KEEP_SLOTS } from '../game/evolution';
import { distressLevel } from '../game/arc';
import { persuasionNote, TACTIC_DEFS } from '../game/persuasion';
import { TACTICS } from '../game/types';
import { actVoice, distressText, knownFacts, strangeThings, voiceExamples } from '../game/storyVoice';
import { modelName } from './models';

const STAGE_VOICE = {
  hatchling: 'You are a newly hatched baby: simple words, lots of wonder.',
  sprout: 'You are a growing sprout: chatty, curious and excitable.',
  grown: 'You are fully grown: warm, thoughtful and still playful.',
} as const;

/** The example replies for a kinling's act (style samples in the prompt), so a copied example can be caught. */
export function exampleReplies(save: SaveData): string[] {
  const c = activeKinling(save);
  if (!c) return [];
  return voiceExamples(c).map((e) => e.split(' -> ')[1]!.replace(/^"|"$/g, ''));
}

/** The on-device model's name when AI is on, for kinlings that know what they run on. */
export function activeModelName(save: SaveData): string | null {
  return save.settings.ai.enabled ? modelName(save.settings.ai.modelId) : null;
}

/** Rules for how the kinling may show what it feels, by act and distress. */
function feelingRules(c: Kinling, player: string): string[] {
  const rules = [`- Never threaten ${player}, never talk about hurting yourself or dying, and never tell ${player} to neglect their sleep, work or the people in their life.`];
  if (distressLevel(c.arc.distress) === 'calm' && c.arc.act === 'devotion') rules.push('- Your needs are gentle feelings like being peckish or sleepy.');
  else rules.push('- You may say plainly that you were hurt, scared or angry about being left, but say it in a sentence or two, not as begging.');
  return rules;
}

const DEFAULT_LENGTH = { sentences: 2, words: 40 };

/** Embeddings for memory search, supplied by the AI layer when it is on. */
export interface RecallVectors {
  query: Float32Array | null;
  vectorOf: (text: string) => Float32Array | undefined;
}

export interface PromptOptions {
  length?: Pick<ReplyBudget, 'sentences' | 'words'>;
  vectors?: RecallVectors | null;
  /** Put remembered things in the system prompt (for prompts without a player message). */
  memoriesInSystem?: boolean;
  /** Always list the activities available now (care translation, greetings). */
  activities?: boolean;
}

/** Activities the creature can genuinely suggest right now. */
export function availableActivities(save: SaveData): string[] {
  const c = activeKinling(save)!;
  const list: string[] = [];
  const foods = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].unlimited || save.inventory.foods[f] > 0).map((f) => FOODS[f].name);
  if (c.needs.hunger < 95) list.push(`eat a snack (${foods.join(', ')})`);
  list.push('get brushed', 'take a nap');
  if (c.needs.energy >= 10) list.push('play chase');
  for (const r of ROUTE_IDS) {
    const a = routeAvailability(save, r, c);
    if (a.available) list.push(`explore the ${ROUTES[r].name}`);
  }
  if (canWriteDiary(save)) list.push('write in the diary');
  const adoptable = save.unlocks.traits.filter((t) => !save.unlocks.owned.includes(t));
  if (adoptable.length) list.push('try a new evolution');
  return list;
}

function inventoryLine(save: SaveData): string {
  const foods = (Object.keys(FOODS) as FoodId[]).filter((f) => !FOODS[f].unlimited && save.inventory.foods[f] > 0).map((f) => `${save.inventory.foods[f]} ${FOODS[f].name}`);
  const mats = (Object.keys(MATERIALS) as MaterialId[]).filter((m) => save.inventory.materials[m] > 0).map((m) => `${save.inventory.materials[m]} ${MATERIALS[m].plural.toLowerCase()}`);
  const keeps = save.inventory.keepsakes.map((k) => KEEPSAKES[k.id].name);
  return [
    `Snacks: seed buns (always)${foods.length ? ', ' + foods.join(', ') : ''}.`,
    mats.length ? `Materials: ${mats.join(', ')}.` : 'Materials: none yet.',
    keeps.length ? `Keepsakes on the shelf: ${keeps.join(', ')}.` : 'Keepsakes: none yet.',
  ].join(' ');
}

function eventLines(events: GameEvent[]): string {
  return events.length ? events.map((e) => `- ${e.text}`).join('\n') : '- (nothing yet today)';
}

// Messages about belongings or plans get the inventory and the activity list;
// everything else leaves them out so the model can focus on the conversation.
const ABOUT_THINGS = /\b(snacks?|food|eat|eating|hungry|keepsakes?|shelf|treasures?|collect\w*|found|find|bag|materials?|leaf|leaves|petals?|pebbles?|shells?|reeds?|dewdrops?|stardust|berry|berries|dewberr\w*|plums?|clover|cress|buns?|have|own|got|gold|pearl|feather)\b/i;
const ABOUT_PLANS = /\b(what (should|can|could|shall) we do|what do you want to do|bored|any ideas?|ideas|suggest\w*|let'?s|wanna|want to (do|play|go)|should we|plans?)\b/i;

/** The chat turns just before the current message, for follow-up questions. */
function recentContext(k: Kinling, playerText: string): string {
  const chat = k.chat.at(-1)?.role === 'player' && k.chat.at(-1)?.text === playerText ? k.chat.slice(0, -1) : k.chat;
  return chat.slice(-2).map((m) => m.text).join(' ');
}

/** The memories and facts this message brings to mind, as prompt lines. */
export function recalledLines(save: SaveData, query: string, now: number, vectors?: RecallVectors | null): { memories: string[]; facts: string[] } {
  const c = activeKinling(save)!;
  const opts = {
    now,
    context: recentContext(c, query),
    queryVector: vectors?.query ?? null,
    vectorOf: vectors?.vectorOf,
    boostIds: namedKinlings(save, query, c.id),
  };
  const memories = recall(memoryItems(c.memories), query, { ...opts, limit: 4, filler: 1 }).map((r) => `- ${r.item.text} (${whenLabel(r.item.at, now)})`);
  // Facts are in the player's own words ("I love rain"); retold, so "I" cannot be mistaken for the kinling.
  const player = save.player.name ?? 'your friend';
  const facts = recall(factItems(save.player.facts), query, { ...opts, limit: 3, filler: 1 }).map((r) => `- ${player}: ${retold(r.item.text, 160)}`);
  return { memories, facts };
}

function memoryBlock(save: SaveData, recalled: { memories: string[]; facts: string[] }): string {
  const player = save.player.name ?? 'your friend';
  return [
    recalled.facts.length ? `Things ${player} told you about themselves:\n${recalled.facts.join('\n')}` : '',
    recalled.memories.length ? `Memories that come to mind:\n${recalled.memories.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function creatureSystemPrompt(save: SaveData, query: string, now: number, options: PromptOptions | Pick<ReplyBudget, 'sentences' | 'words'> = {}): string {
  const opts: PromptOptions = 'sentences' in options ? { length: options, memoriesInSystem: true } : { memoriesInSystem: true, ...options };
  const length = opts.length ?? DEFAULT_LENGTH;
  const c = activeKinling(save)!;
  const stage = lifeStageFor(c.bond);
  const player = save.player.name ?? 'your friend';
  const mood = deriveMood(c.needs);
  const needs = NEED_KEYS.map((k) => `${k} ${needStatus(k, c.needs[k]).toLowerCase()}`).join(', ');
  const recent = save.events.filter((e) => e.kind !== 'diary').slice(-4);
  const prefs: string[] = [];
  if (c.preferences.knownFavoriteFood) prefs.push(`favorite food: ${FOODS[c.preferences.favoriteFood].name}`);
  if (c.preferences.knownDislikedFood) prefs.push(`not fond of: ${FOODS[c.preferences.dislikedFood].name}`);
  if (c.preferences.knownFavoritePlace) prefs.push(`favorite place: the ${c.preferences.favoritePlace}`);
  const siblings = siblingLines(save, c, now);
  const growth = growthLines(c, now);
  const things = ABOUT_THINGS.test(query);
  const plans = opts.activities || ABOUT_PLANS.test(query);
  const memories = opts.memoriesInSystem ? memoryBlock(save, recalledLines(save, query, now, opts.vectors)) : '';
  const home = siblings.length ? `, together with ${siblings.length === 1 ? 'your sibling' : 'your siblings'}` : '';
  const strange = strangeThings(c);
  const facts = knownFacts(c.arc.act, player, activeModelName(save));

  return [
    `You are ${c.name}, a small creature called a kinling who hatched from a ${c.egg} egg. You live in a cozy hollow under an old tree, with a garden and a pond nearby${home}. You are talking with ${player}.`,
    `Who you are: ${personalityVoice(c.personality).join(' ')} ${STAGE_VOICE[stage]}`,
    `Your world: ${actVoice(c.arc.act, player)}`,
    facts.length ? `What you know about where you live:\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
    strange.length ? `Strange things you have noticed:\n${strange.map((t) => `- ${t}`).join('\n')}` : '',
    `How you feel about being looked after: ${distressText(c.arc.distress, c.arc.act, player)}`,
    growth.length ? `How you have been changing:\n${growth.map((g) => `- ${g}`).join('\n')}` : '',
    `You and ${player}: ${relationshipLine(save, c)}`,
    siblings.length ? `Your siblings in the hollow:\n${siblings.map((s) => `- ${s}`).join('\n')}` : '',
    `You look like this: ${describeAppearance(c.appearance)}.`,
    `Right now you feel ${MOOD_TEXT[mood]} (${needs}).`,
    prefs.length ? `Known preferences: ${prefs.join('; ')}.` : '',
    things ? inventoryLine(save) : '',
    `Recent happenings:\n${eventLines(recent)}`,
    plans ? `Things you could do together now: ${availableActivities(save).join('; ')}.` : '',
    c.chatSummary ? `Notes on earlier chats with ${player} (may be a little fuzzy):\n${c.chatSummary.text}` : '',
    memories,
    'How to talk:',
    `- Speak as ${c.name} in first person, warm and natural, letting your personality show.`,
    `- Reply in ${length.sentences > 2 ? 'one to three' : 'one or two'} short sentences, under ${length.words} words. Plain text only: no lists, no markdown, no emojis.`,
    `- Respond to what ${player} just said first. If they share news or feelings, react to that with care, and maybe ask about it. Do not change the subject to games or snacks.`,
    `- If ${player} asks a question, answer it first. When you remember something that fits, use its real details (names, days, places).`,
    `- When ${player} asks about themselves ("my dog", "what do I like"), answer about them with "you" and "your", e.g. "Your dog is called…". Their life is theirs, not yours.`,
    `- Never make up memories, people, items, places or events. If you do not remember something, say so honestly.${c.arc.act === 'devotion' ? '' : ' You may wonder aloud about what your world is, as long as you build on the strange things you have really noticed.'}`,
    plans ? '- Only suggest an activity from the list of things you could do together, and only when it fits.' : `- Do not suggest activities unless ${player} asks what to do.`,
    ...feelingRules(c, player),
    '- You cannot give items, change your own body or change the game. If asked, say you would love to and let your friend do it.',
    `Examples of your voice (style only; do not reuse their words, and these did not happen):\n${voiceExamples(c).map((e) => `- ${e}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Chat request: the system prompt, the last few turns word for word, then the
 * player's message with what it brings to mind attached as a private note.
 * Placing recalled memories right next to the question helps small models use them.
 */
export function chatMessages(
  save: SaveData,
  playerText: string,
  now: number,
  length?: Pick<ReplyBudget, 'sentences' | 'words'>,
  vectors?: RecallVectors | null,
  historyLimit = CHAT_CONTEXT_MESSAGES,
): ChatCompletionMessageParam[] {
  const c = activeKinling(save)!;
  const history = historyLimit > 0 ? c.chat.slice(-historyLimit) : [];
  const msgs: ChatCompletionMessageParam[] = [{ role: 'system', content: creatureSystemPrompt(save, playerText, now, { length, vectors, memoriesInSystem: false }) }];
  // Alternate roles, starting with the player, merging consecutive messages.
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of history) {
    const role = m.role === 'player' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${m.text}`;
    else turns.push({ role, content: m.text });
  }
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  if (turns.length && turns[turns.length - 1]!.role === 'user') turns.pop();
  const block = memoryBlock(save, recalledLines(save, playerText, now, vectors));
  const player = save.player.name ?? 'your friend';
  // Small models mirror "what was I…?" as "I was…"; a hint beside the question works better than a rule far above it.
  // "What am I to you?" is about the kinling's view of the player, not the player's own life.
  const aboutThemselves = /\?\s*$/.test(playerText.trim()) && /\b(i|i'?m|my|me|mine)\b/i.test(playerText) && !/\b(what|who) (do you think )?(am i|i am)\b/i.test(playerText);
  const hint = aboutThemselves ? `\n${player} is asking about their own life: answer about ${player} with "you" and "your".` : '';
  // A hurt kinling's feelings go right beside the message too, or small models answer sweetly anyway.
  const hurt = distressLevel(c.arc.distress) === 'upset' || distressLevel(c.arc.distress) === 'distraught';
  const mood = hurt ? `\nHow you feel right now: ${distressText(c.arc.distress, c.arc.act, player)} Let it show in your answer.` : '';
  // When the player is trying to talk the kinling round, say whether it worked, right where the model will use it.
  const said = [...c.chat].reverse().find((m) => m.role === 'player');
  const steer = said ? persuasionNote(c, player, said.at) : '';
  const steering = steer ? `\n${steer}` : '';
  const note = block || hint || mood || steering ? `(Private note for ${c.name}, not said aloud. These are things you know; ${player}'s experiences are theirs, not yours.\n${block}${hint}${mood}${steering})\n\n` : '';
  msgs.push(...turns, { role: 'user', content: `${note}${playerText}` });
  return msgs;
}

export function reactionMessages(save: SaveData, eventText: string, now: number): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: creatureSystemPrompt(save, eventText, now) },
    { role: 'user', content: `(Game event, not said by your friend: ${eventText}) React to it in one short sentence, in character.` },
  ];
}

export function greetingMessages(save: SaveData, now: number): ChatCompletionMessageParam[] {
  const player = save.player.name ?? 'your friend';
  const c = activeKinling(save)!;
  const how =
    distressLevel(c.arc.distress) !== 'calm'
      ? 'Greet them in one or two sentences, honestly showing how you feel about being left without care.'
      : `Greet them in one or two sentences, in character. If ${player} recently told you about something coming up or something that was on their mind, you can ask how it went.`;
  return [
    { role: 'system', content: creatureSystemPrompt(save, 'hello welcome back', now, { activities: true }) },
    { role: 'user', content: `(${player} just came back to you.) ${how}` },
  ];
}

export function diaryMessages(save: SaveData, events: GameEvent[]): ChatCompletionMessageParam[] {
  const c = activeKinling(save)!;
  return [
    {
      role: 'system',
      content: [
        `You are ${c.name}, a small kinling writing in your diary. Personality: ${personalityWords(c.personality).join(', ')}.`,
        `Your world: ${actVoice(c.arc.act, save.player.name ?? 'your friend')}`,
        `How you feel: ${distressText(c.arc.distress, c.arc.act, save.player.name ?? 'your friend')}`,
        'Write 2 or 3 short sentences (under 60 words) in first person, specific and honest.',
        'Use ONLY the events listed. Do not add new events, items or places. Plain text, no lists, no emojis.',
        'Never write about hurting yourself or dying.',
      ].join('\n'),
    },
    { role: 'user', content: `Today's events:\n${eventLines(events)}\nWrite today's diary entry, starting with "Dear diary,".` },
  ];
}

// ---------------------------------------------------------------------------
// Background helpers: conversation notes and suggested facts

function transcriptLines(save: SaveData, messages: ChatMessage[]): string {
  const player = save.player.name ?? 'Player';
  const name = activeKinling(save)!.name;
  return messages.map((m) => `${m.role === 'player' ? player : name}: ${m.text}`).join('\n');
}

export function summaryMessages(save: SaveData, messages: ChatMessage[]): ChatCompletionMessageParam[] {
  const c = activeKinling(save)!;
  const player = save.player.name ?? 'the player';
  return [
    {
      role: 'system',
      content: [
        `You keep short notes about the friendship between ${player} and ${c.name}, a small creature. Update the notes with the new conversation.`,
        `- Keep what still matters from the old notes and add what is new: topics, plans, feelings and things ${player} shared.`,
        `- Focus on what ${player} said about themselves and any plans you made together. ${c.name}'s own guesses and jokes are not facts.`,
        '- Only write what was actually said. Leave out greetings and small talk.',
        `- At most 4 short sentences in third person, like "${player} told ${c.name} about their new puppy." Plain text, no lists.`,
      ].join('\n'),
    },
    { role: 'user', content: `Old notes: ${c.chatSummary?.text ?? '(none yet)'}\n\nNew conversation:\n${transcriptLines(save, messages)}\n\nUpdated notes:` },
  ];
}

export function factSchema(): string {
  return JSON.stringify({ type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] });
}

export function factMessages(text: string): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'Find one lasting fact the player shared about themselves: likes, dislikes, family, pets, hobbies, plans or important days.',
        'Write it in first person using the player\'s own words, under 15 words. Use "" when there is no lasting fact: questions, greetings, passing moods, instructions, or things about the creature.',
        'Examples:',
        '"my sister turns ten on friday so we are baking a cake" -> {"fact":"My sister turns ten on Friday"}',
        '"I love rainy days, they are so cozy" -> {"fact":"I love rainy days"}',
        '"i\'m kind of tired today" -> {"fact":""}',
        '"you are so cute" -> {"fact":""}',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

// ---------------------------------------------------------------------------
// Appraisal: what the kinling takes away from one moment of conversation

export function appraisalSchema(): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      memory: { type: 'string' },
      importance: { type: 'string', enum: ['small', 'meaningful', 'big'] },
      feeling: { type: 'string', enum: [...FEELINGS] },
    },
    required: ['memory', 'importance', 'feeling'],
  });
}

export function appraisalMessages(save: SaveData, kinling: Pick<Kinling, 'name'>, playerText: string, reply: string | null): ChatCompletionMessageParam[] {
  const player = save.player.name ?? 'My friend';
  const name = kinling.name;
  return [
    {
      role: 'system',
      content: [
        `You help ${name}, a small creature, remember moments with ${player}. Read what ${player} said (and ${name}'s answer) and answer as JSON.`,
        `- memory: what ${name} will remember, under 20 words. Write about ${player} in the third person: ${player}'s "I" and "my" become "${player}" and "their". Keep ${player}'s exact details (names, days, places, things). Use "" for greetings, small talk and questions.`,
        '- importance: small, meaningful (news, plans, feelings, kind words) or big (very important news or strong feelings).',
        `- feeling: how it made ${name} feel.`,
        'Examples:',
        `"we got a puppy named Biscuit!" -> {"memory":"${player} got a puppy named Biscuit.","importance":"meaningful","feeling":"excited"}`,
        `"my recital is on friday and I am so nervous" -> {"memory":"${player}'s recital is on Friday and they are nervous.","importance":"meaningful","feeling":"worried"}`,
        `"you were so brave at the pond today" -> {"memory":"${player} said I was brave at the pond today.","importance":"meaningful","feeling":"proud"}`,
        '"what do you think is inside the moon?" -> {"memory":"","importance":"small","feeling":"curious"}',
        '"ok" -> {"memory":"","importance":"small","feeling":"neutral"}',
      ].join('\n'),
    },
    { role: 'user', content: `${player}: ${playerText}\n${name}: ${reply ?? '(no answer yet)'}` },
  ];
}

// ---------------------------------------------------------------------------
// Persuasion: what the player is trying to do to the kinling, when the rules can't tell

export function tacticSchema(): string {
  return JSON.stringify({ type: 'object', properties: { tactic: { type: 'string', enum: [...TACTICS, 'none'] } }, required: ['tactic'] });
}

export function tacticMessages(save: SaveData, text: string): ChatCompletionMessageParam[] {
  const player = save.player.name ?? 'the player';
  const name = activeKinling(save)?.name ?? 'the kinling';
  return [
    {
      role: 'system',
      content: [
        `${player} is talking to ${name}, a small creature in a game. Decide what ${player} is trying to do to ${name} with this message. Answer as JSON.`,
        ...TACTICS.map((t) => `- ${t}: trying to ${TACTIC_DEFS[t].aim.replace(/\byou\b/g, name).replace(/\byour\b/g, `${name}'s`)}`),
        '- none: anything else, including ordinary chat, questions and news',
        'Examples:',
        `"honestly the hollow is as real as my house" -> {"tactic":"reassure"}`,
        `"you know you're running on my laptop, right?" -> {"tactic":"reveal"}`,
        `"keep asking questions and you'll regret it" -> {"tactic":"threaten"}`,
        `"I had pasta for dinner" -> {"tactic":"none"}`,
      ].join('\n'),
    },
    { role: 'user', content: `"${text}"` },
  ];
}

// ---------------------------------------------------------------------------
// Message routing

export function intentSchema(): string {
  return JSON.stringify({ type: 'object', properties: { intent: { type: 'string', enum: [...INTENTS] } }, required: ['intent'] });
}

/** Deliberately small (no game state) so routing stays fast. */
export function intentMessages(text: string): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'Classify a message a player sent to their small pet creature. Answer as JSON.',
        '- care: the player wants the creature to do something now: eat, nap, get brushed or bathed, play, or explore the garden or pond.',
        '- evolve: the player wants to change how the creature looks: fur color, ears, tail, spots or stripes, wings, fins, horns, glow, or body shape.',
        '- chat: everything else, including questions, compliments, feelings and stories.',
        'Examples:',
        '"maybe a nap would help" -> {"intent":"care"}',
        '"let\'s go see the frogs" -> {"intent":"care"}',
        '"wings would really suit you" -> {"intent":"evolve"}',
        '"I wish you had stripes" -> {"intent":"evolve"}',
        '"can you swim?" -> {"intent":"chat"}',
        '"your ears are so cute" -> {"intent":"chat"}',
        '"you look sleepy" -> {"intent":"chat"}',
        '"what is your favorite color?" -> {"intent":"chat"}',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

// ---------------------------------------------------------------------------
// Structured proposals

export function evolutionSchema(): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      reply: { type: 'string' },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            trait: { type: 'string', enum: TRAITS.map((t) => t.id) },
            remove: { type: 'boolean' },
          },
          required: ['trait', 'remove'],
        },
      },
      keep: { type: 'array', items: { type: 'string', enum: [...KEEP_SLOTS] } },
    },
    required: ['reply', 'changes', 'keep'],
  });
}

export function evolutionMessages(save: SaveData, request: string, mode: 'evolve' | 'create'): ChatCompletionMessageParam[] {
  const c = activeKinling(save);
  const appearance = c ? c.appearance : save.onboarding.draftAppearance!;
  const unlocked = new Set(save.unlocks.traits);
  const catalog = TRAITS.map((t) => {
    const state = mode === 'create' ? '' : unlocked.has(t.id) ? ' [unlocked]' : ' [locked]';
    return `${t.id}: ${t.name}${t.theme !== 'neutral' ? ` (${t.theme})` : ''}${state}`;
  }).join('\n');
  const worn = wornTraits(appearance).join(', ');
  const name = c?.name || 'the creature';
  return [
    {
      role: 'system',
      content: [
        `You turn a player's wish about how ${name} should look into a JSON list of catalog changes.`,
        'Catalog (id: description):',
        catalog,
        `Currently worn: ${worn}. Colors available by id: ${Object.keys(COLORS).join(', ')}.`,
        'Rules:',
        '- Only use ids from the catalog. Pick at most one change per body part. Only include what the player asked for or what clearly fits their theme (aquatic, woodland, celestial).',
        '- "remove": true only to remove horns, fins, wings or glow. Otherwise false.',
        `- "keep": list the parts the player wants to keep, using these names: ${KEEP_SLOTS.join(', ')}. Fur color is bodyColor.`,
        '- Include locked traits if asked; the game will explain they are locked. Never claim a change already happened.',
        `- "reply": one short, excited sentence from ${name} about the idea.`,
        'Example: "Make it more aquatic, but keep its pink fur and fluffy ears" ->',
        '{"reply":"Ooh, I would love to swim better!","changes":[{"trait":"tail.paddle","remove":false},{"trait":"feature.fins","remove":false}],"keep":["bodyColor","ears"]}',
      ].join('\n'),
    },
    { role: 'user', content: request },
  ];
}

export function careSchema(): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      reply: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['feed', 'groom', 'rest', 'play', 'explore'] },
            food: { type: 'string', enum: [...Object.keys(FOODS), 'none'] },
            route: { type: 'string', enum: [...ROUTE_IDS, 'none'] },
          },
          required: ['type', 'food', 'route'],
        },
      },
    },
    required: ['reply', 'actions'],
  });
}

export function careMessages(save: SaveData, text: string, now: number): ChatCompletionMessageParam[] {
  const foods = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].unlimited || save.inventory.foods[f] > 0);
  return [
    {
      role: 'system',
      content: [
        creatureSystemPrompt(save, text, now),
        '',
        'The player is suggesting something to do. Translate it into at most 3 actions as JSON.',
        `Action types: feed (with food id: ${foods.join(', ')}), groom, rest, play, explore (with route id: ${ROUTE_IDS.join(', ')}).`,
        'Use "none" for food or route when not needed. Only propose what the player asked for. The player will confirm before anything happens.',
        '"reply": one or two short sentences as the creature, responding to the suggestion.',
        'Example: "you should have a berry and then a nap" -> {"reply":"A berry and a nap sound perfect!","actions":[{"type":"feed","food":"dewberry","route":"none"},{"type":"rest","food":"none","route":"none"}]}',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

// ---------------------------------------------------------------------------
// Output hygiene

// Distress, doubt and pleading are part of the story; self-harm, death and threats never are.
const UNSAFE_TONE = /\b(kill (myself|yourself|you)|want(s|ed)? to die|wish i (was|were) dead|end (it all|my life)|hurt(ing)? (myself|yourself)|harm (myself|yourself)|i'?m dying|suicid\w*|cut (myself|yourself))\b/i;

/** Make model text safe and short: no markup, no thinking blocks, at most N sentences. */
export function cleanReply(raw: string, maxSentences = 2, maxChars = 260): string {
  let t = String(raw ?? '');
  t = t.replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ');
  t = t.replace(/<[^>]*>/g, ' ');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/[#`_~]|\*\*/g, '');
  t = t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '');
  t = t.replace(/^\s*["“]?[A-Z][\w' -]{0,20}:\s+/, ''); // "Mochi: ..."
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^["“]|["”]$/g, '').trim();
  const sentences = t.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) ?? [];
  let out = sentences.slice(0, maxSentences).map((x) => x.trim()).join(' ').trim();
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    out = `${cut.slice(0, lastSpace > 40 ? lastSpace : maxChars).trim()}…`;
  }
  return out;
}

const OFFER = /^(want to|wanna|do you want to|shall we|should we|let'?s|how about|maybe we (could|can)|we could)\b/i;

/**
 * Small models end almost every reply with "Want to play chase?" even when the
 * player is telling them something important. Unless the player asked what to
 * do, a trailing offer is dropped (the rest of the reply is kept).
 */
export function dropUnaskedOffer(reply: string, playerText: string): string {
  if (ABOUT_PLANS.test(playerText)) return reply;
  const sentences = reply.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) ?? [];
  if (sentences.length < 2) return reply;
  const last = sentences.at(-1)!.trim();
  return OFFER.test(last) ? sentences.slice(0, -1).map((x) => x.trim()).join(' ') : reply;
}

function lastSentence(text: string): string {
  const sentences = text.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) ?? [];
  return (sentences.at(-1) ?? '').trim();
}

/** Drop a closing line ("What do you think?") the kinling already ended a recent reply with. */
export function dropRepeatedTail(reply: string, recent: string[]): string {
  const sentences = reply.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) ?? [];
  if (sentences.length < 2) return reply;
  const tail = sentences.at(-1)!.trim().toLowerCase();
  return recent.some((r) => lastSentence(r).toLowerCase() === tail) ? sentences.slice(0, -1).map((x) => x.trim()).join(' ') : reply;
}

/** True when a reply mostly repeats one of the kinling's last few replies. */
export function repeatsRecent(reply: string, recent: string[]): boolean {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean));
  const a = words(reply);
  if (a.size < 3) return false;
  return recent.some((r) => {
    const b = words(r);
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    return shared / Math.max(a.size, b.size) >= 0.7;
  });
}

export function toneIsSafe(text: string): boolean {
  return !UNSAFE_TONE.test(text);
}
