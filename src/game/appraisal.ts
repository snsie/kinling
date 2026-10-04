// How a kinling takes in what the player says, and how what it remembers
// slowly shapes who it is.
//
// 1. Appraisal: each player message becomes (at most) one memory with a
//    feeling and a small personality "influence". Rules always run; the model
//    may write a better memory, but code checks it is grounded in the player's
//    own words and decides every effect.
// 2. Feelings toward the player move a little right away (within the same
//    per-conversation and per-day limits as kinling feelings).
// 3. Reflection: once enough influence has piled up in recent memories, the
//    kinling reflects. Personality moves a few points (bounded per day and
//    over a lifetime) and the kinling remembers noticing the change, so it can
//    talk about why it feels braver lately.
import { changeFeeling, ensureFeeling, type FeelingDelta } from './feelings';
import { clamp } from './util';
import { draft, ensureDaily, kinlingById, noInfluence, recordEvent, recordMemory, LIMITS } from './state';
import type { ChatMessage, Kinling, Memory, Personality, PersonalityKey, SaveData } from './types';
import { PERSONALITY_KEYS, PLAYER_ID } from './types';
import { keywords } from './words';

export const FEELINGS = ['loved', 'proud', 'happy', 'excited', 'curious', 'calm', 'worried', 'hurt', 'neutral'] as const;
export type FeelingWord = (typeof FEELINGS)[number];
export const GROWTHS = ['braver', 'shyer', 'more curious', 'more cautious', 'more playful', 'calmer', 'none'] as const;
export type Growth = (typeof GROWTHS)[number];

export interface Appraisal {
  /** First-person memory text, already checked; null when nothing is worth remembering. */
  memory: string | null;
  importance: 1 | 2 | 3;
  feeling: FeelingWord;
  growth: Growth;
  /** The player shared something about themselves (builds trust). */
  shared: boolean;
}

const GROWTH_INFLUENCE: Record<Growth, Partial<Personality>> = {
  braver: { confidence: 1 },
  shyer: { confidence: -1 },
  'more curious': { curiosity: 1 },
  'more cautious': { curiosity: -1 },
  'more playful': { playfulness: 1 },
  calmer: { playfulness: -1 },
  none: {},
};

const FEELING_EFFECT: Record<FeelingWord, { valence: number; warmth: number; trust: number }> = {
  loved: { valence: 2, warmth: 2, trust: 1 },
  proud: { valence: 2, warmth: 2, trust: 1 },
  happy: { valence: 1, warmth: 1, trust: 0 },
  excited: { valence: 1, warmth: 1, trust: 0 },
  curious: { valence: 1, warmth: 1, trust: 0 },
  calm: { valence: 1, warmth: 1, trust: 0 },
  // Being confided in brings a kinling closer, even when the news is worrying.
  worried: { valence: 0, warmth: 1, trust: 1 },
  hurt: { valence: -2, warmth: -2, trust: -2 },
  neutral: { valence: 0, warmth: 0, trust: 0 },
};

// ---------------------------------------------------------------------------
// Rules

const MEAN = /\b(stupid|dumb|idiot|ugly|i hate you|hate you|shut up|annoying|go away|useless|you'?re (bad|the worst|boring)|i don'?t like you|leave me alone)\b/;
const BRAVE = /\b(brave|braver|bravest|courage|courageous|proud of you|believe in you|you can do (it|this|hard things)|you did it|so strong|fearless|not scared|be bold|bold)\b/;
const STRONG_CHEER = /\b(proud of you|believe in you|you can do (it|this|hard things)|you did it)\b/;
const LOVE = /\b(love you|best friend|my favou?rite|so cute|you'?re cute|adorable|so sweet|good (boy|girl|kinling)|thank you|thanks|you'?re (the best|amazing|wonderful|awesome|great|lovely|so kind)|i like you|miss(ed)? you)\b/;
const WONDER = /\b(wonder|imagine|what if|discover|mystery|mysteries|curious|learn about|figure out|how come)\b|\b(what|why|how) do you think\b|\b(made of|bottom of|far away|outer space)\b/;
const CAUTION = /\b(be careful|careful|dangerous|too risky|don'?t go|stay away|stay safe|not safe|watch out)\b/;
const PLAY = /\b(lol|lmao|haha+|hehe+|joke|jokes|silly|funny|let'?s play|tag you|race you|tickle|giggle|dance party|goofy)\b/;
const CALM = /\b(calm|relax|relaxing|quiet|gentle|slow down|breathe|peaceful|snuggle|cuddle|rest with me|take it easy)\b/;
const WORRY = /\b(sad|nervous|scared|worried|worry|rough day|bad day|upset|lonely|cried|crying|anxious|stressed|afraid|mean to me|hard day|tired of)\b/;
const NEWS = /\b(guess what|excited|great news|good news|yay|i won|we won|birthday|so happy|can'?t wait)\b/;
const FIRST_PERSON = /\b(i|i'?m|im|i'?ve|i'?d|my|mine|me|we|we'?re|we'?ve|our|us)\b/;

/** Could this message be the player sharing something about themselves? */
export function sharesSomething(text: string): boolean {
  const t = text.trim();
  return t.length >= 12 && !/\?\s*$/.test(t) && FIRST_PERSON.test(t.toLowerCase());
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim()}…`;
}

const THIRD_PERSON: [RegExp, string][] = [
  [/\bi am\b/gi, 'they are'],
  [/\bi'?m\b/gi, "they're"],
  [/\bi was\b/gi, 'they were'],
  [/\bi'?ve\b/gi, "they've"],
  [/\bi'?d\b/gi, "they'd"],
  [/\bi'?ll\b/gi, "they'll"],
  [/\bi\b/gi, 'they'],
  [/\bmyself\b/gi, 'themself'],
  [/\bmy\b/gi, 'their'],
  [/\bmine\b/gi, 'theirs'],
  [/\bme\b/gi, 'them'],
  [/\bwe'?re\b/gi, "they're"],
  [/\bwe\b/gi, 'they'],
  [/\bour\b/gi, 'their'],
  [/\bus\b/gi, 'them'],
];
const INTERJECTION = /^(hi|hey|hello|guess what|so|well|oh|omg|ok|okay|yay|wow|um+|uh+|lol)\b[\s,!.:-]*/i;

/**
 * The player's own words retold from the kinling's side: "we just got a puppy"
 * → "they just got a puppy". Keeps the clauses where the player talks about
 * themselves and drops greetings, so a small model cannot mistake the player's
 * experiences for its own.
 */
export function retold(text: string, max = 120): string {
  const clauses = text.split(/(?<=[.!?])\s+|[!?]+\s*/).map((c) => c.trim()).filter(Boolean);
  const own = clauses.filter((c) => FIRST_PERSON.test(c.toLowerCase()));
  let t = (own.length ? own : clauses).join(', ');
  for (let i = 0; i < 3 && INTERJECTION.test(t); i++) t = t.replace(INTERJECTION, '');
  for (const [re, to] of THIRD_PERSON) t = t.replace(re, to);
  return clip(t.replace(/[.!?,\s]+$/, ''), max);
}

/** Ordinary sharing is a small memory unless it is news, a worry or about people and plans. */
const WEIGHTY = /\b(sister|brother|mom|mum|dad|grandma|grandpa|family|friend|puppy|dog|cat|kitten|pet|birthday|recital|concert|test|exam|game|trip|moving|new|named|tomorrow|tonight|weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|love|hate|favou?rite)\b/;

/** What the rules make of a message on their own (also the answer when AI is off). */
export function ruleAppraisal(playerName: string, text: string): Appraisal {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  const p = playerName;
  // "do you feel braver?" asks; "I'm proud of you" cheers.
  const brave = BRAVE.test(t) && (!/\?\s*$/.test(t) || STRONG_CHEER.test(t));
  const shared = sharesSomething(text) && !brave && !MEAN.test(t) && !LOVE.test(t);
  if (MEAN.test(t)) return { memory: `${p} said something unkind to me.`, importance: 2, feeling: 'hurt', growth: 'shyer', shared: false };
  if (brave) return { memory: `${p} cheered me on and told me I was brave.`, importance: 2, feeling: 'proud', growth: 'braver', shared: false };
  if (CAUTION.test(t)) return { memory: `${p} asked me to be careful.`, importance: 1, feeling: 'calm', growth: 'more cautious', shared: false };
  if (shared && WORRY.test(t)) return { memory: `${p} told me something was worrying them: ${retold(text)}.`, importance: 2, feeling: 'worried', growth: 'none', shared: true };
  if (shared && NEWS.test(t)) return { memory: `${p} shared happy news: ${retold(text)}.`, importance: 2, feeling: 'excited', growth: 'none', shared: true };
  if (LOVE.test(t)) {
    const big = /love you|best friend/.test(t);
    return { memory: `${p} said something sweet to me: "${clip(text, 80)}"`, importance: big ? 2 : 1, feeling: 'loved', growth: 'none', shared: false };
  }
  if (PLAY.test(t)) return { memory: `${p} and I were silly together.`, importance: 1, feeling: 'excited', growth: 'more playful', shared: false };
  if (WONDER.test(t)) return { memory: `${p} and I wondered about the world together.`, importance: 1, feeling: 'curious', growth: 'more curious', shared: false };
  if (CALM.test(t)) return { memory: `${p} and I had a calm, quiet moment.`, importance: 1, feeling: 'calm', growth: 'calmer', shared: false };
  if (shared) return { memory: `${p} told me ${retold(text)}.`, importance: WEIGHTY.test(t) ? 2 : 1, feeling: 'happy', growth: 'none', shared: true };
  return { memory: null, importance: 1, feeling: 'neutral', growth: 'none', shared: false };
}

// ---------------------------------------------------------------------------
// Model proposals

/** Words a memory may use besides the player's own: names and the language of remembering. */
const FRAMING = new Set(
  'told tells telling said says saying asked asks talked talking shared sharing mentioned explained remember remembered friend about today feel feels felt feeling happy excited proud loved worried nervous sad scared glad kind sweet nice brave cheered encouraged believes wants wanted hope hopes thinks thought new little big really very soon later week next told'.split(' '),
);

/**
 * A model-written memory must be mostly the player's own words (plus names and
 * framing words), so it cannot remember things that were never said.
 */
export function memoryIsGrounded(memory: string, playerText: string, names: string[]): boolean {
  const words = keywords(memory);
  if (!words.length) return false;
  const said = new Set(keywords(playerText));
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const content = words.filter((w) => !FRAMING.has(w) && !nameSet.has(w));
  if (!content.length) return false;
  const grounded = content.filter((w) => said.has(w) || said.has(w.replace(/s$/, '')) || said.has(`${w}s`));
  return grounded.length / content.length >= 0.8;
}

/**
 * Keep only the sentences of model-written notes that are grounded in what the
 * player actually said, so the notes cannot drift into invented plans.
 */
export function groundedSentences(text: string, said: string, names: string[]): string {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .map((s) => s.trim())
    .filter((s) => s && memoryIsGrounded(s, said, names))
    .join(' ');
}

export interface ModelAppraisal {
  memory: string;
  importance: 'small' | 'meaningful' | 'big';
  feeling: FeelingWord;
}

/**
 * Combine the rules with a model proposal. The model may word the memory
 * better, judge how much it matters and name the feeling; growth always comes
 * from the rules, so personality only moves for reasons that can be pointed
 * to in what the player said. A question with nothing the rules recognise is
 * never remembered (small models "remember" the question as if it were news).
 */
export function mergeAppraisal(rule: Appraisal, model: ModelAppraisal | null, playerText: string, names: string[], toneOk: (t: string) => boolean): Appraisal {
  if (!model) return rule;
  if (!rule.memory && /\?\s*$/.test(playerText.trim())) return rule;
  const text = clip(model.memory, 200);
  // A few words ("lol") give the model nothing to word better than the rules do.
  const enough = keywords(playerText).length >= 3;
  const balanced = (text.match(/["“”]/g) ?? []).length % 2 === 0 && (text.match(/(^|\s)'|'(\s|$)/g) ?? []).length % 2 === 0;
  const usable = enough && balanced && text.length >= 12 && toneOk(text) && memoryIsGrounded(text, playerText, names);
  if (!usable && !rule.memory) return rule;
  const strongRule = rule.feeling === 'hurt' || rule.feeling === 'proud' || rule.feeling === 'loved';
  const modelImportance = model.importance === 'big' ? 3 : model.importance === 'meaningful' ? 2 : 1;
  return {
    memory: usable ? text : rule.memory,
    // The model cannot make small talk momentous on its own.
    importance: Math.max(rule.importance, Math.min(modelImportance, rule.memory ? 3 : 1)) as 1 | 2 | 3,
    feeling: strongRule || model.feeling === 'neutral' ? rule.feeling : model.feeling,
    growth: rule.growth,
    shared: rule.shared,
  };
}

// ---------------------------------------------------------------------------
// Applying

/** Player messages not yet appraised, each with the kinling's reply when it has one. */
export function pendingAppraisals(k: Kinling, max = 4): { message: ChatMessage; reply: ChatMessage | null }[] {
  const idx = k.appraisedThroughId ? k.chat.findIndex((m) => m.id === k.appraisedThroughId) : -1;
  const fresh = k.chat.slice(idx + 1);
  const out: { message: ChatMessage; reply: ChatMessage | null }[] = [];
  fresh.forEach((m, i) => {
    if (m.role !== 'player') return;
    const next = fresh[i + 1];
    out.push({ message: m, reply: next?.role === 'creature' ? next : null });
  });
  return out.slice(-max);
}

/** Similar memories within this window are merged rather than repeated. */
const MERGE_WINDOW_MS = 6 * 3_600_000;

function sameMoment(a: string, b: string): boolean {
  if (a === b) return true;
  const x = new Set(keywords(a));
  const y = new Set(keywords(b));
  if (!x.size || !y.size) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared) >= 0.6;
}

export interface AppliedAppraisal {
  save: SaveData;
  memory: Memory | null;
  feeling: FeelingDelta;
}

/**
 * Record one appraised player message: a feeling change toward the player,
 * the cursor, and a memory if it is worth one. A message that is no longer
 * next in line (or was already handled) leaves the save unchanged.
 */
export function applyAppraisal(save: SaveData, kinlingId: string, messageId: string, a: Appraisal, now: number): AppliedAppraisal {
  const none = { save, memory: null, feeling: { warmth: 0, trust: 0 } };
  const k0 = kinlingById(save, kinlingId);
  if (!k0 || !pendingAppraisals(k0, LIMITS.chat).some((p) => p.message.id === messageId)) return none;
  const s = draft(save);
  const k = kinlingById(s, kinlingId)!;
  k.appraisedThroughId = messageId;
  ensureDaily(k, now);
  const effect = FEELING_EFFECT[a.feeling];
  const f = ensureFeeling(s, k.id, PLAYER_ID);
  const feeling = changeFeeling(k, f, { warmth: effect.warmth, trust: effect.trust + (a.shared ? 1 : 0) }, now);
  if (!a.memory) return { save: s, memory: null, feeling };
  f.familiarity = clamp(f.familiarity + 1, 0, 100);

  const influence = { ...noInfluence(), ...GROWTH_INFLUENCE[a.growth] };
  const similar = k.memories.find((m) => m.kind === 'player-chat' && now - m.at < MERGE_WINDOW_MS && sameMoment(m.text, a.memory!));
  if (similar) {
    // Hearing the same thing again makes it stick. Influence already reflected on is not counted twice.
    const reflected = similar.at <= k.lastReflectionAt;
    for (const key of PERSONALITY_KEYS) similar.influence[key] = clamp((reflected ? 0 : similar.influence[key]) + influence[key], -2, 2);
    similar.importance = Math.min(3, Math.max(similar.importance, a.importance) + 1) as 1 | 2 | 3;
    similar.valence = Math.abs(effect.valence) > Math.abs(similar.valence) ? effect.valence : similar.valence;
    similar.at = now;
    return { save: s, memory: similar, feeling };
  }
  const memory = recordMemory(
    k,
    {
      kind: 'player-chat',
      text: a.memory,
      tags: ['chat', a.feeling, ...(a.growth !== 'none' ? [a.growth.replace('more ', '')] : [])],
      importance: a.importance,
      withIds: [PLAYER_ID],
      private: true,
      valence: effect.valence,
      influence,
    },
    now,
  );
  return { save: s, memory, feeling };
}

// ---------------------------------------------------------------------------
// Reflection

export const REFLECTION = {
  /** Pressure needed for one point of change. */
  unit: 1.5,
  /** Most one reflection moves a trait. */
  maxStep: 3,
  /** Most reflection moves a trait in a day, in either direction. */
  dailyCap: 4,
  /** Reflection never takes a trait further than this from how the kinling hatched. */
  driftLimit: 30,
  /** Reflect sooner than this only when enough has piled up. */
  quietMs: 6 * 3_600_000,
} as const;

function weight(m: Memory): number {
  return 0.5 + m.importance / 2;
}

function unreflected(k: Kinling): Memory[] {
  return k.memories.filter((m) => m.at > k.lastReflectionAt && m.kind !== 'reflection');
}

/** Net push on each trait from memories not yet reflected on. */
export function personalityPressure(k: Kinling): Personality {
  const p = noInfluence();
  for (const m of unreflected(k)) for (const key of PERSONALITY_KEYS) p[key] += m.influence[key] * weight(m);
  return p;
}

/**
 * Reflect once a trait has a clear push (two meaningful moments), once several
 * moments have piled up, or after a quiet spell if there is enough for a point.
 */
export function shouldReflect(k: Kinling, now: number): boolean {
  const moving = unreflected(k).filter((m) => PERSONALITY_KEYS.some((key) => m.influence[key] !== 0));
  if (!moving.length) return false;
  const p = personalityPressure(k);
  const strongest = Math.max(...PERSONALITY_KEYS.map((key) => Math.abs(p[key])));
  if (strongest < REFLECTION.unit) return false;
  return strongest >= 3 || moving.length >= 4 || now - k.lastReflectionAt >= REFLECTION.quietMs;
}

const TRAIT_PHRASE: Record<PersonalityKey, { up: string; down: string }> = {
  confidence: { up: 'braver', down: 'a little shyer' },
  curiosity: { up: 'more curious about everything', down: 'more careful' },
  playfulness: { up: 'more playful', down: 'calmer' },
};

export function growthPhrase(key: PersonalityKey, dir: number): string {
  return dir > 0 ? TRAIT_PHRASE[key].up : TRAIT_PHRASE[key].down;
}

/** "Sam told me I was brave." → "Sam told me I was brave", ready to follow "when". */
function asClause(text: string): string {
  // A quote or detail after a colon reads badly mid-sentence; the gist before it is enough.
  const gist = /^[^:"“]{12,}:\s/.test(text) ? text.slice(0, text.indexOf(':')) : text;
  const t = gist.trim().replace(/["”]?[.!?…]+["”]?$/, '');
  return /^(I|I'm|I've|We)\b/.test(t) || /^[A-Z][a-z]+\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

export interface Reflection {
  save: SaveData;
  change: Partial<Personality>;
  memory: Memory | null;
}

/**
 * Reflect on recent memories: move personality toward what they suggest,
 * within limits, and remember the change and what caused it.
 */
export function reflect(save: SaveData, kinlingId: string, now: number): Reflection {
  const k0 = kinlingById(save, kinlingId);
  if (!k0) return { save, change: {}, memory: null };
  const s = draft(save);
  const k = kinlingById(s, kinlingId)!;
  ensureDaily(k, now);
  const pressure = personalityPressure(k);
  const recent = unreflected(k);
  const change: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) {
    const want = Math.sign(pressure[key]) * Math.min(REFLECTION.maxStep, Math.floor(Math.abs(pressure[key]) / REFLECTION.unit));
    if (!want) continue;
    const used = k.socialDaily.reflectPersonality[key];
    const room = want > 0 ? REFLECTION.dailyCap - used : -REFLECTION.dailyCap - used;
    let step = want > 0 ? Math.min(want, Math.max(0, room)) : Math.max(want, Math.min(0, room));
    const lo = Math.max(0, k.baseline[key] - REFLECTION.driftLimit);
    const hi = Math.min(100, k.baseline[key] + REFLECTION.driftLimit);
    const before = k.personality[key];
    const after = clamp(before + step, Math.min(lo, before), Math.max(hi, before));
    step = after - before;
    if (!step) continue;
    k.personality[key] = after;
    k.socialDaily.reflectPersonality[key] = used + step;
    change[key] = step;
  }
  k.lastReflectionAt = now;

  const moved = (Object.keys(change) as PersonalityKey[]).sort((x, y) => Math.abs(change[y]!) - Math.abs(change[x]!));
  if (!moved.length) return { save: s, change, memory: null };
  const top = moved[0]!;
  const dir = Math.sign(change[top]!);
  const cause = recent.filter((m) => Math.sign(m.influence[top]) === dir).sort((x, y) => Math.abs(y.influence[top]) * weight(y) - Math.abs(x.influence[top]) * weight(x) || y.at - x.at)[0];
  const phrases = moved.slice(0, 2).map((key) => growthPhrase(key, change[key]!));
  const feeling = `Lately I've been feeling ${phrases.join(' and ')}.`;
  const text = cause ? `${feeling} I keep thinking about when ${asClause(cause.text)}.` : feeling;
  recordEvent(s, 'growth', `${k.name} has been feeling ${phrases.join(' and ')} lately.`, now);
  // The same realisation again within a day refreshes the old thought rather than repeating it.
  const same = k.memories.find((m) => m.kind === 'reflection' && m.text === text && now - m.at < 86_400_000);
  if (same) {
    same.at = now;
    return { save: s, change, memory: same };
  }
  const memory = recordMemory(
    k,
    {
      kind: 'reflection',
      text,
      tags: ['growth', 'lately', ...moved, ...phrases.flatMap((x) => keywords(x))],
      importance: 2,
      withIds: cause?.withIds ?? [],
      private: true,
      valence: dir,
    },
    now,
  );
  return { save: s, change, memory };
}

/** The latest reflections, newest first, within a week. */
export function recentReflections(k: Kinling, now: number, max = 2): Memory[] {
  return k.memories
    .filter((m) => m.kind === 'reflection' && now - m.at < 7 * 86_400_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, max);
}

/** How far each trait has moved since hatching, for "since you hatched you've become…". */
export function lifetimeGrowth(k: Kinling, threshold = 8): { key: PersonalityKey; delta: number }[] {
  return PERSONALITY_KEYS.map((key) => ({ key, delta: k.personality[key] - k.baseline[key] })).filter((g) => Math.abs(g.delta) >= threshold);
}

