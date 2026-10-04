// Long-term recall: which memories and facts a kinling brings into a
// conversation. Word matching (BM25 over words, singulars and concept tags)
// always runs; when memory search is on, sentence embeddings add matches by
// meaning ("I'm feeling down" ↔ "my friend was mean to me at school").
// Importance, recency and pins break ties, and near-duplicates are skipped so
// a handful of memories cover different things.
import { expandKeywords, keywords } from './words';
import type { Memory, PlayerFact } from './types';

export interface RecallItem {
  id: string;
  text: string;
  at: number;
  tags?: string[];
  /** 1–3 */
  importance?: number;
  pinned?: boolean;
  /** Kinling ids (or 'player') the item is about. */
  withIds?: string[];
}

export interface Recalled<T extends RecallItem> {
  item: T;
  /** 0–1: how well it matches what is being talked about. */
  relevance: number;
  /** False for a filler item that is merely important or recent. */
  relevant: boolean;
}

export interface RecallOptions {
  now: number;
  limit: number;
  /** Earlier turns of the conversation; they count for less than the message itself. */
  context?: string;
  /** Embedding of the query and a lookup for item embeddings (memory search). */
  queryVector?: Float32Array | null;
  vectorOf?: (text: string) => Float32Array | undefined;
  /** Items about these ids are more relevant (e.g. a kinling named in the message). */
  boostIds?: ReadonlySet<string>;
  /** At most this many filler items when too few are relevant. */
  filler?: number;
}

/** Below this an item is not considered related to the query. */
export const MIN_RELEVANCE = 0.25;
/** Earlier turns can add at most this much relevance, so they help follow-ups without drowning the question. */
const CONTEXT_SHARE = 0.35;
const CONCEPT_WEIGHT = 0.6;
const STEM_WEIGHT = 0.5;
const K1 = 1.2;
const B = 0.6;

/** One word of the query: its forms (word, singular), concept groups, and how much it matters. */
interface QueryWord {
  forms: string[];
  concepts: string[];
  boost: number;
}

/** "what's my dog's name?" is about the dog: words right after my/your/our count double. */
const TOPIC_BOOST = 2;

function queryWords(text: string): QueryWord[] {
  const topics = new Set([...text.toLowerCase().matchAll(/\b(?:my|your|our)\s+([\p{L}\p{N}-]+)/gu)].map((m) => m[1]!.replace(/'s$/, '')));
  return keywords(text).map((w) => {
    const all = expandKeywords([w]);
    return { forms: all.filter((t) => !t.startsWith('#')), concepts: all.filter((t) => t.startsWith('#')), boost: topics.has(w) ? TOPIC_BOOST : 1 };
  });
}

function docTerms(item: RecallItem): Set<string> {
  return new Set(expandKeywords([...(item.tags ?? []), ...keywords(item.text)]));
}

/** Saturating map of a BM25 score into 0–1, so one rare shared word is clearly relevant. */
function squash(score: number): number {
  return 1 - Math.exp(-score / 1.5);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Rank items for a query. Relevant items come first (diverse, best first);
 * when fewer than two are relevant, up to `filler` important or recent items
 * are added so the kinling still has something on its mind.
 */
export function recall<T extends RecallItem>(items: readonly T[], query: string, opts: RecallOptions): Recalled<T>[] {
  if (!items.length || opts.limit <= 0) return [];
  const terms = queryWords(query);
  const contextTerms = opts.context ? queryWords(opts.context) : null;
  const docs = items.map(docTerms);
  const n = items.length;
  const avgLen = docs.reduce((s, d) => s + d.size, 0) / n || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  // Rarity relative to the rarest possible word: a word in every memory still counts (30%),
  // a word in just one counts fully, however few memories there are.
  const maxIdf = Math.log(1 + (n - 0.5) / 1.5) || 1;
  const weight = (t: string) => 0.3 + 0.7 * Math.min(1, Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5)) / maxIdf);

  // Meaning matches stand out from the rest of the pool rather than passing a fixed bar.
  const sims = opts.queryVector && opts.vectorOf ? items.map((it) => {
    const v = opts.vectorOf!(it.text);
    return v ? cosine(opts.queryVector!, v) : null;
  }) : null;
  const known = sims?.filter((x): x is number => x !== null) ?? [];
  const base = known.length >= 5 ? Math.max(0.2, median(known)) : 0.3;

  const scored = items.map((item, i) => {
    const d = docs[i]!;
    const norm = K1 * (1 - B + (B * d.size) / avgLen);
    // Each query word counts once, by its best match: the word itself, a shared 4-letter
    // stem ("name" ~ "named") or a shared concept ("dog" ~ "puppy").
    const lexOf = (q: QueryWord[]) => {
      let lex = 0;
      for (const { forms, concepts, boost } of q) {
        let best = Math.max(0, ...forms.filter((f) => d.has(f)).map(weight));
        if (!best) {
          for (const f of forms.filter((x) => x.length >= 4)) {
            const h = [...d].find((x) => !x.startsWith('#') && x.startsWith(f.slice(0, 4)));
            if (h) best = Math.max(best, STEM_WEIGHT * weight(h));
          }
        }
        if (!best) best = Math.max(0, ...concepts.filter((c) => d.has(c)).map((c) => CONCEPT_WEIGHT * weight(c)));
        lex += boost * best * ((K1 + 1) / (1 + norm));
      }
      return lex;
    };
    const lexRel = 1 - (1 - squash(lexOf(terms))) * (1 - (contextTerms ? CONTEXT_SHARE * squash(lexOf(contextTerms)) : 0));
    const sim = sims?.[i];
    const semRel = sim == null ? 0 : Math.max(0, Math.min(1, (sim - base) / 0.25));
    let relevance = 1 - (1 - lexRel) * (1 - semRel);
    if (opts.boostIds && item.withIds?.some((id) => opts.boostIds!.has(id))) relevance = Math.min(1, relevance + 0.35);
    const ageDays = Math.max(0, opts.now - item.at) / 86_400_000;
    const salience = 0.4 * (((item.importance ?? 1) - 1) / 2) + 0.6 * Math.exp(-ageDays / 5) + (item.pinned ? 0.6 : 0);
    return { item, relevance, salience, score: 3 * relevance + salience, terms: d };
  });

  const pool = scored.filter((x) => x.relevance >= MIN_RELEVANCE).sort((a, b) => b.score - a.score || b.item.at - a.item.at);
  const chosen: typeof scored = [];
  // Maximal marginal relevance: skip items that mostly repeat one already chosen.
  while (chosen.length < opts.limit && pool.length) {
    let best = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const overlap = Math.max(0, ...chosen.map((c) => jaccard(c.terms, pool[i]!.terms)));
      const value = pool[i]!.score - 2 * overlap;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    chosen.push(pool.splice(best, 1)[0]!);
  }
  const out: Recalled<T>[] = chosen.map((c) => ({ item: c.item, relevance: c.relevance, relevant: true }));

  const filler = Math.min(opts.filler ?? 1, opts.limit - out.length);
  if (out.length < 2 && filler > 0) {
    const taken = new Set(out.map((o) => o.item.id));
    const rest = scored.filter((x) => !taken.has(x.item.id)).sort((a, b) => b.salience - a.salience || b.item.at - a.item.at);
    for (const x of rest.slice(0, filler)) out.push({ item: x.item, relevance: x.relevance, relevant: false });
  }
  return out;
}

/** "earlier today", "yesterday", "3 days ago"… for placing a memory in time. */
export function whenLabel(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff < 10 * 60_000) return 'just now';
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return 'a while ago';
}

export function memoryItems(memories: readonly Memory[]): Memory[] {
  return memories.filter((m) => m.kind !== 'reflection');
}

export function factItems(facts: readonly PlayerFact[]): (PlayerFact & { importance: number })[] {
  // Facts the player chose to share are always meaningful.
  return facts.map((f) => ({ ...f, importance: 2 }));
}
