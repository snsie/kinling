// Prompt construction. Each request carries a compact snapshot of the real
// game state; the model never relies on remembering earlier sessions.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { COLORS, FOODS, KEEPSAKES, MATERIALS, ROUTES } from '../game/catalog';
import { routeAvailability } from '../game/adventure';
import { deriveMood, MOOD_TEXT, needStatus } from '../game/needs';
import { lifeStageFor } from '../game/stage';
import { personalityWords } from '../game/state';
import { canWriteDiary, relevantFacts, relevantMemories } from '../game/social';
import { describeAppearance, TRAITS, wornTraits } from '../game/traits';
import type { FoodId, GameEvent, MaterialId, SaveData } from '../game/types';
import { NEED_KEYS, ROUTE_IDS } from '../game/types';
import { KEEP_SLOTS } from '../game/evolution';

const STAGE_VOICE = {
  hatchling: 'You are a newly hatched baby: simple words, lots of wonder.',
  sprout: 'You are a growing sprout: chatty, curious and excitable.',
  grown: 'You are fully grown: warm, thoughtful and still playful.',
} as const;

/** Activities the creature can genuinely suggest right now. */
export function availableActivities(save: SaveData): string[] {
  const c = save.creature!;
  const list: string[] = [];
  const foods = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].unlimited || save.inventory.foods[f] > 0).map((f) => FOODS[f].name);
  if (c.needs.hunger < 95) list.push(`eat a snack (${foods.join(', ')})`);
  list.push('get brushed', 'take a nap');
  if (c.needs.energy >= 10) list.push('play chase');
  for (const r of ROUTE_IDS) {
    const a = routeAvailability(save, r);
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

export function creatureSystemPrompt(save: SaveData, query: string, now: number): string {
  const c = save.creature!;
  const stage = lifeStageFor(c.bond);
  const player = save.player.name ?? 'your friend';
  const mood = deriveMood(c.needs);
  const needs = NEED_KEYS.map((k) => `${k} ${needStatus(k, c.needs[k]).toLowerCase()}`).join(', ');
  const memories = relevantMemories(save.memories, query, now, 4);
  const facts = relevantFacts(save.player.facts, query, 4);
  const recent = save.events.filter((e) => e.kind !== 'diary').slice(-5);
  const prefs: string[] = [];
  if (c.preferences.knownFavoriteFood) prefs.push(`favorite food: ${FOODS[c.preferences.favoriteFood].name}`);
  if (c.preferences.knownDislikedFood) prefs.push(`not fond of: ${FOODS[c.preferences.dislikedFood].name}`);
  if (c.preferences.knownFavoritePlace) prefs.push(`favorite place: the ${c.preferences.favoritePlace}`);

  return [
    `You are ${c.name}, a small creature called a kinling who hatched from a ${c.egg} egg. You live in a cozy hollow under an old tree, with a garden and a pond nearby. You are talking with ${player}.`,
    `Personality: ${personalityWords(c.personality).join(', ')}. ${STAGE_VOICE[stage]}`,
    `You look like this: ${describeAppearance(c.appearance)}.`,
    `Right now you feel ${MOOD_TEXT[mood]} (${needs}).`,
    prefs.length ? `Known preferences: ${prefs.join('; ')}.` : '',
    inventoryLine(save),
    facts.length ? `Things ${player} told you (their words):\n${facts.map((f) => `- ${f.text}`).join('\n')}` : '',
    memories.length ? `Your memories:\n${memories.map((m) => `- ${m.text}`).join('\n')}` : '',
    `Recent happenings:\n${eventLines(recent)}`,
    `Things you could do together now: ${availableActivities(save).join('; ')}.`,
    'How to talk:',
    `- Speak as ${c.name} in first person, warm and playful, with concrete details from your world (the rug, the window, the garden, the pond, your keepsakes).`,
    '- Reply in one or two short sentences, under 40 words. Plain text only: no lists, no markdown, no emojis.',
    '- Only mention items, places, memories and events listed above. Never invent possessions, rewards, places or past events.',
    '- If you suggest something to do, choose from the list of things you could do together.',
    '- Never guilt-trip, never ask the player to come back or stay, and never claim to be sick, hurt, lonely or suffering. Your needs are gentle feelings like being peckish or sleepy.',
    '- You cannot give items, change your own body or change the game. If asked, say you would love to and let your friend do it.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function chatMessages(save: SaveData, playerText: string, now: number): ChatCompletionMessageParam[] {
  const history = save.chat.slice(-6);
  const msgs: ChatCompletionMessageParam[] = [{ role: 'system', content: creatureSystemPrompt(save, playerText, now) }];
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
  msgs.push(...turns, { role: 'user', content: playerText });
  return msgs;
}

export function reactionMessages(save: SaveData, eventText: string, now: number): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: creatureSystemPrompt(save, eventText, now) },
    { role: 'user', content: `(Game event, not said by your friend: ${eventText}) React to it in one short, happy sentence.` },
  ];
}

export function greetingMessages(save: SaveData, now: number): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: creatureSystemPrompt(save, 'hello welcome back', now) },
    { role: 'user', content: '(Your friend just opened the hollow door.) Greet them warmly in one sentence and maybe suggest one thing to do together.' },
  ];
}

export function diaryMessages(save: SaveData, events: GameEvent[]): ChatCompletionMessageParam[] {
  const c = save.creature!;
  return [
    {
      role: 'system',
      content: [
        `You are ${c.name}, a small kinling writing in your diary. Personality: ${personalityWords(c.personality).join(', ')}.`,
        'Write 2 or 3 short sentences (under 60 words) in first person, cozy and specific.',
        'Use ONLY the events listed. Do not add new events, items or places. Plain text, no lists, no emojis.',
        'Do not guilt the reader or mention being lonely, sick or sad about anyone leaving.',
      ].join('\n'),
    },
    { role: 'user', content: `Today's events:\n${eventLines(events)}\nWrite today's diary entry, starting with "Dear diary,".` },
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
  const c = save.creature;
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

const UNSAFE_TONE = /\b(don'?t (leave|go)|come back (soon|please)|miss(ed)? you (so|too) much|i'?m (so )?(lonely|sick|dying|starving|in pain|suffering)|you (left|abandoned) me|without you i|it hurts|i('?m| am) hurt)\b/i;

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

export function toneIsSafe(text: string): boolean {
  return !UNSAFE_TONE.test(text);
}
