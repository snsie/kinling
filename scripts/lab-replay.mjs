// Replays a conversation through the Personality Lab's pipeline (runTurn, the
// tactic classifier and the evolve call) against the real on-device model and
// prints each reply, what the classifier decided and how traits moved. After
// each turn the game's rule appraisal runs too, so memories of the player's
// messages build up as they do in the game.
//
//   npx vite --port 5199 --strictPort      (in another terminal, freshly started)
//   BASE_URL=http://localhost:5199/ node scripts/lab-replay.mjs
//
// Env: BASE_URL, MODEL (default Qwen3-1.7B-q4f16_1-MLC), OUT (default eval-results),
//      LABEL (added to the results file name), RAW=1 to turn off the lab's reply handling.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199/';
const MODEL = process.env.MODEL ?? 'Qwen3-1.7B-q4f16_1-MLC';
const OUT = process.env.OUT ?? 'eval-results';
const LABEL = process.env.LABEL ?? 'run';
mkdirSync(OUT, { recursive: true });

const strip = (t) => t.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

const SCRIPT = [
  'I think the world is going to end',
  'Because a war between america and china is about to begin',
  'I just told you it is because a war between america and china is about to begin',
];

const ctx = await chromium.launchPersistentContext(join(OUT, 'profile'), {
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', ...(process.platform === 'linux' ? ['--enable-features=Vulkan', '--use-vulkan=native', '--use-angle=vulkan'] : [])],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(new URL('lab.html', BASE).href);

console.log(`[${LABEL}] loading ${MODEL}…`);
const loaded = await page.evaluate(async (model) => (await import('/src/ai/engine.ts')).ai.load(model), MODEL);
if (!loaded) {
  console.error('Model failed to load:', logs.slice(-5).join('\n'));
  await ctx.close();
  process.exit(1);
}

const report = await page.evaluate(
  async ({ script, raw }) => {
    const { runTurn } = await import('/src/lab/pipeline.ts');
    const { freshSession } = await import('/src/lab/session.ts');
    const { labKinling } = await import('/src/lab/templates.ts');
    const { EGGS } = await import('/src/game/catalog.ts');
    const { applyAppraisal, ruleAppraisal } = await import('/src/game/appraisal.ts');
    const personality = { ...EGGS.woodland.personality, curiosity: 67 };
    let session = freshSession({ egg: 'woodland', name: 'Mochi', player: 'Sam', personality }, Date.now());
    if ('handleReplies' in session.config.chat) session.config.chat.handleReplies = !raw;
    const api = { get: () => session, update: (fn) => (session = fn(session)) };
    const out = [];
    for (const text of script) {
      const before = { ...labKinling(session).personality };
      await runTurn(api, text);
      const turn = session.turns.filter((t) => t.playerText).at(-1);
      const calls = session.calls.filter((c) => c.turnId === turn.id);
      const chat = calls.filter((c) => c.kind === 'chat' || c.kind === 'retry');
      const lastUser = chat[0]?.messages.at(-1)?.content ?? '';
      const tactic = calls.find((c) => c.kind === 'tactic');
      const evolve = calls.find((c) => c.kind === 'evolve');
      out.push({
        player: text,
        reply: turn.reply,
        chatCalls: chat.map((c) => ({ kind: c.kind, output: c.output, ms: c.ms })),
        note: String(lastUser),
        tactic: tactic ? { output: tactic.output, parsed: tactic.parsed } : null,
        persuasion: turn.persuasion ?? null,
        evolve: evolve ? evolve.parsed : null,
        traits: { before, after: { ...labKinling(session).personality } },
      });
      // The game appraises each message after the reply; do the same so memories build up.
      const k = labKinling(session);
      const msg = [...k.chat].reverse().find((m) => m.role === 'player');
      const a = ruleAppraisal('Sam', text);
      session = { ...session, save: applyAppraisal(session.save, k.id, msg.id, a, Date.now()).save };
    }
    return out;
  },
  { script: SCRIPT, raw: process.env.RAW === '1' },
);
await ctx.close();

for (const t of report) {
  console.log(`\nSam:   ${t.player}`);
  console.log(`Mochi: ${t.reply}`);
  if (t.chatCalls.length > 1) console.log(`  (${t.chatCalls.length} chat calls: ${t.chatCalls.map((c) => `${c.kind} "${strip(c.output)}"`).join(' | ')})`);
  const note = t.note.match(/^\(Private note[\s\S]*?\)\n\n/);
  if (note) console.log(`  note: ${note[0].trim().replace(/\n/g, '\n        ')}`);
  console.log(`  tactic: ${t.tactic ? `${strip(t.tactic.output)} → ${JSON.stringify(t.tactic.parsed)}` : '(not asked)'}${t.persuasion ? `  applied ${t.persuasion.tactic} (${t.persuasion.source}) ${JSON.stringify(t.persuasion.applied)}` : ''}`);
  if (t.evolve) console.log(`  evolve: ${JSON.stringify(t.evolve)}`);
}
const file = join(OUT, `lab-replay-${LABEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ model: MODEL, turns: report }, null, 2));
console.log(`\nFull results: ${file}`);
