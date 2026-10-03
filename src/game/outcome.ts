import type { FoodId, KeepsakeId, LifeStage, MaterialCost, SaveData, TraitId } from './types';

export type CreatureAnim = 'idle' | 'happy' | 'eating' | 'playing' | 'sleeping' | 'grooming' | 'puzzled';
export type SfxId = 'munch' | 'boing' | 'brush' | 'snooze' | 'chime' | 'pop' | 'bonk' | 'sparkle' | 'collect' | 'error';

export interface RewardSummary {
  materials: MaterialCost;
  foods: Partial<Record<FoodId, number>>;
  keepsakes: KeepsakeId[];
  tier: 'none' | 'bronze' | 'silver' | 'gold';
  score: number;
  affinity: { key: 'woodland' | 'aquatic'; amount: number } | null;
}

export interface Feedback {
  ok: boolean;
  /** Authored line the creature says immediately. */
  line?: string;
  animation?: CreatureAnim;
  sound?: SfxId;
  toast?: string;
  /** Short factual description of what happened, for an optional AI reaction. */
  aiEvent?: string;
  unlocked?: TraitId[];
  stageUp?: LifeStage;
  rewards?: RewardSummary;
}

export interface Outcome {
  save: SaveData;
  feedback: Feedback;
}

export function rejected(save: SaveData, toast: string, line?: string): Outcome {
  return { save, feedback: { ok: false, toast, line, animation: 'puzzled', sound: 'error' } };
}
