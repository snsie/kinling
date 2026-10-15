import type { ModelId } from '../game/types';

export interface ModelInfo {
  id: ModelId;
  label: string;
  /** Approximate one-time download (weights + small runtime files). */
  downloadMB: number;
  /** GPU memory WebLLM expects to need. */
  vramMB: number;
  description: string;
  /** Variant used when the GPU lacks 16-bit float shader support. */
  f32Fallback: string;
}

export const MODELS: Record<ModelId, ModelInfo> = {
  'Qwen3-1.7B-q4f16_1-MLC': {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3 1.7B (recommended)',
    downloadMB: 990,
    vramMB: 2040,
    description: 'Better conversation and more reliable evolution requests. About 1 GB to download.',
    f32Fallback: 'Qwen3-1.7B-q4f32_1-MLC',
  },
  'Qwen3-0.6B-q4f16_1-MLC': {
    id: 'Qwen3-0.6B-q4f16_1-MLC',
    label: 'Qwen3 0.6B (smaller)',
    downloadMB: 355,
    vramMB: 1400,
    description: 'Faster and lighter for older devices, but simpler replies. About 350 MB to download.',
    f32Fallback: 'Qwen3-0.6B-q4f32_1-MLC',
  },
  'Qwen3-4B-q4f16_1-MLC': {
    id: 'Qwen3-4B-q4f16_1-MLC',
    label: 'Qwen3 4B (best quality)',
    downloadMB: 2300,
    vramMB: 3440,
    description: 'Smartest conversation and memory, for stronger graphics cards. About 2.3 GB to download.',
    f32Fallback: 'Qwen3-4B-q4f32_1-MLC',
  },
};

/** A model's short name, as the kinling would hear it: "Qwen3 1.7B". */
export function modelName(id: ModelId): string {
  return MODELS[id].label.replace(/\s*\(.*\)\s*$/, '');
}

export function formatMB(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
