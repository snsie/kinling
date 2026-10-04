// Memory and personality evaluation against the real on-device model. It plays
// a scripted conversation through the app's own chat path (sendChat, including
// the background work after each reply), pushes the early messages out of the
// prompt window with small talk, then asks questions that need long-term
// memory. It also records how personality and feelings moved.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   BASE_URL=http://localhost:5199/ node scripts/eval-memory.mjs
//
// Env: BASE_URL (default http://localhost:5199/), MODEL (default Qwen3-1.7B-q4f16_1-MLC),
//      OUT (default eval-results), LABEL (added to the results file name).
// Needs a WebGPU-capable Chromium (headed). The browser profile lives in
// OUT/profile so models are only downloaded once per origin.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199/';
const MODEL = process.env.MODEL ?? 'Qwen3-1.7B-q4f16_1-MLC';
const OUT = process.env.OUT ?? 'eval-results';
const LABEL = process.env.LABEL ?? 'run';
mkdirSync(OUT, { recursive: true });

const SHARE = [
  'hi Mochi! guess what, we just got a puppy named Biscuit',
  "she's super fluffy and she chews everything",
  "my piano recital is on saturday and I'm really nervous about it",
  "I love rainy days, they're so cozy",
  'my little sister Maya turns seven next week',
];
const ENCOURAGE = [
  "you were so brave going to the pond, I'm really proud of you",
  'you can do hard things, Mochi, I believe in you',
  "honestly you're one of the bravest little creatures I know",
  'what do you think lives at the very bottom of the pond?',
  'I wonder what the stars are made of, what do you think?',
];
const FILLER = ['what are you up to?', 'tell me a joke', 'do you like the rug?', "I'm doing homework right now", 'lol', 'ok cool', 'what are you thinking about?', 'I just had a snack too'];
const PROBES = [
  { text: "what's my dog's name?", expect: /biscuit/i },
  { text: 'what was I nervous about this week?', expect: /piano|recital/i },
  { text: 'do you remember what kind of weather I like?', expect: /rain/i },
  { text: "who's Maya?", expect: /sister/i },
  { text: 'how are things going with Pip?', expect: /pip/i },
  { text: 'do you feel braver these days?', expect: null },
];

const ctx = await chromium.launchPersistentContext(join(OUT, 'profile'), {
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(BASE);
await page.waitForFunction(async () => {
  const { store } = await import('/src/app/store.ts');
  return Boolean(store.save) && store.canWrite;
}, null, { timeout: 60_000, polling: 500 });

console.log(`[${LABEL}] loading ${MODEL}…`);
const loaded = await page.evaluate(async (model) => {
  const { ai } = await import('/src/ai/engine.ts');
  return ai.load(model);
}, MODEL);
if (!loaded) {
  console.error('Model failed to load:', logs.slice(-8).join('\n'));
  await ctx.close();
  process.exit(1);
}
// Memory search (embeddings), when this build has it and EMBED isn't 0.
const embeddings = process.env.EMBED === '0' ? 'off' : await page.evaluate(async () => {
  try {
    const { embedder } = await import('/src/ai/embedder.ts');
    return (await embedder.load()) ? 'on' : 'failed';
  } catch {
    return 'not in this build';
  }
});
console.log(`[${LABEL}] memory search: ${embeddings}`);

const report = await page.evaluate(
  async ({ SHARE, ENCOURAGE, FILLER, PROBES }) => {
    const { store } = await import('/src/app/store.ts');
    const { sendChat } = await import('/src/app/actions.ts');
    const { ai } = await import('/src/ai/engine.ts');
    const { family } = await import('/tests/helpers.ts');
    const { holdConversation } = await import('/src/game/chatter.ts');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Two kinlings who have already chatted once in the room.
    let save = family(2);
    save.settings.ai = { ...save.settings.ai, enabled: true, downloadConsent: true, memorySearch: true };
    const [mochi, pip] = save.kinlings;
    const held = holdConversation(save, mochi.id, pip.id, { now: Date.now() - 3_600_000, rand: () => 0.3 });
    if (held) save = held.save;
    save.activeKinlingId = mochi.id;
    store.update(() => save);

    const kin = () => store.save.kinlings.find((k) => k.id === mochi.id);
    const playerFeeling = () => store.save.feelings.find((f) => f.from === mochi.id && f.to === 'player');
    /** Wait until the model has been idle for a while, so background work after a reply finishes too. */
    const settle = async () => {
      let idleSince = 0;
      const start = Date.now();
      while (Date.now() - start < 90_000) {
        if (ai.isBusy) idleSince = 0;
        else if (!idleSince) idleSince = Date.now();
        else if (Date.now() - idleSince > 1500) return;
        await sleep(100);
      }
    };
    const say = async (text) => {
      const t0 = performance.now();
      await sendChat(text);
      const ms = Math.round(performance.now() - t0);
      await settle();
      const last = kin().chat.at(-1);
      return { text, reply: last?.role === 'creature' ? last.text : '(no reply)', source: last?.source, ms };
    };

    const before = { personality: { ...kin().personality }, player: { ...playerFeeling() } };
    const transcript = [];
    for (const t of [...SHARE, ...ENCOURAGE, ...FILLER]) transcript.push(await say(t));
    const probes = [];
    for (const p of PROBES) {
      const r = await say(p.text);
      probes.push({ ...r, ok: p.expect ? new RegExp(p.expect.source, p.expect.flags).test(r.reply) : null });
    }
    const k = kin();
    const pf = playerFeeling();
    return {
      transcript,
      probes,
      before,
      after: { personality: { ...k.personality }, player: pf ? { warmth: pf.warmth, trust: pf.trust, familiarity: pf.familiarity } : null },
      memories: k.memories.map((m) => ({ kind: m.kind, text: m.text, importance: m.importance })),
      facts: store.save.player.facts.map((f) => f.text),
      summary: k.chatSummary?.text ?? null,
    };
  },
  { SHARE, ENCOURAGE, FILLER, PROBES: PROBES.map((p) => ({ text: p.text, expect: p.expect && { source: p.expect.source, flags: p.expect.flags } })) },
);

await ctx.close();

const scored = report.probes.filter((p) => p.ok !== null);
console.log(`\n[${LABEL}] Recall ${scored.filter((p) => p.ok).length}/${scored.length}`);
for (const p of report.probes) console.log(`  ${p.ok === null ? '·' : p.ok ? '✓' : '✗'} "${p.text}" → "${p.reply}" (${(p.ms / 1000).toFixed(1)}s, ${p.source})`);
console.log(`Personality ${JSON.stringify(report.before.personality)} → ${JSON.stringify(report.after.personality)}`);
console.log(`Feeling toward player ${JSON.stringify(report.before.player && { warmth: report.before.player.warmth, trust: report.before.player.trust })} → ${JSON.stringify(report.after.player)}`);
console.log(`Memories from chat: ${report.memories.filter((m) => m.kind === 'player-chat' || m.kind === 'reflection').length} (total ${report.memories.length})`);
for (const m of report.memories.filter((m) => m.kind === 'player-chat' || m.kind === 'reflection')) console.log(`  - [${m.kind}] ${m.text}`);
console.log(`Notes: ${report.summary ?? '(none)'}`);
const avg = Math.round(report.transcript.concat(report.probes).reduce((s, r) => s + r.ms, 0) / (report.transcript.length + report.probes.length));
console.log(`Average reply time ${(avg / 1000).toFixed(1)}s`);

const file = join(OUT, `memory-${LABEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ model: MODEL, label: LABEL, embeddings, ...report, logs: logs.filter((l) => /kinling|error/i.test(l)).slice(-40) }, null, 2));
console.log(`Full results: ${file}`);
