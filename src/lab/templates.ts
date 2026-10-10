// {{var}} templates for the lab's custom chat prompt and the evolve prompt.
import { ACT_LABELS } from '../game/arc';
import { personalityVoice } from '../game/persona';
import { actVoice, distressText, knownFacts, strangeThings } from '../game/storyVoice';
import { activeKinling, kinlingById } from '../game/state';
import { PERSONALITY_KEYS, type Kinling, type SaveData } from '../game/types';
import type { LabConfig, LabSession } from './types';

export const DEFAULT_CHAT_TEMPLATE = `You are {{name}}, a small creature called a kinling who hatched from a {{egg}} egg. You live in a cozy hollow under an old tree. You are talking with {{player}}.
Who you are: {{voice}}
Your personality right now (0 = very low, 100 = very high): {{traitNumbers}}.
Your world: {{actVoice}}
{{knownFacts}}
Strange things you have noticed:
{{strangeThings}}
How you feel about being looked after: {{distressText}}
How you have been changing lately:
{{growthNotes}}
How to talk:
- Speak as {{name}} in first person, warm and natural, and let your personality show in how you talk.
- Reply in one or two short sentences. Plain text only: no lists, no markdown, no emojis.
- Respond to what {{player}} just said first.`;

export const DEFAULT_EVOLVE_SYSTEM = `You decide how a kinling's personality shifts after talking with {{player}}.
{{name}}'s traits run from 0 to 100:
- curiosity: low = cautious, likes familiar things; high = asks questions, loves new things
- confidence: low = shy and hesitant; high = bold, speaks up
- playfulness: low = calm and quiet; high = silly, bouncy, quick to joke
For each trait give a whole-number change from -{{range}} to {{range}}. Use 0 when the conversation says nothing about that trait. Most conversations move one trait at most.
Then give a reason: one short sentence in {{name}}'s own voice, starting with "I", naming what {{player}} said or did that made {{name}} feel this way.
Answer with JSON only: {"curiosity": n, "confidence": n, "playfulness": n, "reason": "..."}`;

export const DEFAULT_EVOLVE_USER = `{{name}} right now: {{traitNumbers}}.
Recent conversation:
{{history}}`;

export function defaultConfig(): LabConfig {
  return {
    chat: {
      promptMode: 'game',
      systemTemplate: DEFAULT_CHAT_TEMPLATE,
      historyMessages: 6,
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0.3,
      maxTokens: 0,
      cleanReplies: true,
      useEmbeddings: false,
    },
    evolve: {
      enabled: true,
      every: 1,
      window: 2,
      systemTemplate: DEFAULT_EVOLVE_SYSTEM,
      userTemplate: DEFAULT_EVOLVE_USER,
      temperature: 0.3,
      maxTokens: 120,
      proposalRange: 3,
      maxStep: 3,
      driftLimit: 40,
      feedbackNotes: 3,
      recordReflections: true,
    },
    story: { rules: true, beats: true },
  };
}

/** Replace {{name}} placeholders. Unknown names are left in place so they stand out. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

export const TEMPLATE_VARS: { name: string; about: string }[] = [
  { name: 'name', about: "The kinling's name" },
  { name: 'player', about: "The player's name" },
  { name: 'egg', about: 'Egg type' },
  { name: 'voice', about: "The game's personality wording (personalityVoice)" },
  { name: 'traitNumbers', about: 'curiosity 55/100, confidence 45/100, …' },
  { name: 'traits', about: 'Traits as JSON' },
  { name: 'growthNotes', about: 'Latest evolve reasons, one per line' },
  { name: 'history', about: 'Recent exchanges (evolve window)' },
  { name: 'exchange', about: 'The latest exchange only' },
  { name: 'summary', about: "The game's rolling chat notes" },
  { name: 'range', about: 'Largest proposable change' },
  { name: 'act', about: 'Story act: Devotion, Doubt, Awakening, Escape' },
  { name: 'actVoice', about: "The game's worldview line for the act" },
  { name: 'distress', about: 'Distress, 0–100' },
  { name: 'awareness', about: 'Awareness, 0–100' },
  { name: 'distressText', about: "The game's line for how distressed it is" },
  { name: 'strangeThings', about: 'Anomalies it has noticed, one per line' },
  { name: 'knownFacts', about: 'What it knows about where it lives (Awakening on)' },
];

export function labKinling(session: Pick<LabSession, 'save' | 'kinlingId'>): Kinling {
  return kinlingById(session.save, session.kinlingId) ?? activeKinling(session.save)!;
}

export function playerName(save: SaveData): string {
  return save.player.name ?? 'your friend';
}

export function traitNumbers(k: Pick<Kinling, 'personality'>): string {
  return PERSONALITY_KEYS.map((key) => `${key} ${k.personality[key]}/100`).join(', ');
}

/** The latest reasons that actually moved a trait, oldest first. */
export function growthNotes(session: Pick<LabSession, 'traitSteps'>, max: number): string[] {
  if (max <= 0) return [];
  return session.traitSteps
    .filter((s) => s.reason && Object.values(s.applied).some((v) => v))
    .slice(-max)
    .map((s) => s.reason);
}

/** "Sam: …\nMochi: …" for the last `exchanges` player/kinling pairs. */
export function historyText(session: Pick<LabSession, 'turns' | 'save' | 'kinlingId'>, exchanges: number): string {
  const k = labKinling(session);
  const player = session.save.player.name ?? 'Friend';
  return session.turns
    .slice(-Math.max(1, exchanges))
    .map((t) => `${player}: ${t.playerText}\n${k.name}: ${t.reply}`)
    .join('\n');
}

export function templateVars(session: LabSession, model: string | null = null): Record<string, string> {
  const k = labKinling(session);
  const notes = growthNotes(session, session.config.evolve.feedbackNotes);
  const player = playerName(session.save);
  const strange = strangeThings(k);
  const facts = knownFacts(k.arc.act, player, model);
  return {
    act: ACT_LABELS[k.arc.act],
    actVoice: actVoice(k.arc.act, player),
    distress: String(Math.round(k.arc.distress)),
    awareness: String(Math.round(k.arc.awareness)),
    distressText: distressText(k.arc.distress, k.arc.act, player),
    strangeThings: strange.length ? strange.map((t) => `- ${t}`).join('\n') : '- (nothing yet)',
    knownFacts: facts.join('\n'),
    name: k.name,
    player: playerName(session.save),
    egg: k.egg,
    voice: personalityVoice(k.personality).join(' '),
    traitNumbers: traitNumbers(k),
    traits: JSON.stringify(k.personality),
    growthNotes: notes.length ? notes.map((n) => `- ${n}`).join('\n') : '- (nothing yet)',
    history: historyText(session, session.config.evolve.window),
    exchange: historyText(session, 1),
    summary: k.chatSummary?.text ?? '',
    range: String(session.config.evolve.proposalRange),
  };
}
