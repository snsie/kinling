// Chat history, player facts, memories management and diary entries.
import { addBond } from './progress';
import { draft, ensureDaily, LIMITS, recordEvent } from './state';
import type { ChatMessage, ChatRole, DiaryEntry, GameEvent, Memory, PlayerFact, SaveData } from './types';
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

export function addChatMessage(save: SaveData, role: ChatRole, text: string, source: ChatMessage['source'], now: number): SaveData {
  const clean = sanitizeText(text, LIMITS.chatMessageLength);
  if (!clean) return save;
  const s = draft(save);
  ensureDaily(s, now);
  s.chat.push({ id: uid('msg'), at: now, role, text: clean, source });
  if (s.chat.length > LIMITS.chat) s.chat.splice(0, s.chat.length - LIMITS.chat);
  if (role === 'player') {
    s.stats.chats += 1;
    if (s.daily.chatBond < 5) {
      s.daily.chatBond += 1;
      addBond(s, 0.5);
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
  const fact: PlayerFact = { id: uid('fact'), at: now, text: clean };
  s.player.facts.push(fact);
  if (s.player.facts.length > LIMITS.facts) s.player.facts.splice(0, s.player.facts.length - LIMITS.facts);
  return { save: s, fact };
}

export function removePlayerFact(save: SaveData, id: string): SaveData {
  const s = draft(save);
  s.player.facts = s.player.facts.filter((f) => f.id !== id);
  return s;
}

export function setMemoryPinned(save: SaveData, id: string, pinned: boolean): SaveData {
  const s = draft(save);
  const m = s.memories.find((x) => x.id === id);
  if (m) m.pinned = pinned;
  return s;
}

export function forgetMemory(save: SaveData, id: string): SaveData {
  const s = draft(save);
  s.memories = s.memories.filter((m) => m.id !== id);
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

/** Pick the memories most relevant to a query: keyword overlap, importance, pins and recency. */
export function relevantMemories(memories: Memory[], query: string, now: number, limit = 4): Memory[] {
  const words = keywords(query);
  const scored = memories.map((m) => {
    const hay = new Set([...m.tags, ...keywords(m.text)]);
    let overlap = 0;
    for (const w of words) {
      if (hay.has(w)) overlap += 1;
      else if (w.length > 4 && [...hay].some((h) => h.startsWith(w.slice(0, 4)))) overlap += 0.5;
    }
    const ageDays = Math.max(0, now - m.at) / 86_400_000;
    const score = overlap * 3 + m.importance * 1.2 + (m.pinned ? 4 : 0) + 2 * Math.exp(-ageDays / 7);
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score || b.m.at - a.m.at);
  return scored.slice(0, limit).map((x) => x.m);
}

export function relevantFacts(facts: PlayerFact[], query: string, limit = 4): PlayerFact[] {
  const words = keywords(query);
  return [...facts]
    .map((f, i) => ({ f, score: keywords(f.text).filter((w) => words.includes(w)).length * 3 + i / facts.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
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
  const name = save.creature?.name;
  let t = text;
  if (name && t.startsWith(`${name} `)) t = `I ${t.slice(name.length + 1)}`;
  t = t.replace(/\bits (look|proportions|accent|marking)/g, 'my $1');
  if (name) t = t.replace(new RegExp(`; ${name} had`, 'g'), '; I had');
  if (t.startsWith('A kinling hatched')) t = t.replace('A kinling hatched', 'I hatched');
  if (t.startsWith('The new kinling was named')) t = t.replace('The new kinling was named', 'I was named');
  return t;
}

export function authoredDiary(save: SaveData, events: GameEvent[]): string {
  const name = save.creature?.name ?? 'me';
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
  const closer = save.creature && save.creature.needs.happiness > 60 ? 'I feel warm and happy.' : 'Tomorrow will be lovely too.';
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
  addBond(s, 2);
  recordEvent(s, 'diary', `${s.creature?.name ?? 'The kinling'} wrote in the diary.`, now);
  return s;
}
