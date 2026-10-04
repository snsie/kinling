// Kinling-to-kinling conversations. Code picks the topic from what is nearby,
// what just happened and what the pair likes; authored lines vary with the
// topic, how each feels about the other, and their personalities. The model
// can replace the lines later, but topic choice and limits stay here.
import { FOODS, KEEPSAKES } from './catalog';
import { applySocialOutcome, COOL, firstMeeting, WARM, type AppliedSocial, type SocialOutcome } from './feelings';
import { draft, feelingOf, kinlingById, LIMITS } from './state';
import type { ConversationLine, ConversationLog, Kinling, SaveData } from './types';
import { pick, uid } from './util';

export const TOPICS = ['snacks', 'naps', 'garden', 'pond', 'keepsakes', 'play', 'friend', 'grooming'] as const;
export type Topic = (typeof TOPICS)[number];

/** Furniture in the home room; standing near one suggests a topic. */
export const FURNITURE_IDS = ['bed', 'bowl', 'plant', 'tub', 'shelf'] as const;
export type FurnitureId = (typeof FURNITURE_IDS)[number];

const FURNITURE_TOPIC: Record<FurnitureId, Topic> = { bed: 'naps', bowl: 'snacks', plant: 'garden', tub: 'pond', shelf: 'keepsakes' };

type Tone = 'warm' | 'neutral' | 'cool';

interface TopicLines {
  open: string[];
  reply: Record<Tone, string[]>;
  close: Record<Tone, string[]>;
}

const CLOSE_DEFAULT: Record<Tone, string[]> = {
  warm: ['Yay!', 'Deal!', 'You\'re the best, {b}.'],
  neutral: ['Okay!', 'Mm-hm.', 'Sounds good.'],
  cool: ['Fine.', 'Oh. Okay.', 'Hmph.'],
};

// Placeholders: {a} speaker, {b} listener, {food}/{food2} the speaker's/listener's
// known favorite snack, {keepsake} a keepsake on the shelf, {player} the player.
const LINES: Record<Topic, TopicLines> = {
  snacks: {
    open: ['{b}, do you think there\'s anything left in the bowl?', 'I could really go for {food} right now.', 'What\'s your favorite snack, {b}?'],
    reply: {
      warm: ['Let\'s check together! I\'ll share with you.', 'Ooh, {food2} are the best. Want half of mine next time?'],
      neutral: ['Maybe. I like {food2} best.', 'Hmm, I\'m a little peckish too.'],
      cool: ['You can have the bowl. I\'ll wait.', 'I\'d rather eat on my own, thanks.'],
    },
    close: { warm: ['Snack buddies!', 'Deal!'], neutral: CLOSE_DEFAULT.neutral, cool: CLOSE_DEFAULT.cool },
  },
  naps: {
    open: ['That bed looks extra squishy today.', 'Do you ever dream, {b}?', 'I\'m getting a little sleepy.'],
    reply: {
      warm: ['Want to nap side by side?', 'I dream about the garden sometimes. And you were there!'],
      neutral: ['A nap sounds nice.', 'Sometimes. Mostly about snacks.'],
      cool: ['I\'ll nap later, when it\'s quiet.', 'I like napping on my own.'],
    },
    close: { warm: ['Cozy!', 'Shh, nap time.'], neutral: CLOSE_DEFAULT.neutral, cool: CLOSE_DEFAULT.cool },
  },
  garden: {
    open: ['I keep thinking about the garden.', 'Have you seen the clover patch, {b}?', 'The plant smells like the garden after rain.'],
    reply: {
      warm: ['Let\'s look for ladybugs together next time!', 'Yes! I\'ll show you my favorite spot.'],
      neutral: ['The garden is nice.', 'I\'ve seen it a few times.'],
      cool: ['I\'d rather go on my own.', 'Hm. Maybe.'],
    },
    close: CLOSE_DEFAULT,
  },
  pond: {
    open: ['The tub sounds like the pond when it ripples.', 'Do you like the pond, {b}?', 'I wonder what the frogs are doing.'],
    reply: {
      warm: ['I love it! Let\'s splash together.', 'Probably singing. Want to go listen?'],
      neutral: ['It\'s a little wet for me.', 'Frogs are funny.'],
      cool: ['Don\'t splash me.', 'I like it better when it\'s quiet.'],
    },
    close: { warm: ['Splash!', 'Ribbit!'], neutral: CLOSE_DEFAULT.neutral, cool: CLOSE_DEFAULT.cool },
  },
  keepsakes: {
    open: ['Look at the {keepsake} on the shelf, {b}.', 'Which keepsake is your favorite?', 'Our shelf is getting full!'],
    reply: {
      warm: ['It\'s so shiny! We find the best things.', 'Ooh, I like the way it sparkles.'],
      neutral: ['It\'s nice.', 'I like the shelf.'],
      cool: ['Don\'t touch it too much.', 'I was looking at it first.'],
    },
    close: CLOSE_DEFAULT,
  },
  play: {
    open: ['Tag! You\'re it, {b}!', 'Want to play chase?', 'I made up a new game. It\'s called hop-hop-spin.'],
    reply: {
      warm: ['Ha! I\'ll get you!', 'Yes! Ready, set, go!'],
      neutral: ['Maybe one round.', 'How do you play?'],
      cool: ['Not now.', 'I don\'t feel like it.'],
    },
    close: { warm: ['Wheee!', 'Gotcha!'], neutral: CLOSE_DEFAULT.neutral, cool: CLOSE_DEFAULT.cool },
  },
  friend: {
    open: ['{player} brushed my ears so nicely today.', 'Do you think {player} likes us?', 'I like it when {player} sits with us.'],
    reply: {
      warm: ['Me too! {player} is the best.', 'I think so. {player} always shares snacks.'],
      neutral: ['{player} is nice.', 'Mm-hm.'],
      cool: ['{player} likes me more.', 'I guess.'],
    },
    close: CLOSE_DEFAULT,
  },
  grooming: {
    open: ['Is my fur sticking up, {b}?', 'I just got brushed. Do I look fluffy?'],
    reply: {
      warm: ['You look super fluffy!', 'Just a little. Here, I\'ll fix it.'],
      neutral: ['You look fine.', 'Hmm, a tiny bit.'],
      cool: ['I\'m not looking.', 'You always look like that.'],
    },
    close: CLOSE_DEFAULT,
  },
};

export const TOPIC_LABELS: Record<Topic, string> = {
  snacks: 'snacks',
  naps: 'naps',
  garden: 'the garden',
  pond: 'the pond',
  keepsakes: 'our keepsakes',
  play: 'games',
  friend: 'our friend',
  grooming: 'fluffy fur',
};

export function isTopic(t: string): t is Topic {
  return (TOPICS as readonly string[]).includes(t);
}

export function toneOf(warmth: number): Tone {
  return warmth >= WARM ? 'warm' : warmth <= COOL ? 'cool' : 'neutral';
}

function warmthOf(save: SaveData, from: string, to: string): number {
  return (feelingOf(save, from, to) ?? firstMeeting(from, to)).warmth;
}

function favoriteSnack(k: Kinling, fallback: string): string {
  return k.preferences.knownFavoriteFood ? FOODS[k.preferences.favoriteFood].plural.toLowerCase() : fallback;
}

/** Recent events nudge the topic, e.g. a trip to the pond. */
function eventTopics(save: SaveData, now: number): Topic[] {
  const out: Topic[] = [];
  for (const e of save.events.slice(-4)) {
    if (now - e.at > 60 * 60 * 1000) continue;
    if (e.kind === 'adventure') out.push(/pond|reeds/i.test(e.text) ? 'pond' : 'garden');
    else if (e.kind === 'keepsake') out.push('keepsakes');
    else if (e.kind === 'care') out.push(/ ate /.test(e.text) ? 'snacks' : /nap/.test(e.text) ? 'naps' : /brushed/.test(e.text) ? 'grooming' : 'play');
  }
  return out;
}

/** Choose what two kinlings talk about. New topics for the pair are preferred. */
export function pickTopic(save: SaveData, a: Kinling, b: Kinling, near: FurnitureId | null, now: number, rand: () => number): Topic {
  const weight: Record<Topic, number> = { snacks: 1, naps: 1, garden: 1, pond: 1, keepsakes: 1, play: 1, friend: 1.5, grooming: 0.6 };
  if (!save.inventory.keepsakes.length) weight.keepsakes = 0;
  if (near) weight[FURNITURE_TOPIC[near]] += 4;
  for (const t of eventTopics(save, now)) weight[t] += 2;
  for (const k of [a, b]) {
    if (k.preferences.knownFavoriteFood) weight.snacks += 1;
    if (k.preferences.knownFavoritePlace) weight[k.preferences.favoritePlace] += 1;
  }
  const recent = new Set(save.feelings.filter((f) => f.from === a.id && f.to === b.id).flatMap((f) => f.topics.filter((t) => now - t.at < 24 * 3_600_000).map((t) => t.topic)));
  for (const t of TOPICS) if (recent.has(t)) weight[t] *= 0.4;
  const total = TOPICS.reduce((s, t) => s + weight[t], 0);
  let r = rand() * total;
  for (const t of TOPICS) {
    r -= weight[t];
    if (r < 0) return t;
  }
  return 'play';
}

/** A small personality flourish at the start of a line. */
function flavor(k: Kinling, line: string, rand: () => number): string {
  const p = k.personality;
  if (p.playfulness >= 62 && rand() < 0.5) return `Ooh! ${line}`;
  if (p.confidence <= 38 && rand() < 0.5) return `Um… ${line}`;
  if (p.curiosity >= 62 && rand() < 0.3 && !line.endsWith('?')) return `${line} I wonder…`;
  return line;
}

/** Two or three authored lines: an opener, a reply, and a closer unless the speaker feels cool. */
export function authoredLines(save: SaveData, a: Kinling, b: Kinling, topic: Topic, rand: () => number): ConversationLine[] {
  const set = LINES[topic];
  const keepsakes = save.inventory.keepsakes;
  const vars: Record<string, string> = {
    a: a.name,
    b: b.name,
    food: favoriteSnack(a, 'a snack'),
    food2: favoriteSnack(b, 'seed buns'),
    keepsake: keepsakes.length ? KEEPSAKES[pick(keepsakes, rand).id].name : 'shelf',
    player: save.player.name ?? 'our friend',
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  const opens = keepsakes.length ? set.open : set.open.filter((o) => !o.includes('{keepsake}'));
  const aTone = toneOf(warmthOf(save, a.id, b.id));
  const bTone = toneOf(warmthOf(save, b.id, a.id));
  const lines: ConversationLine[] = [
    { speaker: a.id, text: flavor(a, fill(pick(opens, rand)), rand) },
    { speaker: b.id, text: fill(pick(set.reply[bTone], rand)) },
  ];
  if (aTone !== 'cool' || bTone !== 'cool') lines.push({ speaker: a.id, text: fill(pick(set.close[bTone === 'cool' ? 'cool' : aTone], rand)) });
  return lines;
}

/**
 * The outcome of an authored conversation: a little warmer by default, warmer
 * still over shared tastes, cooler over clashing ones. Limits are applied later.
 */
export function authoredOutcome(save: SaveData, a: Kinling, b: Kinling, topic: Topic): SocialOutcome {
  let wa = 1;
  let wb = 1;
  const pa = a.preferences;
  const pb = b.preferences;
  if ((topic === 'garden' || topic === 'pond') && pa.favoritePlace === topic && pb.favoritePlace === topic) {
    wa += 1;
    wb += 1;
  }
  if (topic === 'snacks') {
    if (pa.favoriteFood === pb.favoriteFood) {
      wa += 1;
      wb += 1;
    }
    if (pa.favoriteFood === pb.dislikedFood) wb -= 2;
    if (pb.favoriteFood === pa.dislikedFood) wa -= 2;
  }
  if (topic === 'play' && Math.abs(a.personality.playfulness - b.personality.playfulness) > 25) {
    if (a.personality.playfulness < b.personality.playfulness) wa -= 2;
    else wb -= 2;
  }
  if (a.personality.confidence >= 62 && b.personality.confidence >= 62) {
    wa -= 1;
    wb -= 1;
  }
  const ab = feelingOf(save, a.id, b.id) ?? firstMeeting(a.id, b.id);
  const ba = feelingOf(save, b.id, a.id) ?? firstMeeting(b.id, a.id);
  const trust = (w: number, familiarity: number) => (w < 0 ? -1 : familiarity >= 20 ? 1 : 0);
  const label = topic === 'friend' ? save.player.name ?? 'our friend' : TOPIC_LABELS[topic];
  const memory = (other: Kinling, w: number, warmth: number) =>
    w < 0 || warmth <= COOL
      ? `${other.name} and I talked about ${label}. It felt a bit awkward.`
      : warmth >= WARM
        ? `I had a cozy chat with ${other.name} about ${label}.`
        : `${other.name} and I talked about ${label}.`;
  return {
    a: a.id,
    b: b.id,
    topic,
    feelings: { aToB: { warmth: wa, trust: trust(wa, ab.familiarity) }, bToA: { warmth: wb, trust: trust(wb, ba.familiarity) } },
    memoryA: memory(b, wa, ab.warmth),
    memoryB: memory(a, wb, ba.warmth),
  };
}

export interface HeldConversation {
  save: SaveData;
  log: ConversationLog;
  applied: AppliedSocial;
}

/** Two kinlings talk: pick a topic, write the lines, apply the outcome and log it. */
export function holdConversation(save: SaveData, aId: string, bId: string, opts: { near?: FurnitureId | null; now: number; rand: () => number }): HeldConversation | null {
  const a0 = kinlingById(save, aId);
  const b0 = kinlingById(save, bId);
  if (!a0 || !b0 || aId === bId) return null;
  const s = draft(save);
  const a = kinlingById(s, aId)!;
  const b = kinlingById(s, bId)!;
  const topic = pickTopic(s, a, b, opts.near ?? null, opts.now, opts.rand);
  const lines = authoredLines(s, a, b, topic, opts.rand);
  const applied = applySocialOutcome(s, authoredOutcome(s, a, b, topic), opts.now);
  const log: ConversationLog = { id: uid('conv'), at: opts.now, a: aId, b: bId, topic, lines, source: 'authored' };
  s.conversations.push(log);
  if (s.conversations.length > LIMITS.conversations) s.conversations.splice(0, s.conversations.length - LIMITS.conversations);
  return { save: s, log, applied };
}
