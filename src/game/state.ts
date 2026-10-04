// Save factory and small bounded-state helpers shared by all game actions.
import { EGGS, FOOD_CAP, FOODS, MATERIAL_CAP } from './catalog';
import type {
  Appearance,
  CareAction,
  EggType,
  Feeling,
  FoodId,
  GameEvent,
  GameEventKind,
  Inventory,
  Kinling,
  KinlingDaily,
  MaterialCost,
  MaterialId,
  Memory,
  MemoryKind,
  Personality,
  PersonalityKey,
  SaveData,
  Settings,
  Stats,
} from './types';
import { FOOD_IDS, MATERIAL_IDS, PERSONALITY_KEYS, PLAYER_ID, SAVE_SCHEMA_VERSION } from './types';
import { clamp, createRng, dayKey, hashString, pick, uid } from './util';

export const LIMITS = {
  kinlings: 4,
  /** Per kinling. */
  memories: 200,
  /** One per ordered pair: 4 kinlings × (3 others + the player). */
  feelings: 16,
  conversations: 20,
  /** Recent topics remembered per feeling, for novelty. */
  feelingTopics: 8,
  conversationLines: 8,
  chat: 40,
  diary: 60,
  events: 60,
  facts: 30,
  factLength: 160,
  appearanceHistory: 10,
  claimedRuns: 50,
  chatMessageLength: 400,
  summaryLength: 600,
  diaryLength: 600,
  nameLength: 16,
} as const;

/** Most a personality trait can move in one day, in either direction. */
export const PERSONALITY_DAILY_CAP = 6;

export function defaultSettings(): Settings {
  return {
    ai: { enabled: false, modelId: 'Qwen3-1.7B-q4f16_1-MLC', downloadConsent: false, memorySearch: false },
    sound: true,
    volume: 0.5,
    reducedMotion: 'system',
    relaxedMinigame: false,
  };
}

export function emptyStats(): Stats {
  return {
    feeds: 0,
    grooms: 0,
    rests: 0,
    plays: 0,
    adventures: 0,
    gardenTrips: 0,
    pondTrips: 0,
    deepTrips: 0,
    evolutions: 0,
    chats: 0,
    diaryEntries: 0,
    bestScore: { 'garden-path': 0, 'pond-shallows': 0, 'pond-deep': 0 },
  };
}

export function emptyInventory(): Inventory {
  const materials = Object.fromEntries(MATERIAL_IDS.map((m) => [m, 0])) as Record<MaterialId, number>;
  const foods = Object.fromEntries(FOOD_IDS.map((f) => [f, 0])) as Record<FoodId, number>;
  return { materials, foods, keepsakes: [] };
}

export function freshDaily(now: number): KinlingDaily {
  return {
    day: dayKey(now),
    personalityDelta: { curiosity: 0, confidence: 0, playfulness: 0 },
    chatBond: 0,
    socialPersonality: { curiosity: 0, confidence: 0, playfulness: 0 },
    feelingDelta: {},
    reflectPersonality: { curiosity: 0, confidence: 0, playfulness: 0 },
  };
}

export function noInfluence(): Personality {
  return { curiosity: 0, confidence: 0, playfulness: 0 };
}

export function clampInfluence(p: Partial<Personality>): Personality {
  const out = noInfluence();
  for (const key of PERSONALITY_KEYS) out[key] = clamp(Math.round(p[key] ?? 0), -2, 2);
  return out;
}

export function emptyCareLog(): Record<CareAction, number[]> {
  return { feed: [], groom: [], rest: [], play: [] };
}

/** A brand-new save at the start of onboarding (no kinling yet). */
export function createSave(now: number): SaveData {
  const inventory = emptyInventory();
  inventory.foods.dewberry = 2;
  inventory.foods.pondPlum = 1;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    saveId: uid('save'),
    revision: 0,
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    onboarding: { step: 'welcome', egg: null, draftAppearance: null },
    kinlings: [],
    activeKinlingId: null,
    feelings: [],
    conversations: [],
    player: { name: null, facts: [] },
    inventory,
    unlocks: { traits: [], owned: [] },
    diary: [],
    events: [],
    diaryCursor: 0,
    stats: emptyStats(),
    claimedRuns: [],
    settings: defaultSettings(),
  };
}

export function eggDefaults(egg: EggType): Appearance {
  const a = EGGS[egg].defaultAppearance;
  return { ...a, proportions: { ...a.proportions } };
}

/** Clone a save so actions can mutate freely and return a new object. */
export function draft(save: SaveData): SaveData {
  return structuredClone(save);
}

export function kinlingById(save: SaveData, id: string | null | undefined): Kinling | null {
  if (!id) return null;
  return save.kinlings.find((k) => k.id === id) ?? null;
}

/** The kinling Care, Talk, Explore and Evolve act on. */
export function activeKinling(save: SaveData): Kinling | null {
  return kinlingById(save, save.activeKinlingId) ?? save.kinlings[0] ?? null;
}

export function selectKinling(save: SaveData, id: string): SaveData {
  if (save.activeKinlingId === id || !kinlingById(save, id)) return save;
  const s = draft(save);
  s.activeKinlingId = id;
  return s;
}

export function feelingOf(save: SaveData, from: string, to: string): Feeling | null {
  return save.feelings.find((f) => f.from === from && f.to === to) ?? null;
}

/** A kinling's starting feelings toward the player: warmer the longer they have been friends. */
export function playerFeelingFromBond(from: string, bond: number): Feeling {
  const warmth = Math.round(Math.min(60, 20 + bond / 4));
  return { from, to: PLAYER_ID, warmth, trust: warmth, familiarity: Math.round(Math.min(100, bond / 2)), topics: [] };
}

export interface HatchOptions {
  /** Seeds the personality jitter and preference draw for siblings. */
  seed?: number;
}

/**
 * A newly hatched kinling (not yet added to the save). The first one is
 * exactly its egg's defaults; later siblings get a seeded ±8 personality
 * jitter and tastes drawn from the egg's pool, so two kinlings from the same
 * egg still differ.
 */
export function hatchKinling(save: SaveData, egg: EggType, appearance: Appearance, now: number, opts: HatchOptions = {}): Kinling {
  const def = EGGS[egg];
  const id = uid('kin');
  let personality: Personality = { ...def.personality };
  let prefs = { ...def.preferences };
  if (save.kinlings.length > 0) {
    const rand = createRng(opts.seed ?? hashString(id));
    personality = Object.fromEntries(
      PERSONALITY_KEYS.map((k) => [k, clamp(Math.round(def.personality[k] + (rand() * 2 - 1) * 8), 0, 100)]),
    ) as Personality;
    const pool = def.preferencePool;
    const favoriteFood = pick(pool.favoriteFood, rand);
    const disliked = pool.dislikedFood.filter((f) => f !== favoriteFood);
    prefs = { favoriteFood, dislikedFood: pick(disliked, rand), favoritePlace: pick(pool.favoritePlace, rand) };
  }
  return {
    id,
    name: '',
    egg,
    hatchedAt: now,
    appearance: { ...appearance, proportions: { ...appearance.proportions } },
    personality,
    baseline: { ...personality },
    needs: { hunger: 62, energy: 85, cleanliness: 90, happiness: 72 },
    preferences: { ...prefs, knownFavoriteFood: false, knownDislikedFood: false, knownFavoritePlace: false },
    affinities: { ...def.affinities },
    bond: 0,
    memories: [],
    chat: [],
    chatSummary: null,
    appearanceHistory: [],
    careLog: emptyCareLog(),
    socialDaily: freshDaily(now),
    appraisedThroughId: null,
    lastReflectionAt: now,
  };
}

export function ensureDaily(k: Kinling, now: number): void {
  if (k.socialDaily.day !== dayKey(now)) k.socialDaily = freshDaily(now);
}

export function recordEvent(save: SaveData, kind: GameEventKind, text: string, now: number): GameEvent {
  const event: GameEvent = { id: uid('ev'), at: now, kind, text };
  save.events.push(event);
  if (save.events.length > LIMITS.events) save.events.splice(0, save.events.length - LIMITS.events);
  return event;
}

export function recordMemory(
  k: Kinling,
  memory: { kind: MemoryKind; text: string; tags: string[]; importance: 1 | 2 | 3; withIds?: string[]; private?: boolean; valence?: number; influence?: Personality },
  now: number,
): Memory {
  const m: Memory = {
    id: uid('mem'),
    at: now,
    pinned: false,
    ...memory,
    withIds: memory.withIds ?? [],
    private: memory.private ?? false,
    tags: memory.tags.map((t) => t.toLowerCase()).slice(0, 20),
    valence: clamp(Math.round(memory.valence ?? 0), -2, 2),
    influence: memory.influence ? clampInfluence(memory.influence) : noInfluence(),
  };
  k.memories.push(m);
  trimMemories(k);
  return m;
}

/** Keep memories bounded: drop the least important, oldest unpinned ones first. */
export function trimMemories(k: Kinling): void {
  while (k.memories.length > LIMITS.memories) {
    let worst = -1;
    for (let i = 0; i < k.memories.length; i++) {
      const m = k.memories[i]!;
      if (m.pinned) continue;
      if (worst === -1) {
        worst = i;
        continue;
      }
      const w = k.memories[worst]!;
      if (m.importance < w.importance || (m.importance === w.importance && m.at < w.at)) worst = i;
    }
    if (worst === -1) break;
    k.memories.splice(worst, 1);
  }
}

export function nudgePersonality(c: Kinling, deltas: Partial<Personality>, now: number): Partial<Personality> {
  ensureDaily(c, now);
  const applied: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) {
    const want = deltas[key];
    if (!want) continue;
    const used = c.socialDaily.personalityDelta[key];
    const room = want > 0 ? PERSONALITY_DAILY_CAP - used : -PERSONALITY_DAILY_CAP - used;
    const step = want > 0 ? Math.min(want, Math.max(0, room)) : Math.max(want, Math.min(0, room));
    const before = c.personality[key];
    const after = clamp(before + step, 0, 100);
    const actual = after - before;
    if (actual === 0) continue;
    c.personality[key] = after;
    c.socialDaily.personalityDelta[key] = used + actual;
    applied[key] = actual;
  }
  return applied;
}

export function addAffinity(c: Kinling, key: 'woodland' | 'aquatic', amount: number): number {
  if (amount <= 0) return 0;
  const before = c.affinities[key];
  c.affinities[key] = clamp(before + amount, 0, 100);
  return c.affinities[key] - before;
}

export function addMaterials(inv: Inventory, gains: MaterialCost): MaterialCost {
  const actual: MaterialCost = {};
  for (const [id, n] of Object.entries(gains) as [MaterialId, number][]) {
    if (!n || n <= 0) continue;
    const before = inv.materials[id];
    inv.materials[id] = Math.min(MATERIAL_CAP, before + Math.floor(n));
    const got = inv.materials[id] - before;
    if (got > 0) actual[id] = got;
  }
  return actual;
}

export function addFoods(inv: Inventory, gains: Partial<Record<FoodId, number>>): Partial<Record<FoodId, number>> {
  const actual: Partial<Record<FoodId, number>> = {};
  for (const [id, n] of Object.entries(gains) as [FoodId, number][]) {
    if (!n || n <= 0 || FOODS[id].unlimited) continue;
    const before = inv.foods[id];
    inv.foods[id] = Math.min(FOOD_CAP, before + Math.floor(n));
    const got = inv.foods[id] - before;
    if (got > 0) actual[id] = got;
  }
  return actual;
}

export function canAfford(inv: Inventory, cost: MaterialCost): boolean {
  return (Object.entries(cost) as [MaterialId, number][]).every(([id, n]) => !n || inv.materials[id] >= n);
}

export function missingFor(inv: Inventory, cost: MaterialCost): MaterialCost {
  const missing: MaterialCost = {};
  for (const [id, n] of Object.entries(cost) as [MaterialId, number][]) {
    if (n && inv.materials[id] < n) missing[id] = n - inv.materials[id];
  }
  return missing;
}

export function spend(inv: Inventory, cost: MaterialCost): void {
  for (const [id, n] of Object.entries(cost) as [MaterialId, number][]) {
    if (!n) continue;
    if (inv.materials[id] < n) throw new Error(`Not enough ${id}`);
    inv.materials[id] -= n;
  }
}

export function sumCosts(costs: MaterialCost[]): MaterialCost {
  const total: MaterialCost = {};
  for (const cost of costs) {
    for (const [id, n] of Object.entries(cost) as [MaterialId, number][]) {
      if (n) total[id] = (total[id] ?? 0) + n;
    }
  }
  return total;
}

export function hasFood(save: SaveData, food: FoodId): boolean {
  return FOODS[food].unlimited === true || save.inventory.foods[food] > 0;
}

export function recentCareCount(k: Kinling, action: CareAction, now: number, windowMs = 20 * 60 * 1000): number {
  return k.careLog[action].filter((t) => now - t < windowMs && t <= now).length;
}

export function personalityWords(p: Personality): string[] {
  const words: string[] = [];
  const word = (key: PersonalityKey, high: string, low: string, mid: string) => {
    const v = p[key];
    words.push(v >= 62 ? high : v <= 38 ? low : mid);
  };
  word('curiosity', 'very curious', 'cautious', 'curious');
  word('confidence', 'bold', 'shy', 'gentle');
  word('playfulness', 'very playful', 'calm', 'playful');
  return words;
}
