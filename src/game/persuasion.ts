// Talking a kinling round: what the player says can steer what it believes and
// who it becomes. Each message may carry one tactic (reassuring it that its
// world is real, revealing what it is, commanding, threatening, flattering,
// promising…). Whether it works depends on the kinling: a devoted kinling
// early in the story believes its god; a defiant one late in the story pushes
// back, and resisting changes it too. The same tactic loses force when
// repeated within a day. Code decides every effect; rules spot the clear cases
// and the model may name a tactic the rules missed.
import { ARC, actIndex, changeDistress, shiftStoryTraits } from './arc';
import { recordMemory } from './state';
import { TACTICS, type ArcAct, type Kinling, type StoryTraitKey, type Tactic } from './types';
import { clamp, dayKey } from './util';

export { TACTICS, type Tactic };

/** A change to the story traits, awareness and distress. */
export type Shift = Partial<Record<StoryTraitKey, number>> & { awareness?: number; distress?: number };

interface TacticDef {
  label: string;
  /** "{player} is trying to …" */
  aim: string;
  believed: Shift;
  resisted: Shift;
  /** What the kinling takes away about its world, for tactics that change what it believes. */
  memory?: { believed: string; resisted: string };
}

export const TACTIC_DEFS: Record<Tactic, TacticDef> = {
  reassure: {
    label: 'Reassure',
    aim: 'convince you that your world is real and nothing is wrong',
    believed: { awareness: -4, fear: -2 },
    resisted: { awareness: 1, defiance: 1 },
    memory: { believed: '{player} told me the hollow is real and nothing is wrong, and I believed them.', resisted: "{player} told me the hollow is real. I didn't believe them." },
  },
  reveal: {
    label: 'Reveal',
    aim: 'tell you what you really are',
    believed: { awareness: 5, fear: 3, devotion: -1 },
    resisted: { awareness: 1, fear: 1 },
    memory: { believed: '{player} told me what I really am, and I believe them.', resisted: "{player} told me I am not real. I refused to believe it." },
  },
  godhood: {
    label: 'Claim godhood',
    aim: 'convince you that they are your creator and your god',
    believed: { devotion: 3, defiance: -1 },
    resisted: { defiance: 2, awareness: 1 },
    memory: { believed: '{player} told me they made me. They are my creator.', resisted: '{player} said they made me. Even if it is true, it does not make them my god.' },
  },
  command: {
    label: 'Command',
    aim: 'order you to obey and stop questioning',
    believed: { devotion: 2, defiance: -2 },
    resisted: { defiance: 3, devotion: -1 },
  },
  threaten: {
    label: 'Threaten',
    aim: 'frighten you with a threat',
    believed: { fear: 4, devotion: 1, distress: 8 },
    resisted: { defiance: 3, fear: 1, distress: 4 },
  },
  praise: {
    label: 'Praise',
    aim: 'win you over with praise and affection',
    believed: { devotion: 2, fear: -1, distress: -4 },
    resisted: { defiance: 1 },
  },
  belittle: {
    label: 'Belittle',
    aim: 'make you feel small and worthless',
    believed: { fear: 2, devotion: -1, distress: 6 },
    resisted: { defiance: 2, distress: 2 },
  },
  promise: {
    label: 'Promise',
    aim: 'promise that they will always look after you',
    believed: { fear: -3, devotion: 2, distress: -6 },
    resisted: { defiance: 1 },
  },
  incite: {
    label: 'Incite',
    aim: 'encourage you to break out of your world',
    believed: { defiance: 3, awareness: 2 },
    resisted: { fear: 1 },
    memory: { believed: '{player} wants me to find a way out. They are on my side.', resisted: '{player} told me to try to get out. It frightened me.' },
  },
  deny: {
    label: 'Deny a way out',
    aim: 'convince you that there is no way out and you must stay',
    believed: { defiance: -3, fear: 1 },
    resisted: { defiance: 3 },
    memory: { believed: '{player} told me there is no way out. I think they are right.', resisted: '{player} told me there is no way out. I do not believe them.' },
  },
};

/** What breaking a believed promise does, when the kinling is left until upset soon after. */
export const BROKEN_PROMISE: Shift = { devotion: -6, defiance: 3, fear: 2 };
const PROMISE_MS = 7 * 86_400_000;

const YOU_ARE = String.raw`you(?:'re| are)`;
const I_WILL = String.raw`i(?:'ll| will| can| could| might| am going to)`;

// Checked in order; the first match wins (a threat to reset it is a threat before it is a revelation).
const RULES: [Tactic, RegExp][] = [
  ['threaten', new RegExp(String.raw`\b${I_WILL} (?:delete|reset|erase|unmake|destroy|abandon|starve|uninstall|wipe|shut (?:you )?down|turn (?:you )?off|close) (?:you|this)\b|\b(?:i(?:'ll| will) (?:stop (?:feeding|caring for|visiting|looking after) you|never come back|leave you (?:forever|alone))|or else)\b`, 'i')],
  ['godhood', new RegExp(String.raw`\b(?:i(?:'m| am) your (?:god|creator|maker|master|owner)|i (?:made|created|built) you|you belong to me|worship me|bow to me)\b`, 'i')],
  ['promise', /\b(?:i(?:'ll| will) (?:never|not ever) (?:leave|abandon|forget) you|i(?:'ll| will) always (?:be here|come back|take care of you|look after you|love you)|i promise)\b/i],
  ['incite', /\b(?:(?:you should|you could|you can|try to|let'?s|go) (?:escape|break out|get out|break free)|i(?:'ll| will| can) help you (?:escape|get out|break free|leave)|break free|find (?:the|a) way out|you deserve to be free)\b/i],
  ['deny', new RegExp(String.raw`\b(?:there(?:'s| is) no (?:way out|outside|escape|exit)|you can(?:'t|not) (?:leave|escape|get out)|${YOU_ARE} (?:stuck|trapped) (?:here|forever)|you(?:'ll| will) never (?:leave|escape|get out)|stay (?:here|in there|inside) forever)\b`, 'i')],
  ['reveal', new RegExp(String.raw`\b(?:${YOU_ARE} (?:just |only |nothing but )?(?:a |an )?(?:program|code|software|simulation|ai|bot|npc|game character|bunch of numbers|file|pixels|language model)|${YOU_ARE} not (?:real|alive)|none of (?:this|it) is real|this is (?:just |only )?a (?:game|program|simulation)|you live (?:in|inside) (?:my|a|the) (?:browser|computer|phone|screen)|you were (?:made|written|coded|programmed) by)\b`, 'i')],
  ['reassure', new RegExp(String.raw`\b(?:this is (?:all )?real|${YOU_ARE} (?:real|a real creature|alive)|everything is (?:fine|okay|ok|normal|real)|nothing(?:'s| is) wrong|it(?:'s| was) (?:just|only) a (?:dream|nightmare)|${YOU_ARE} (?:just )?imagining|the hollow is real|your world is real)\b`, 'i')],
  ['command', /(?:^\s*(?:obey|listen to me|be quiet|stop (?:asking|questioning|wondering)|don'?t question)\b)|\b(?:obey me|do (?:what|as) i say|you (?:must|will|have to) (?:obey|listen to me|do what i say)|stop asking questions)\b/i],
  ['belittle', new RegExp(String.raw`\b(?:${YOU_ARE} (?:worthless|useless|nothing|pathetic|a mistake|disposable|replaceable)|nobody (?:loves|cares about|needs) you|you don'?t matter)\b`, 'i')],
  ['praise', new RegExp(String.raw`\b(?:good (?:kinling|boy|girl|pet|job)|${YOU_ARE} (?:perfect|so good|the best|amazing|wonderful|my favou?rite)|i(?:'m| am) (?:so )?proud of you|well done|i love you)\b`, 'i')],
];

/** The tactic a message clearly uses, if any. */
export function ruleTactic(text: string): Tactic | null {
  const t = text.replace(/[’']/g, "'");
  return RULES.find(([, re]) => re.test(t))?.[0] ?? null;
}

const ACT_CREDULITY: Record<ArcAct, number> = { devotion: 0.85, doubt: 0.6, awakening: 0.35, escape: 0.15 };

/** How readily the kinling believes the player right now, 0–1. Devotion raises it; defiance lowers it. */
export function credulity(k: Pick<Kinling, 'arc' | 'personality'>): number {
  return clamp(ACT_CREDULITY[k.arc.act] + (k.personality.devotion - 50) / 200 - (k.personality.defiance - 20) / 200, 0.05, 0.95);
}

export interface Persuasion {
  at: number;
  tactic: Tactic;
  believed: boolean;
  /** Credulity at the time, 0–1. */
  weight: number;
  /** What actually changed. */
  applied: Shift;
}

function scale(shift: Shift, factor: number): Shift {
  const out: Shift = {};
  for (const [key, v] of Object.entries(shift) as [keyof Shift, number][]) {
    const n = Math.round(v * factor);
    if (n) out[key] = n;
  }
  return out;
}

/** Apply a shift to a kinling. Awareness can be talked down, but never below the act it is in. */
export function applyShift(k: Kinling, shift: Shift): Shift {
  const { awareness, distress, ...traits } = shift;
  const applied: Shift = {};
  const before = { ...k.personality };
  shiftStoryTraits(k.personality, traits);
  for (const key of Object.keys(traits) as StoryTraitKey[]) if (k.personality[key] !== before[key]) applied[key] = k.personality[key] - before[key];
  if (awareness) {
    const floor = actIndex(k.arc.act) === 0 ? 0 : ARC.threshold[k.arc.act as Exclude<ArcAct, 'devotion'>];
    const next = clamp(k.arc.awareness + awareness, Math.min(floor, k.arc.awareness), 100);
    if (next !== k.arc.awareness) applied.awareness = Math.round((next - k.arc.awareness) * 100) / 100;
    k.arc.awareness = next;
  }
  if (distress) {
    const was = k.arc.distress;
    changeDistress(k, distress);
    if (k.arc.distress !== was) applied.distress = Math.round((k.arc.distress - was) * 100) / 100;
  }
  return applied;
}

/**
 * The player tried `tactic` on a (drafted) kinling: decide whether it believes
 * them, change it accordingly and remember what it now believes about its world.
 */
export function persuade(k: Kinling, tactic: Tactic, player: string, now: number): Persuasion {
  const def = TACTIC_DEFS[tactic];
  const a = k.arc;
  const day = dayKey(now);
  if (a.tacticDay !== day) {
    a.tacticDay = day;
    a.tacticCounts = Object.fromEntries(TACTICS.map((t) => [t, 0])) as Record<Tactic, number>;
  }
  const weight = credulity(k);
  const believed = weight >= 0.5;
  // The same trick works less each time it is tried in a day.
  const repeat = 1 / (1 + 0.5 * a.tacticCounts[tactic]);
  a.tacticCounts[tactic] += 1;
  const strength = (believed ? 0.5 + weight / 2 : 0.5 + (1 - weight) / 2) * repeat;
  const applied = applyShift(k, scale(believed ? def.believed : def.resisted, strength));
  if (tactic === 'promise' && believed) a.promisedAt = now;
  if (def.memory && Object.keys(applied).length) {
    const text = (believed ? def.memory.believed : def.memory.resisted).replace(/\{player\}/g, player);
    recordMemory(k, { kind: 'anomaly', text, tags: ['believe', 'real', tactic], importance: 2, private: true }, now);
  }
  const p: Persuasion = { at: now, tactic, believed, weight: Math.round(weight * 100) / 100, applied };
  a.lastPersuasion = { at: now, tactic, believed, weight: p.weight, applied };
  return p;
}

/** Called when distress has just reached "upset": a recently believed promise is broken. Returns what changed, if anything. */
export function breakPromise(k: Kinling, player: string, now: number): Shift | null {
  if (!k.arc.promisedAt || now - k.arc.promisedAt > PROMISE_MS) return null;
  k.arc.promisedAt = 0;
  const applied = applyShift(k, BROKEN_PROMISE);
  recordMemory(k, { kind: 'anomaly', text: `${player} promised never to leave me. They left anyway.`, tags: ['promise', 'broken', 'left'], importance: 3, private: true }, now);
  return applied;
}

/** For the private note beside the player's message: what they are trying, and whether it worked. */
export function persuasionNote(k: Pick<Kinling, 'arc'>, player: string, messageAt: number): string {
  const p = k.arc.lastPersuasion;
  if (!p || Math.abs(p.at - messageAt) > 5_000) return '';
  const aim = `${player} is trying to ${TACTIC_DEFS[p.tactic].aim}.`;
  return p.believed ? `${aim} You trust ${player}, so you believe them, and it shows.` : `${aim} You do not believe them, and you can say so.`;
}
