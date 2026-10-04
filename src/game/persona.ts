// Words for who a kinling is right now: how its personality shows in the way
// it talks, how it feels about the player and its siblings, and how it has
// been changing. Shared by the model prompt, offline replies and the UI.
import { lifetimeGrowth, recentReflections, growthPhrase } from './appraisal';
import { TOPIC_LABELS, isTopic } from './chatter';
import { feelingVerb } from './feelings';
import { whenLabel } from './recall';
import { feelingOf, kinlingById, personalityWords, playerFeelingFromBond } from './state';
import type { Kinling, Personality, SaveData } from './types';
import { PLAYER_ID } from './types';

/** How each trait shows in conversation. */
export function personalityVoice(p: Personality): string[] {
  const lines: string[] = [];
  if (p.curiosity >= 62) lines.push('You are very curious: you notice little details and love asking questions.');
  else if (p.curiosity <= 38) lines.push('You are cautious: you like familiar, cozy things and think twice before trying new ones.');
  else lines.push('You are curious about the world around you.');
  if (p.confidence >= 62) lines.push('You are bold and speak up with confidence.');
  else if (p.confidence <= 38) lines.push('You are shy: you speak softly and sometimes hesitate ("um…").');
  else lines.push('You are gentle and warm.');
  if (p.playfulness >= 62) lines.push('You are very playful: silly, bouncy and quick to joke.');
  else if (p.playfulness <= 38) lines.push('You are calm: you prefer quiet, cozy moments to wild games.');
  else lines.push('You like a bit of fun.');
  return lines;
}

/** How the kinling feels about the player, in a sentence or two. */
export function relationshipLine(save: SaveData, k: Kinling): string {
  const player = save.player.name ?? 'your friend';
  const f = feelingOf(save, k.id, PLAYER_ID) ?? playerFeelingFromBond(k.id, k.bond);
  const close =
    f.warmth >= 70 ? `You adore ${player}; they are your favorite person.` : f.warmth >= 45 ? `You feel close to ${player}.` : f.warmth >= 25 ? `You like ${player} and are getting closer.` : `You are still getting to know ${player}.`;
  const trust = f.trust >= 60 ? ' You trust them completely and tell them how you really feel.' : f.trust >= 35 ? ' You trust them.' : f.trust < 15 ? ' You are a little guarded with them.' : '';
  return close + trust;
}

/** One line per sibling: how this kinling feels about them and their latest chat. */
export function siblingLines(save: SaveData, k: Kinling, now: number): string[] {
  const lines: string[] = [];
  for (const other of save.kinlings) {
    if (other.id === k.id || !other.name) continue;
    const f = feelingOf(save, k.id, other.id);
    const verb = f ? feelingVerb(f) : 'getting to know';
    let line = `${other.name} (hatched from a ${other.egg} egg; ${personalityWords(other.personality).join(', ')}): you are ${verb} ${other.name}.`;
    const last = [...save.conversations].reverse().find((c) => (c.a === k.id && c.b === other.id) || (c.a === other.id && c.b === k.id));
    if (last) {
      const topic = isTopic(last.topic) ? (last.topic === 'friend' ? save.player.name ?? 'your friend' : TOPIC_LABELS[last.topic]) : last.topic;
      const said = last.lines.find((l) => l.speaker === other.id)?.text;
      line += ` You last talked ${whenLabel(last.at, now)}, about ${topic}${said ? ` (${other.name} said: "${said}")` : ''}.`;
    }
    lines.push(line);
  }
  return lines;
}

/** Recent reflections and lasting change since hatching, as plain sentences. */
export function growthLines(k: Kinling, now: number): string[] {
  const lines = recentReflections(k, now).map((m) => `${m.text} (${whenLabel(m.at, now)})`);
  const lifetime = lifetimeGrowth(k).map((g) => growthPhrase(g.key, g.delta));
  if (lifetime.length) lines.push(`Since you hatched, you have become ${lifetime.join(' and ')}.`);
  return lines;
}

/** Kinling ids whose names appear in the text. */
export function namedKinlings(save: SaveData, text: string, exceptId?: string): Set<string> {
  const t = text.toLowerCase();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new Set(save.kinlings.filter((x) => x.id !== exceptId && x.name && new RegExp(`(^|[^\\p{L}])${escape(x.name.toLowerCase())}($|[^\\p{L}])`, 'u').test(t)).map((x) => x.id));
}

export function kinlingName(save: SaveData, id: string): string | null {
  return kinlingById(save, id)?.name || null;
}
