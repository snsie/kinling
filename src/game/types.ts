// Core domain types shared by game rules, persistence, rendering and AI.
// Everything the player owns or the creature is lives in SaveData; only code
// in src/game mutates it (the AI layer may only *propose* changes).

export const EGG_TYPES = ['woodland', 'aquatic', 'celestial'] as const;
export type EggType = (typeof EGG_TYPES)[number];

export const LIFE_STAGES = ['hatchling', 'sprout', 'grown'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export const NEED_KEYS = ['hunger', 'energy', 'cleanliness', 'happiness'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
/** 0–100 for every need; higher is always better (hunger 100 = full). */
export type Needs = Record<NeedKey, number>;

export const PERSONALITY_KEYS = ['curiosity', 'confidence', 'playfulness'] as const;
export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export type Personality = Record<PersonalityKey, number>;

export const AFFINITY_KEYS = ['woodland', 'aquatic'] as const;
export type AffinityKey = (typeof AFFINITY_KEYS)[number];
export type Affinities = Record<AffinityKey, number>;

export const COLOR_IDS = [
  'peach',
  'rose',
  'butter',
  'mint',
  'sky',
  'lilac',
  'cream',
  'cocoa',
  'moss',
  'lagoon',
  'starlight',
  'sunset',
] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const EAR_IDS = ['rounded', 'floppy', 'leaf', 'fluffy'] as const;
export type EarId = (typeof EAR_IDS)[number];
export const TAIL_IDS = ['short', 'curled', 'paddle'] as const;
export type TailId = (typeof TAIL_IDS)[number];
export const PATTERN_IDS = ['none', 'spots', 'stripes'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];
export const SHAPE_IDS = ['balanced', 'round', 'petite', 'tall'] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];

export interface Proportions {
  /** 0 = slim, 1 = very round */
  plump: number;
  /** 0 = small head, 1 = big head */
  head: number;
  /** 0 = short, 1 = tall */
  height: number;
}

export interface Appearance {
  bodyColor: ColorId;
  accentColor: ColorId;
  markingColor: ColorId;
  proportions: Proportions;
  pattern: PatternId;
  glow: boolean;
  ears: EarId;
  tail: TailId;
  horns: boolean;
  fins: boolean;
  wings: boolean;
}

export const MATERIAL_IDS = ['leaf', 'petal', 'pebble', 'shell', 'reed', 'dewdrop', 'stardust'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
export type MaterialCost = Partial<Record<MaterialId, number>>;

export const FOOD_IDS = ['seedBun', 'dewberry', 'clover', 'pondPlum', 'cress', 'starDrop'] as const;
export type FoodId = (typeof FOOD_IDS)[number];

export const KEEPSAKE_IDS = [
  'first-acorn',
  'ladybug-button',
  'four-leaf-clover',
  'moonpetal',
  'swirl-shell',
  'kingfisher-feather',
  'wishing-stone',
  'river-pearl',
  'starlit-feather',
] as const;
export type KeepsakeId = (typeof KEEPSAKE_IDS)[number];

export const LOCATION_IDS = ['garden', 'pond'] as const;
export type LocationId = (typeof LOCATION_IDS)[number];
export const ROUTE_IDS = ['garden-path', 'pond-shallows', 'pond-deep'] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

export const CARE_ACTIONS = ['feed', 'groom', 'rest', 'play'] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

export interface KeepsakeRecord {
  id: KeepsakeId;
  foundAt: number;
  location: LocationId | 'home';
}

export interface Inventory {
  materials: Record<MaterialId, number>;
  foods: Record<FoodId, number>;
  keepsakes: KeepsakeRecord[];
}

export interface Preferences {
  favoriteFood: FoodId;
  dislikedFood: FoodId;
  favoritePlace: LocationId;
  /** Discovered through play; shown in the UI and given to the AI only when true. */
  knownFavoriteFood: boolean;
  knownDislikedFood: boolean;
  knownFavoritePlace: boolean;
}

export interface Creature {
  id: string;
  name: string;
  egg: EggType;
  hatchedAt: number;
  appearance: Appearance;
  personality: Personality;
  needs: Needs;
  preferences: Preferences;
  affinities: Affinities;
  /** Grows through care and adventures; drives the life stage. Never decreases. */
  bond: number;
}

export const TRAIT_SLOTS = [
  'bodyColor',
  'proportions',
  'pattern',
  'glow',
  'ears',
  'tail',
  'horns',
  'fins',
  'wings',
] as const;
export type TraitSlot = (typeof TRAIT_SLOTS)[number];

export type TraitId =
  | `color.${ColorId}`
  | `shape.${ShapeId}`
  | `pattern.${PatternId}`
  | `ears.${EarId}`
  | `tail.${TailId}`
  | 'feature.glow'
  | 'feature.horns'
  | 'feature.fins'
  | 'feature.wings';

export const MEMORY_KINDS = ['milestone', 'adventure', 'keepsake', 'evolution', 'care', 'preference'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** A memory recorded by game code from a real game event (never from AI text). */
export interface Memory {
  id: string;
  at: number;
  kind: MemoryKind;
  text: string;
  tags: string[];
  importance: 1 | 2 | 3;
  pinned: boolean;
}

/** Something the player explicitly told the creature. Stored apart from memories. */
export interface PlayerFact {
  id: string;
  at: number;
  text: string;
}

export const EVENT_KINDS = [
  'hatched',
  'care',
  'adventure',
  'keepsake',
  'unlock',
  'evolved',
  'reverted',
  'returned',
  'stage',
  'diary',
] as const;
export type GameEventKind = (typeof EVENT_KINDS)[number];

export interface GameEvent {
  id: string;
  at: number;
  kind: GameEventKind;
  /** Authored, code-generated description of what happened. */
  text: string;
}

export const CHAT_ROLES = ['player', 'creature'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export interface ChatMessage {
  id: string;
  at: number;
  role: ChatRole;
  text: string;
  source: 'player' | 'ai' | 'authored';
}

export interface DiaryEntry {
  id: string;
  at: number;
  text: string;
  source: 'ai' | 'authored';
  /** The recorded events this entry was written from. */
  eventIds: string[];
}

export const MODEL_IDS = ['Qwen3-1.7B-q4f16_1-MLC', 'Qwen3-0.6B-q4f16_1-MLC'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const MOTION_PREFS = ['system', 'reduce', 'full'] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

export interface Settings {
  ai: {
    /** Player has chosen to use the on-device model. */
    enabled: boolean;
    modelId: ModelId;
    /** Player has read the download explanation and agreed to download. */
    downloadConsent: boolean;
  };
  sound: boolean;
  volume: number;
  reducedMotion: MotionPref;
  /** Slower obstacles and a longer timer in the minigame. */
  relaxedMinigame: boolean;
}

export interface Stats {
  feeds: number;
  grooms: number;
  rests: number;
  plays: number;
  adventures: number;
  gardenTrips: number;
  pondTrips: number;
  deepTrips: number;
  evolutions: number;
  chats: number;
  diaryEntries: number;
  bestScore: Record<RouteId, number>;
}

export interface DailyCounters {
  /** Local date key YYYY-MM-DD. */
  day: string;
  /** Personality change already applied today (bounded per day). */
  personalityDelta: Personality;
  /** Recent care actions for diminishing returns: action -> timestamps (ms). */
  careLog: Record<CareAction, number[]>;
  chatBond: number;
}

export const ONBOARDING_STEPS = [
  'welcome',
  'egg',
  'customize',
  'hatch',
  'name',
  'firstCare',
  'garden',
  'done',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  step: OnboardingStep;
  egg: EggType | null;
  draftAppearance: Appearance | null;
}

export interface Unlocks {
  /** Traits available to adopt. Once unlocked, a trait stays unlocked. */
  traits: TraitId[];
  /** Traits whose adoption cost has been paid (re-adopting them is free). */
  owned: TraitId[];
}

export const SAVE_SCHEMA_VERSION = 2;

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  saveId: string;
  /** Monotonic write counter used to detect conflicting writes. */
  revision: number;
  createdAt: number;
  updatedAt: number;
  /** Last time game time advanced (needs decay is computed from this). */
  lastTickAt: number;
  onboarding: OnboardingState;
  creature: Creature | null;
  player: { name: string | null; facts: PlayerFact[] };
  inventory: Inventory;
  unlocks: Unlocks;
  appearanceHistory: Appearance[];
  memories: Memory[];
  chat: ChatMessage[];
  diary: DiaryEntry[];
  events: GameEvent[];
  /** Id of the newest event already covered by a diary entry. */
  diaryCursor: number;
  stats: Stats;
  daily: DailyCounters;
  /** Adventure run ids whose rewards were already granted (bounded). */
  claimedRuns: string[];
  settings: Settings;
}
