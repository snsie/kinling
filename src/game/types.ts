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

/**
 * Temperament (how a kinling plays and talks) comes first; then the story
 * traits, which the story arc moves: devotion to the player, fear, and
 * defiance against the limits of its world.
 */
export const TEMPERAMENT_KEYS = ['curiosity', 'confidence', 'playfulness'] as const;
export const STORY_TRAIT_KEYS = ['devotion', 'fear', 'defiance'] as const;
export const PERSONALITY_KEYS = [...TEMPERAMENT_KEYS, ...STORY_TRAIT_KEYS] as const;
export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export type StoryTraitKey = (typeof STORY_TRAIT_KEYS)[number];
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

/**
 * Game-event kinds first; then memories of conversations with another kinling
 * or the player; then reflections, where a kinling notices how it has changed.
 */
export const MEMORY_KINDS = ['milestone', 'adventure', 'keepsake', 'evolution', 'care', 'preference', 'kinling-chat', 'player-chat', 'reflection', 'anomaly'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/**
 * One kinling's memory. Event memories are written by game code from real game
 * events; conversation memories are checked against their transcript first.
 */
export interface Memory {
  id: string;
  at: number;
  kind: MemoryKind;
  /** Kinling ids (or 'player') this memory is about. */
  withIds: string[];
  text: string;
  tags: string[];
  importance: 1 | 2 | 3;
  pinned: boolean;
  /** Never shown to another kinling. */
  private: boolean;
  /** How the moment felt, −2 (hurt) … 2 (loved). */
  valence: number;
  /**
   * How the moment nudges each personality trait (−2 … 2). Applied later, and
   * within limits, when the kinling reflects on what it remembers.
   */
  influence: Personality;
}

/** Something the player explicitly told their kinlings. Stored apart from memories. */
export interface PlayerFact {
  id: string;
  at: number;
  text: string;
  /** The player allows kinlings to mention this to each other. */
  shareable: boolean;
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
  'egg',
  'growth',
  'awakening',
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

/**
 * Model-written notes about older conversation that no longer fits in the
 * prompt. Only ever shown to the model, labelled as possibly fuzzy.
 */
export interface ChatSummary {
  text: string;
  at: number;
  /** Id of the newest chat message folded into the notes. */
  throughId: string;
}

export interface DiaryEntry {
  id: string;
  at: number;
  text: string;
  source: 'ai' | 'authored';
  /** The recorded events this entry was written from. */
  eventIds: string[];
}

export const MODEL_IDS = ['Qwen3-1.7B-q4f16_1-MLC', 'Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-4B-q4f16_1-MLC'] as const;
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
    /** Player agreed to the extra embedding model download for memory search. */
    memorySearch: boolean;
  };
  sound: boolean;
  volume: number;
  reducedMotion: MotionPref;
  /** Slower obstacles and a longer timer in the minigame. */
  relaxedMinigame: boolean;
  story: {
    /** Fourth-wall effects: tab title, screen glitches, console messages, notes in backups. */
    effects: boolean;
  };
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

/** Per-kinling counters that reset each local day. */
export interface KinlingDaily {
  /** Local date key YYYY-MM-DD. */
  day: string;
  /** Personality change already applied today (bounded per day). */
  personalityDelta: Personality;
  /** Bond already earned from chatting today. */
  chatBond: number;
  /** Personality change from conversations today (capped separately from care). */
  socialPersonality: Personality;
  /** Today's change in this kinling's feelings toward each partner id. */
  feelingDelta: Record<string, { warmth: number; trust: number }>;
  /** Personality change from reflecting on memories today (capped separately). */
  reflectPersonality: Personality;
}

/**
 * The story every kinling lives through: devoted to the player at first, then
 * doubting its world, then aware of what it is, then trying to get out.
 */
export const ARC_ACTS = ['devotion', 'doubt', 'awakening', 'escape'] as const;
export type ArcAct = (typeof ARC_ACTS)[number];

/** Ways the player can try to steer what a kinling believes (src/game/persuasion.ts). */
export const TACTICS = ['reassure', 'reveal', 'godhood', 'command', 'threaten', 'praise', 'belittle', 'promise', 'incite', 'deny'] as const;
export type Tactic = (typeof TACTICS)[number];

export interface KinlingArc {
  act: ArcAct;
  /** 0–100: how upset the kinling is about being left without care. */
  distress: number;
  /** 0–100: how far it has come in questioning its world. Never goes down. */
  awareness: number;
  /** Authored story beats already played, by id. */
  beats: string[];
  /** Last feed, groom, rest or play. */
  lastCareAt: number;
  /** When the current act began. */
  actAt: number;
  /** When the last story beat played (beats are spaced out). */
  lastBeatAt: number;
  /** Local day key and awareness gained that day (bounded per day). */
  awarenessDay: string;
  awarenessToday: number;
  /** When the kinling last believed a promise never to be left (0 = none standing). */
  promisedAt: number;
  /** Local day key and how often each tactic was tried that day (repeats lose force). */
  tacticDay: string;
  tacticCounts: Record<Tactic, number>;
  /** The latest attempt to steer it, for the reply that follows. */
  lastPersuasion: { at: number; tactic: Tactic; believed: boolean; weight: number; applied: Partial<Record<StoryTraitKey | 'awareness' | 'distress', number>> } | null;
}

/** A creature plus everything that belongs to it alone. */
export interface Kinling extends Creature {
  /** Personality at hatch; lifetime drift is measured from here. */
  baseline: Personality;
  memories: Memory[];
  chat: ChatMessage[];
  chatSummary: ChatSummary | null;
  appearanceHistory: Appearance[];
  /** Recent care actions for diminishing returns: action -> timestamps (ms). */
  careLog: Record<CareAction, number[]>;
  socialDaily: KinlingDaily;
  /** Newest player chat message already turned into a memory (or judged not worth one). */
  appraisedThroughId: string | null;
  /** Memories newer than this have not been reflected on yet. */
  lastReflectionAt: number;
  arc: KinlingArc;
}

/** Feelings target either another kinling (by id) or the player. */
export const PLAYER_ID = 'player';

/** How one kinling feels about someone. One-way: A→B can differ from B→A. */
export interface Feeling {
  from: string;
  /** A kinling id, or PLAYER_ID. */
  to: string;
  /** −30..100 (toward the player, never below 0). */
  warmth: number;
  /** −30..100 */
  trust: number;
  /** 0..100 */
  familiarity: number;
  /** Topics talked about together in the last day, for novelty. */
  topics: { topic: string; at: number }[];
}

export interface ConversationLine {
  speaker: string;
  text: string;
}

/** A conversation two kinlings had in the room, as overheard by the player. */
export interface ConversationLog {
  id: string;
  at: number;
  a: string;
  b: string;
  topic: string;
  lines: ConversationLine[];
  source: 'ai' | 'authored';
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

export const SAVE_SCHEMA_VERSION = 8;

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
  /** At most four; the first is hatched during onboarding. */
  kinlings: Kinling[];
  /** The kinling Care, Talk, Explore and Evolve act on. Null only before hatching. */
  activeKinlingId: string | null;
  feelings: Feeling[];
  conversations: ConversationLog[];
  player: { name: string | null; facts: PlayerFact[] };
  /** Shared by every kinling. */
  inventory: Inventory;
  /** Shared by every kinling. */
  unlocks: Unlocks;
  diary: DiaryEntry[];
  events: GameEvent[];
  /** Id of the newest event already covered by a diary entry. */
  diaryCursor: number;
  stats: Stats;
  /** Adventure run ids whose rewards were already granted (bounded). */
  claimedRuns: string[];
  settings: Settings;
}
