// Chat history, player facts, memories management and diary entries.
import { addBond } from './progress';
import { activeKinling, draft, ensureDaily, kinlingById, LIMITS, recordEvent } from './state';
import type { ChatMessage, ChatRole, DiaryEntry, GameEvent, Kinling, Memory, PlayerFact, SaveData } from './types';
import { uid } from './util';

/** Strip control characters and markup-ish brackets; collapse whitespace; cap length. */
export function sanitizeText(raw: string, max: number): string {
  return String(raw ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function addChatMessage(save: SaveData, kinlingId: string, role: ChatRole, text: string, source: ChatMessage['source'], now: number): SaveData {
  const clean = sanitizeText(text, LIMITS.chatMessageLength);
  if (!clean || !kinlingById(save, kinlingId)) return save;
  const s = draft(save);
  const k = kinlingById(s, kinlingId)!;
  ensureDaily(k, now);
  k.chat.push({ id: uid('msg'), at: now, role, text: clean, source });
  if (k.chat.length > LIMITS.chat) k.chat.splice(0, k.chat.length - LIMITS.chat);
  if (role === 'player') {
    s.stats.chats += 1;
    if (k.socialDaily.chatBond < 5) {
      k.socialDaily.chatBond += 1;
      addBond(k, 0.5);
    }
  }
  return s;
}

const FACT_PATTERN = /^\s*(?:please\s+)?(?:remember|don'?t forget)(?:\s+that)?[\s:,]+(.{3,})$/i;

/** "remember that I love rain" → "I love rain". Only the player's own words are stored. */
export function extractFact(text: string): string | null {
  const m = FACT_PATTERN.exec(text);
  if (!m) return null;
  const fact = sanitizeText(m[1]!.replace(/[.!]+$/, ''), LIMITS.factLength);
  return fact.length >= 3 ? fact : null;
}

export function addPlayerFact(save: SaveData, text: string, now: number): { save: SaveData; fact: PlayerFact | null } {
  const clean = sanitizeText(text, LIMITS.factLength);
  if (clean.length < 3) return { save, fact: null };
  if (save.player.facts.some((f) => f.text.toLowerCase() === clean.toLowerCase())) return { save, fact: null };
  const s = draft(save);
  const fact: PlayerFact = { id: uid('fact'), at: now, text: clean, shareable: false };
  s.player.facts.push(fact);
  if (s.player.facts.length > LIMITS.facts) s.player.facts.splice(0, s.player.facts.length - LIMITS.facts);
  return { save: s, fact };
}

export function removePlayerFact(save: SaveData, id: string): SaveData {
  const s = draft(save);
  s.player.facts = s.player.facts.filter((f) => f.id !== id);
  return s;
}

/** Memory ids are unique across kinlings, so these find the owner themselves. */
export function setMemoryPinned(save: SaveData, id: string, pinned: boolean): SaveData {
  const s = draft(save);
  const m = s.kinlings.flatMap((k) => k.memories).find((x) => x.id === id);
  if (m) m.pinned = pinned;
  return s;
}

export function forgetMemory(save: SaveData, id: string): SaveData {
  const s = draft(save);
  for (const k of s.kinlings) k.memories = k.memories.filter((m) => m.id !== id);
  return s;
}

const STOPWORDS = new Set(
  'the and you your are was were for with that this have has had what when where how why who did does can could would should will just like about into from they them then than there their our out its not but all any been being some very really much more most also too yes yeah okay ok hey hello'.split(' '),
);

export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ];
}

// Small concept groups so "what's my favorite weather?" can find "I love
// rainy days". Sharing a concept counts for less than sharing a word.
const CONCEPTS: Record<string, string[]> = {
  weather: ['weather', 'rain', 'rainy', 'raining', 'sun', 'sunny', 'sunshine', 'snow', 'snowy', 'cloud', 'cloudy', 'storm', 'windy', 'cold', 'warm', 'hot'],
  food: ['food', 'eat', 'eating', 'snack', 'snacks', 'hungry', 'meal', 'dinner', 'lunch', 'breakfast', 'cook', 'cooking', 'bake', 'baking', 'cake', 'pizza', 'berry', 'dewberry', 'plum', 'bun'],
  color: ['color', 'colour', 'colors', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black', 'white', 'brown', 'gold'],
  pet: ['pet', 'pets', 'dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'bird', 'hamster', 'rabbit', 'bunny', 'turtle'],
  family: ['family', 'mom', 'mum', 'mother', 'dad', 'father', 'sister', 'brother', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'parents', 'aunt', 'uncle', 'cousin', 'baby'],
  friend: ['friend', 'friends', 'friendship', 'buddy', 'pal'],
  school: ['school', 'class', 'teacher', 'homework', 'test', 'exam', 'lesson', 'study', 'work', 'job', 'office'],
  music: ['music', 'song', 'songs', 'sing', 'singing', 'dance', 'dancing', 'piano', 'guitar'],
  water: ['pond', 'water', 'swim', 'swimming', 'lake', 'river', 'sea', 'ocean', 'beach', 'fish', 'frog', 'frogs', 'lily', 'reeds', 'shallows', 'shell', 'pearl'],
  garden: ['garden', 'flower', 'flowers', 'bee', 'bees', 'plant', 'plants', 'clover', 'leaf', 'leaves', 'petal', 'petals', 'tree', 'acorn', 'ladybug'],
  sky: ['sky', 'star', 'stars', 'moon', 'night', 'stardust', 'starlit', 'space'],
  sleep: ['sleep', 'sleepy', 'nap', 'naps', 'tired', 'bed', 'bedtime', 'dream', 'dreams', 'rest'],
  play: ['play', 'playing', 'game', 'games', 'chase', 'fun', 'toy', 'toys', 'adventure', 'explore'],
  celebration: ['birthday', 'party', 'present', 'gift', 'holiday', 'celebrate', 'festival'],
};
const WORD_CONCEPTS = new Map<string, string[]>();
for (const [concept, words] of Object.entries(CONCEPTS)) {
  for (const w of words) WORD_CONCEPTS.set(w, [...(WORD_CONCEPTS.get(w) ?? []), `#${concept}`]);
}

/** Keywords plus simple singulars and "#concept" tags, for retrieval. */
export function expandKeywords(words: string[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    const single = w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : null;
    if (single) out.add(single);
    for (const c of [...(WORD_CONCEPTS.get(w) ?? []), ...(single ? (WORD_CONCEPTS.get(single) ?? []) : [])]) out.add(c);
  }
  return [...out];
}

/** Query/candidate overlap: a shared word counts 1, a shared concept 0.6, a shared word stem 0.5. */
function overlapScore(queryWords: string[], hay: Set<string>): number {
  let overlap = 0;
  for (const w of queryWords) {
    if (hay.has(w)) overlap += w.startsWith('#') ? 0.6 : 1;
    else if (!w.startsWith('#') && w.length > 4 && [...hay].some((h) => h.startsWith(w.slice(0, 4)))) overlap += 0.5;
  }
  return overlap;
}

/** Pick the memories most relevant to a query: word and concept overlap, importance, pins and recency. */
export function relevantMemories(memories: Memory[], query: string, now: number, limit = 4): Memory[] {
  const words = expandKeywords(keywords(query));
  const scored = memories.map((m) => {
    const hay = new Set(expandKeywords([...m.tags, ...keywords(m.text)]));
    const ageDays = Math.max(0, now - m.at) / 86_400_000;
    const score = overlapScore(words, hay) * 3 + m.importance * 1.2 + (m.pinned ? 4 : 0) + 2 * Math.exp(-ageDays / 7);
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score || b.m.at - a.m.at);
  return scored.slice(0, limit).map((x) => x.m);
}

export function relevantFacts(facts: PlayerFact[], query: string, limit = 4): PlayerFact[] {
  const words = expandKeywords(keywords(query));
  return [...facts]
    .map((f, i) => ({ f, score: overlapScore(words, new Set(expandKeywords(keywords(f.text)))) * 3 + i / facts.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

// ---------------------------------------------------------------------------
// Suggested facts and conversation notes. The model writes these; code checks
// them, and facts are only kept when the player confirms.

/** Could this message be the player sharing something lasting about themselves? */
export function mightContainFact(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || /\?\s*$/.test(t) || FACT_PATTERN.test(t)) return false;
  return /\b(i|i'?m|im|i'?ve|i'?d|my|mine|me|we|we'?re|our)\b/i.test(t);
}

/**
 * A suggested fact must be mostly the player's own words, so the model cannot
 * slip in something the player never said.
 */
export function factIsGrounded(fact: string, playerText: string): boolean {
  const words = keywords(fact);
  if (!words.length) return false;
  const said = new Set(keywords(playerText));
  return words.filter((w) => said.has(w) || said.has(w.replace(/s$/, ''))).length / words.length >= 0.6;
}

export function hasFact(save: SaveData, text: string): boolean {
  const t = sanitizeText(text, LIMITS.factLength).toLowerCase();
  return save.player.facts.some((f) => f.text.toLowerCase() === t);
}

/** Messages kept word-for-word in every chat prompt. */
export const CHAT_CONTEXT_MESSAGES = 6;
/** Fold older messages into the notes once this many have piled up. */
export const SUMMARY_BATCH = 6;
const SUMMARY_MAX_INPUT = 12;

/** Older chat messages that left the prompt window and are not in the notes yet. */
export function unsummarizedMessages(k: Kinling): ChatMessage[] {
  const older = k.chat.slice(0, -CHAT_CONTEXT_MESSAGES);
  const throughId = k.chatSummary?.throughId;
  if (!throughId) return older.slice(-SUMMARY_MAX_INPUT);
  const idx = older.findIndex((m) => m.id === throughId);
  if (idx >= 0) return older.slice(idx + 1).slice(-SUMMARY_MAX_INPUT);
  // Chat is append-only and trimmed from the front: if the last folded message
  // is gone entirely, everything left is newer than it.
  return k.chat.some((m) => m.id === throughId) ? [] : older.slice(-SUMMARY_MAX_INPUT);
}

export function needsSummary(k: Kinling): boolean {
  return unsummarizedMessages(k).length >= SUMMARY_BATCH;
}

export function setChatSummary(save: SaveData, kinlingId: string, text: string, throughId: string, now: number): SaveData {
  const clean = sanitizeText(text, LIMITS.summaryLength);
  if (!clean || !kinlingById(save, kinlingId)?.chat.some((m) => m.id === throughId)) return save;
  const s = draft(save);
  kinlingById(s, kinlingId)!.chatSummary = { text: clean, at: now, throughId };
  return s;
}

const DIARY_KINDS = new Set<GameEvent['kind']>(['hatched', 'care', 'adventure', 'keepsake', 'unlock', 'evolved', 'reverted', 'returned', 'stage']);
const SIGNIFICANT = new Set<GameEvent['kind']>(['hatched', 'adventure', 'keepsake', 'unlock', 'evolved', 'stage']);

/** Events since the last diary entry, condensed to at most 8 (important ones first). */
export function pendingDiaryEvents(save: SaveData): GameEvent[] {
  const fresh = save.events.filter((e) => e.at > save.diaryCursor && DIARY_KINDS.has(e.kind));
  const important = fresh.filter((e) => SIGNIFICANT.has(e.kind));
  const rest = fresh.filter((e) => !SIGNIFICANT.has(e.kind));
  // Keep the latest few care moments so the entry is not a list of snacks.
  const chosen = [...important.slice(-6), ...rest.slice(-3)].sort((a, b) => a.at - b.at);
  return chosen.slice(-8);
}

export function canWriteDiary(save: SaveData): boolean {
  const pending = pendingDiaryEvents(save);
  return pending.length >= 2 || pending.some((e) => SIGNIFICANT.has(e.kind));
}

/** First-person rendering of an authored event description. */
export function firstPerson(save: SaveData, text: string): string {
  const name = activeKinling(save)?.name;
  let t = text;
  if (name && t.startsWith(`${name} `)) t = `I ${t.slice(name.length + 1)}`;
  t = t.replace(/\bits (look|proportions|accent|marking)/g, 'my $1');
  if (name) t = t.replace(new RegExp(`; ${name} had`, 'g'), '; I had');
  if (t.startsWith('A kinling hatched')) t = t.replace('A kinling hatched', 'I hatched');
  if (t.startsWith('The new kinling was named')) t = t.replace('The new kinling was named', 'I was named');
  return t;
}

export function authoredDiary(save: SaveData, events: GameEvent[]): string {
  const c = activeKinling(save);
  const name = c?.name ?? 'me';
  if (events.length === 0) return `Dear diary, a quiet day. ${name} is cozy.`;
  const lines: string[] = [];
  for (const e of events.slice(-6)) {
    const line = firstPerson(save, e.text);
    // A keepsake found on an adventure is already mentioned in that adventure's line.
    const found = e.kind === 'keepsake' ? /found the (.+) keepsake/.exec(e.text)?.[1] : undefined;
    if (found && lines.some((l) => l.includes(found))) continue;
    lines.push(line);
  }
  const openers = ['Dear diary,', 'Dear diary, what a day!', 'Diary, guess what?'];
  const opener = openers[events.length % openers.length]!;
  const closer = c && c.needs.happiness > 60 ? 'I feel warm and happy.' : 'Tomorrow will be lovely too.';
  return `${opener} ${lines.join(' ')} ${closer}`;
}

export function addDiaryEntry(save: SaveData, text: string, source: DiaryEntry['source'], eventIds: string[], now: number): SaveData {
  const clean = sanitizeText(text, LIMITS.diaryLength);
  if (!clean) return save;
  const s = draft(save);
  const covered = s.events.filter((e) => eventIds.includes(e.id));
  const cursor = Math.max(s.diaryCursor, ...covered.map((e) => e.at), ...pendingDiaryEvents(s).map((e) => e.at));
  s.diary.push({ id: uid('diary'), at: now, text: clean, source, eventIds: eventIds.slice(0, 12) });
  if (s.diary.length > LIMITS.diary) s.diary.splice(0, s.diary.length - LIMITS.diary);
  s.diaryCursor = cursor;
  s.stats.diaryEntries += 1;
  const writer = activeKinling(s);
  if (writer) addBond(writer, 2);
  recordEvent(s, 'diary', `${writer?.name ?? 'The kinling'} wrote in the diary.`, now);
  return s;
}
