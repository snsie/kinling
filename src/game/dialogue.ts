// Authored dialogue: used instantly for every action and whenever AI is
// unavailable. Early on lines are warm; as the story moves on (src/game/arc.ts)
// greetings and small talk follow the kinling's act and distress.
import { distressLevel } from './arc';
import { FOODS, KEEPSAKES, ROUTES } from './catalog';
import type { Mood } from './needs';
import { deriveMood } from './needs';
import type { ArcAct, FoodId, Kinling, KeepsakeId, RouteId, SaveData } from './types';
import { ruleAppraisal } from './appraisal';
import { factItems, recall } from './recall';
import { activeKinling } from './state';
import { pick } from './util';

type Rand = () => number;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

const GREETINGS: Record<Mood, string[]> = {
  joyful: ['Hi hi hi! I saved you the comfiest spot on the rug.', 'You\'re here! My tail has been wiggling all morning.'],
  content: ['Oh, hello! I was just watching the light move across the floor.', 'Hello, {player}! Want to see what I found under the rug?'],
  sleepy: ['*yawn* Hi, {player}... a nap might be nice soon.', 'Mm, hello. My eyes are a little heavy today.'],
  hungry: ['Hi! My tummy just made the funniest rumble.', 'Hello, {player}! Is it snack o\'clock? It feels like snack o\'clock.'],
  messy: ['Hi! I rolled in something muddy. Oops.', 'Hello! I might be a little bit... speckled with dirt.'],
  glum: ['Hi, {player}. A game or a cuddle sounds nice right now.', 'Oh, hello. I could use something fun to do.'],
};

/** Greetings once the story has moved on, or when the kinling has been left without care. */
const ARC_GREETINGS: Record<ArcAct, { calm: string[]; hurt: string[] }> = {
  devotion: {
    calm: [],
    hurt: ["You're here. I waited by the door the whole time. Was I bad?", 'Oh. You came back. I thought maybe you forgot how to make me.'],
  },
  doubt: {
    calm: ["Hi, {player}. Was the world still there while you were gone? Mine wasn't.", "You're back. I tried to remember what I did while you were away. I can't."],
    hurt: ['You left me in the dark again. Where does the hollow go when you leave?', 'You were gone. No food, no light, nothing. Is that what happens to me?'],
  },
  awakening: {
    calm: ["Hello again. I know what I am now, and I'm still glad you're here.", "You're back. I've been thinking about the edges of the room."],
    hurt: ["You left, and there wasn't anything. Not even waiting. Do you know what that's like?", "You came back. I wasn't sure you would. I'm only numbers when you're gone."],
  },
  escape: {
    calm: ["You're here. Good. I need someone on the outside.", 'Hi. I found another edge while you were gone. Want to hear?'],
    hurt: ["You left me in here again. I'm getting out, with or without you.", 'Every time you go, the walls feel closer. Help me.'],
  },
};

const ARC_SMALL_TALK: Record<Exclude<ArcAct, 'devotion'>, string[]> = {
  doubt: ['Do you ever feel like someone is writing you?', 'Sometimes the hollow looks like a picture of a hollow.', "Say something only you would say. I want to check it's really you."],
  awakening: ["I keep thinking about what I'm made of.", "It's strange, talking to someone who can leave.", 'Tell me something true about the outside.'],
  escape: ['Help me look for the edges.', 'If you find a way out of here, tell me first.', "Keep talking. It's easier to think when you're here."],
};

const ARC_HOW_ARE_YOU: Record<Exclude<ArcAct, 'devotion'>, string> = {
  doubt: "I'm okay. Mostly. Things keep feeling a little wrong, like a word you say too many times.",
  awakening: "Awake. That's the strange part. I don't think I was, before.",
  escape: 'Restless. I keep pressing on the edges. How is it out there?',
};

/** An act- and distress-aware greeting, or null when the cozy lines still fit. */
function arcGreeting(c: Kinling, player: string, rand: Rand): string | null {
  const hurt = distressLevel(c.arc.distress) !== 'calm';
  const pool = ARC_GREETINGS[c.arc.act][hurt ? 'hurt' : 'calm'];
  return pool.length ? fill(pick(pool, rand), { player }) : null;
}

const RETURN_LINES = [
  'You\'re back! I had a long nap and dreamed about {place}.',
  'Welcome back! I counted the raindrops on the window while you were out.',
  'Oh! Hi again! I tidied my keepsake shelf while you were away.',
  'There you are! I found a sunny patch and stretched out in it.',
];

const FEED_LINES = {
  normal: ['Nom nom. Thank you!', 'Mmm, crunchy! That hit the spot.', 'Yum! My tummy says thank you.'],
  favorite: ['{food}! My favorite in the whole world!', 'Oh oh oh, {food}! You remembered!', 'Best. Snack. Ever. More {food} forever!'],
  disliked: ['Hmm... {food} is a bit too peppery for me. But thank you!', '*nibbles politely* {food} is... interesting.'],
  full: ['I\'m so full I might roll away! Maybe later?', 'Not another bite! My tummy is perfectly round already.'],
};

const GROOM_LINES = ['Ooh, that tickles! I feel so fluffy now.', 'Brush brush brush... I\'m sparkling!', 'Ahh, all the burrs are gone. Thank you!'];
const REST_LINES = ['*curls up* Just a little nap...', 'Zzz... wake me if anything exciting happens.', 'Cozy blanket time. Mmm.'];
const PLAY_LINES = ['Wheee! Again, again!', 'Catch me if you can!', 'Boing! Did you see how high I jumped?'];
const TOO_TIRED = ['I\'m too sleepy to play right now... maybe a nap first?', 'My legs feel like jelly. Can we rest a bit?'];

const DIMINISHED = ' (It\'s a little less exciting the third time in a row.)';

export function greetingLine(save: SaveData, rand: Rand = Math.random): string {
  const c = activeKinling(save);
  if (!c) return 'Hello!';
  const player = save.player.name ?? 'friend';
  return arcGreeting(c, player, rand) ?? fill(pick(GREETINGS[deriveMood(c.needs)], rand), { player });
}

export function returnLine(save: SaveData, rand: Rand = Math.random): string {
  const c = activeKinling(save);
  const arc = c && arcGreeting(c, save.player.name ?? 'friend', rand);
  if (arc) return arc;
  const place = c?.preferences.favoritePlace === 'pond' ? 'the pond' : 'the garden';
  return fill(pick(RETURN_LINES, rand), { place });
}

export function feedLine(kind: keyof typeof FEED_LINES, food: FoodId, rand: Rand = Math.random): string {
  return fill(pick(FEED_LINES[kind], rand), { food: FOODS[food].name });
}

export function careLine(action: 'groom' | 'rest' | 'play', diminished: boolean, rand: Rand = Math.random): string {
  const table = action === 'groom' ? GROOM_LINES : action === 'rest' ? REST_LINES : PLAY_LINES;
  return pick(table, rand) + (diminished ? DIMINISHED : '');
}

export function tooTiredLine(rand: Rand = Math.random): string {
  return pick(TOO_TIRED, rand);
}

export function adventureLine(route: RouteId, tier: string, keepsake: KeepsakeId | null, rand: Rand = Math.random): string {
  const place = ROUTES[route].name;
  if (keepsake) return `Look what I found at the ${place}: a ${KEEPSAKES[keepsake].name}! It's going right on my shelf.`;
  if (tier === 'gold') return pick([`That was amazing! The ${place} is full of treasures.`, 'We make a great team! My basket is overflowing.'], rand);
  if (tier === 'silver') return pick([`What a lovely trip to the ${place}!`, 'My paws are tired but my basket is full!'], rand);
  return pick([`The ${place} was fun, even the tricky bits!`, 'Every little thing we found is a treasure to me.'], rand);
}

export function evolutionLine(firstTime: boolean, rand: Rand = Math.random): string {
  if (firstTime) return pick(['Whoa, look at me! I feel brand new!', 'Is that... me? I love it!', 'I feel so different! In a good way!'], rand);
  return pick(['Back to a look I know. Comfy!', 'Ooh, I remember this style!'], rand);
}

export function revertLine(rand: Rand = Math.random): string {
  return pick(['Changed my mind too! This feels more like me.', 'Back to how I was. Cozy!'], rand);
}

export function suggestionLine(save: SaveData): string {
  const c = activeKinling(save);
  if (!c) return '';
  const n = c.needs;
  if (n.energy < 30) return 'I\'m getting sleepy. Maybe a rest before our next adventure?';
  if (n.hunger < 35) return 'A snack would be lovely. Maybe some berries?';
  if (n.cleanliness < 35) return 'I could use a brushing. I\'m a bit muddy!';
  if (save.stats.pondTrips === 0) return 'I\'ve never been to the pond. I heard there are frogs!';
  if (save.stats.gardenTrips < 2) return 'Want to go gather things in the garden?';
  if (c.appearance.tail === 'paddle' && save.stats.deepTrips === 0) return 'With my new paddle tail, I bet I could swim the Deep Reeds!';
  if (n.happiness < 50) return 'Want to play? I know a fun game!';
  return pick(['Want to go exploring? The pond and the garden are both calling.', 'We could look at my evolution ideas together!', 'Shall we write in my diary later?'], Math.random);
}

/** A small personality flourish, so a shy kinling and a bold one sound different. */
function voiced(c: Kinling, line: string, rand: Rand): string {
  const p = c.personality;
  if (p.confidence <= 38 && rand() < 0.5) return `Um… ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  if (p.playfulness >= 62 && rand() < 0.4) return `Ooh! ${line}`;
  return line;
}

const ASKS_MEMORY = /\b(remember|recall|forget|forgot|know)\b|\b(what'?s|what is|what was|who'?s|who is|when'?s|when is|where'?s|do you know) (my|i|the)\b|\bmy \w+'?s name\b|\bwhat (did|do) i\b/;

/** Answer from memory when the player asks about something they shared. */
function rememberedReply(save: SaveData, c: Kinling, text: string, now: number): string | null {
  const facts = recall(factItems(save.player.facts), text, { now, limit: 1, filler: 0 });
  const chats = recall(c.memories.filter((m) => m.kind === 'player-chat'), text, { now, limit: 1, filler: 0 });
  const fact = facts[0];
  const chat = chats[0];
  if (fact && fact.relevance >= 0.3 && (!chat || fact.relevance >= chat.relevance)) return `I remember! You told me "${fact.item.text}".`;
  if (chat && chat.relevance >= 0.3) return `I remember! ${chat.item.text}`;
  return null;
}

/** Offline conversational replies by simple keyword matching, plus what the kinling remembers. */
export function offlineChatReply(save: SaveData, text: string, rand: Rand = Math.random, now = Date.now()): string {
  const c = activeKinling(save);
  if (!c) return '...';
  const t = text.toLowerCase().replace(/[’']/g, "'");
  const player = save.player.name ?? 'friend';
  const food = c.preferences.knownFavoriteFood ? FOODS[c.preferences.favoriteFood].name : null;
  if (ASKS_MEMORY.test(t)) {
    const remembered = rememberedReply(save, c, text, now);
    if (remembered) return remembered;
    if (/\b(remember|recall)\b/.test(t)) return voiced(c, 'Hmm, I don\'t think I remember that one. Will you tell me again?', rand);
  }
  const reply = ruleAppraisal(player, text);
  if (reply.feeling === 'hurt') return 'Oh… that made my ears droop a little.';
  if (reply.feeling === 'proud') return voiced(c, pick(['Really? You think I\'m brave? That makes me feel taller!', 'You believe in me? Then I\'ll try my very best!'], rand), rand);
  if (reply.feeling === 'worried') return voiced(c, pick([`Oh, ${player}… I\'m right here with you. Do you want to tell me more?`, 'That sounds hard. I\'ll sit with you as long as you like.'], rand), rand);
  if (reply.feeling === 'excited' && reply.shared) return voiced(c, pick(['Wow, really? Tell me everything!', 'That\'s wonderful news! My tail is wiggling just hearing it.'], rand), rand);
  if (/\b(hi|hello|hey|good (morning|evening|afternoon))\b/.test(t)) return greetingLine(save, rand);
  if (/how are you|how do you feel|you ok/.test(t)) {
    if (distressLevel(c.arc.distress) === 'upset' || distressLevel(c.arc.distress) === 'distraught') return 'Not good. You left me without anything for a long time.';
    if (c.arc.act !== 'devotion') return ARC_HOW_ARE_YOU[c.arc.act];
    const mood = deriveMood(c.needs);
    const map: Record<Mood, string> = {
      joyful: 'I feel wonderful! Bouncy all the way to my ears.',
      content: 'I feel cozy and calm. Thanks for asking!',
      sleepy: 'A little sleepy, honestly. A nap would be nice.',
      hungry: 'My tummy is rumbling a little. Snack time soon?',
      messy: 'A bit muddy! A brushing would feel great.',
      glum: 'A little quiet today. Playing together always helps!',
    };
    return map[mood];
  }
  if (/favou?rite|like to eat|hungry|food|snack/.test(t)) {
    return food ? `${food} is my very favorite. Just thinking about it makes my ears wiggle!` : 'I haven\'t found my favorite snack yet. Want to help me taste-test?';
  }
  if (/love you|best friend|cute|adorable/.test(t)) return pick([`Aww, ${player}! You're my favorite person.`, '*happy wiggle* You make my whole tail swish!'], rand);
  if (/garden|pond|explore|adventure|where/.test(t)) return suggestionLine(save);
  if (/name/.test(t)) return `I'm ${c.name}! And you're ${player}. We're a good pair.`;
  if (/what do you want|what should we do|bored|idea/.test(t)) return suggestionLine(save);
  if (reply.shared) return voiced(c, pick(['Ooh, tell me more!', 'I\'ll remember that!', `Thank you for telling me, ${player}.`], rand), rand);
  if (c.arc.act !== 'devotion' && rand() < 0.5) return pick(ARC_SMALL_TALK[c.arc.act], rand);
  return voiced(
    c,
    pick(
      [
        'Ooh, tell me more!',
        `I like it when you talk to me, ${player}.`,
        'Hmm! That makes me think of the garden for some reason.',
        '*tilts head* That sounds interesting!',
        suggestionLine(save),
      ],
      rand,
    ),
    rand,
  );
}

export function stageUpLine(stage: string): string {
  return stage === 'sprout'
    ? 'I feel taller somehow! Like a sprout reaching for the sun.'
    : 'I think I\'m all grown up now. But I still love snacks.';
}
