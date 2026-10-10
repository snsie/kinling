// Personality Lab data: one session is a kinling, a conversation with it, every
// model call made along the way, and how its traits moved turn by turn.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import type { CompletionUsage } from '../ai/engine';
import type { Personality, SaveData } from '../game/types';

/** 'game' sends exactly what the game would; 'custom' uses the editable template. */
export type PromptMode = 'game' | 'custom';

export interface ChatConfig {
  promptMode: PromptMode;
  /** Custom mode only. */
  systemTemplate: string;
  /** Custom mode: earlier messages sent word for word. */
  historyMessages: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  /** 0 = the game's reply budget (80 or 150 tokens). */
  maxTokens: number;
  /** Apply the game's cleanReply/dropUnaskedOffer to the reply. */
  cleanReplies: boolean;
  /** Game mode: memory search with embeddings (loads a second, small model). */
  useEmbeddings: boolean;
}

export interface EvolveConfig {
  enabled: boolean;
  /** Ask for trait changes every N turns. */
  every: number;
  /** How many recent exchanges the evolve prompt sees. */
  window: number;
  systemTemplate: string;
  userTemplate: string;
  temperature: number;
  maxTokens: number;
  /** Largest change the model may propose per trait (JSON schema bound). */
  proposalRange: number;
  /** Largest change applied per trait per evolve call. */
  maxStep: number;
  /** Traits never move further than this from baseline. */
  driftLimit: number;
  /** How many recent reasons are offered back to the chat prompt as {{growthNotes}}. */
  feedbackNotes: number;
  /** Game mode: store each reason as a 'reflection' memory so the game's growth lines show it. */
  recordReflections: boolean;
}

export interface LabConfig {
  chat: ChatConfig;
  evolve: EvolveConfig;
}

export type CallKind = 'chat' | 'evolve' | 'rerun';

/** completionBody() without the messages: the sampling settings actually sent. */
export interface RequestBody {
  stream: true;
  max_tokens: number;
  temperature: number;
  top_p: number;
  response_format?: { type: 'json_object'; schema: string };
  frequency_penalty?: number;
  presence_penalty?: number;
  stream_options?: { include_usage: boolean };
  extra_body: { enable_thinking: boolean };
}

export interface CallRecord {
  id: string;
  turnId: string | null;
  kind: CallKind;
  /** For reruns: the call they were edited from. */
  sourceId?: string;
  at: number;
  modelId: string;
  variant: string;
  body: RequestBody;
  messages: ChatCompletionMessageParam[];
  output: string;
  /** What the lab made of the output (cleaned reply, parsed JSON). */
  parsed?: unknown;
  error?: string;
  ms?: number;
  usage?: CompletionUsage;
  done: boolean;
}

export interface TraitStep {
  id: string;
  turnId: string;
  turnIndex: number;
  at: number;
  callId: string;
  before: Personality;
  proposed: Partial<Personality>;
  applied: Partial<Personality>;
  after: Personality;
  reason: string;
  /** Set by hand with the sliders rather than proposed by the model. */
  manual?: boolean;
}

export interface LabTurn {
  id: string;
  index: number;
  at: number;
  playerText: string;
  reply: string;
  callIds: string[];
}

export interface LabSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source: 'game' | 'fresh';
  /** Working copy; never written back to the game. */
  save: SaveData;
  /** The save as the session started, for restarting with different settings. */
  seed: SaveData;
  kinlingId: string;
  turns: LabTurn[];
  calls: CallRecord[];
  traitSteps: TraitStep[];
  config: LabConfig;
}
