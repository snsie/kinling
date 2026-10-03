// Save factory and small bounded-state helpers shared by all game actions.
import { EGGS, FOOD_CAP, FOODS, MATERIAL_CAP } from './catalog';
import type {
  Appearance,
  CareAction,
  DailyCounters,
  EggType,
  FoodId,
  GameEvent,
  GameEventKind,
  Inventory,
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
import { FOOD_IDS, MATERIAL_IDS, PERSONALITY_KEYS, SAVE_SCHEMA_VERSION } from './types';
import { clamp, dayKey, uid } from './util';

export const LIMITS = {
  memories: 80,
  chat: 40,
  diary: 60,
  events: 60,
  facts: 30,
  factLength: 160,
  appearanceHistory: 10,
  claimedRuns: 50,
  chatMessageLength: 400,
  diaryLength: 600,
  nameLength: 16,
} as const;

/** Most a personality trait can move in one day, in either direction. */
export const PERSONALITY_DAILY_CAP = 6;

export function defaultSettings(): Settings {
  return {
    ai: { enabled: false, modelId: 'Qwen3-1.7B-q4f16_1-MLC', downloadConsent: false },
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

export function freshDaily(now: number): DailyCounters {
  return {
    day: dayKey(now),
    personalityDelta: { curiosity: 0, confidence: 0, playfulness: 0 },
    careLog: { feed: [], groom: [], rest: [], play: [] },
    chatBond: 0,
  };
}

/** A brand-new save at the start of onboarding (no creature yet). */
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
    creature: null,
    player: { name: null, facts: [] },
    inventory,
    unlocks: { traits: [], owned: [] },
    appearanceHistory: [],
    memories: [],
    chat: [],
    diary: [],
    events: [],
    diaryCursor: 0,
    stats: emptyStats(),
    daily: freshDaily(now),
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

export function ensureDaily(save: SaveData, now: number): void {
  const key = dayKey(now);
  if (save.daily.day !== key) save.daily = freshDaily(now);
}

export function recordEvent(save: SaveData, kind: GameEventKind, text: string, now: number): GameEvent {
  const event: GameEvent = { id: uid('ev'), at: now, kind, text };
  save.events.push(event);
  if (save.events.length > LIMITS.events) save.events.splice(0, save.events.length - LIMITS.events);
  return event;
}

export function recordMemory(
  save: SaveData,
  memory: { kind: MemoryKind; text: string; tags: string[]; importance: 1 | 2 | 3 },
  now: number,
): Memory {
  const m: Memory = { id: uid('mem'), at: now, pinned: false, ...memory, tags: memory.tags.map((t) => t.toLowerCase()) };
  save.memories.push(m);
  trimMemories(save);
  return m;
}

/** Keep memories bounded: drop the least important, oldest unpinned ones first. */
export function trimMemories(save: SaveData): void {
  while (save.memories.length > LIMITS.memories) {
    let worst = -1;
    for (let i = 0; i < save.memories.length; i++) {
      const m = save.memories[i]!;
      if (m.pinned) continue;
      if (worst === -1) {
        worst = i;
        continue;
      }
      const w = save.memories[worst]!;
      if (m.importance < w.importance || (m.importance === w.importance && m.at < w.at)) worst = i;
    }
    if (worst === -1) break;
    save.memories.splice(worst, 1);
  }
}

export function nudgePersonality(save: SaveData, deltas: Partial<Personality>, now: number): Partial<Personality> {
  const c = save.creature;
  if (!c) return {};
  ensureDaily(save, now);
  const applied: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) {
    const want = deltas[key];
    if (!want) continue;
    const used = save.daily.personalityDelta[key];
    const room = want > 0 ? PERSONALITY_DAILY_CAP - used : -PERSONALITY_DAILY_CAP - used;
    const step = want > 0 ? Math.min(want, Math.max(0, room)) : Math.max(want, Math.min(0, room));
    const before = c.personality[key];
    const after = clamp(before + step, 0, 100);
    const actual = after - before;
    if (actual === 0) continue;
    c.personality[key] = after;
    save.daily.personalityDelta[key] = used + actual;
    applied[key] = actual;
  }
  return applied;
}

export function addAffinity(save: SaveData, key: 'woodland' | 'aquatic', amount: number): number {
  const c = save.creature;
  if (!c || amount <= 0) return 0;
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

export function recentCareCount(save: SaveData, action: CareAction, now: number, windowMs = 20 * 60 * 1000): number {
  return save.daily.careLog[action].filter((t) => now - t < windowMs && t <= now).length;
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
