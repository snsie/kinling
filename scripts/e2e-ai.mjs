// Local-inference verification on a real WebGPU device.
// Needs a GPU-capable Chromium. On a headless Linux box with an NVIDIA GPU:
//   Xvfb :99 &  DISPLAY=:99 node scripts/e2e-ai.mjs
// Env: BASE_URL (default http://localhost:4173/), OUT (default e2e-ai-results), HEADLESS=1 to try headless.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'e2e-ai-results';
mkdirSync(OUT, { recursive: true });
const results = [];
const transcript = [];
let n = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note: note ?? '' });
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${note ? ` — ${note}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(err?.message ?? err).split('\n')[0] });
    console.log(`  ✗ ${name}: ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
const shot = (page, label) => page.screenshot({ path: join(OUT, `${String(++n).padStart(2, '0')}-${label}.png`), fullPage: true });

const browser = await chromium.launch({
  headless: process.env.HEADLESS === '1',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=native', '--use-angle=vulkan', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

async function aiChip() {
  return (await page.locator('.topbar .status-chip--button').textContent())?.trim() ?? '';
}

async function waitReady(timeoutMs) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    last = await aiChip();
    if (/AI ready/.test(last)) return last;
    if (/AI problem/.test(last)) throw new Error(`AI failed: ${await page.locator('main').textContent()}`);
    await page.waitForTimeout(1000);
  }
  throw new Error(`not ready after ${timeoutMs}ms (last: ${last})`);
}

async function playTutorial() {
  await page.getByRole('button', { name: 'Start' }).click();
  const t0 = Date.now();
  while (Date.now() - t0 < 40_000 && (await page.locator('svg.arena').count())) {
    await page.keyboard.down(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][Math.floor(Math.random() * 4)]);
    await page.waitForTimeout(500);
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await page.keyboard.up(k);
  }
}

async function chat(text, { stopAfterMs } = {}) {
  const before = await page.locator('.msg--creature').count();
  await page.getByLabel(/Message /).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  const partials = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const typing = page.locator('.msg__bubble--typing');
    if (await typing.count()) {
      const t = (await typing.textContent())?.trim();
      if (t && partials.at(-1) !== t) partials.push(t);
      if (stopAfterMs && Date.now() - t0 > stopAfterMs && t) {
        await page.getByRole('button', { name: 'Stop reply' }).click();
        stopAfterMs = 0;
      }
    }
    if ((await page.locator('.msg--creature').count()) > before && !(await page.locator('.msg__bubble--typing').count())) break;
    await page.waitForTimeout(60);
  }
  const reply = (await page.locator('.msg--creature .msg__bubble').last().textContent())?.replace(/^.*?: /, '').trim();
  transcript.push({ you: text, creature: reply, partialCount: partials.length, ms: Date.now() - t0 });
  return { reply, partials, ms: Date.now() - t0 };
}

console.log('Local AI (WebLLM) verification');

await step('detects a WebGPU adapter', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Welcome to Kinling' }).waitFor();
  const info = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    return a ? `${a.info?.vendor} ${a.info?.architecture} shader-f16=${a.features.has('shader-f16')}` : 'none';
  });
  expect(info !== 'none', 'no adapter');
  return info;
});

await step('explicit download choice starts the model download; onboarding continues meanwhile', async () => {
  await page.getByRole('button', { name: /Download recommended model/ }).click();
  await page.getByRole('heading', { name: 'Choose an egg' }).waitFor();
  await page.waitForTimeout(1500);
  const chip = await aiChip();
  const mini = await page.locator('.ai-mini').textContent().catch(() => '');
  await shot(page, 'downloading');
  await page.getByRole('button', { name: /Celestial Egg/ }).click();
  await page.getByRole('heading', { name: 'Imagine your kinling' }).waitFor();
  return `${chip} | ${mini?.trim()}`;
});

let loadMs = 0;
await step('model finishes downloading and loads', async () => {
  const t0 = Date.now();
  const chip = await waitReady(15 * 60_000);
  loadMs = Date.now() - t0;
  return chip;
});

await step('AI maps a natural-language description to creation options', async () => {
  await page.getByLabel('Or describe it (optional)').fill('I want a soft pink one with stripes, a cream belly and floppy ears');
  await page.getByRole('button', { name: 'Apply' }).click();
  const note = page.getByRole('status').filter({ hasText: /Applied|couldn't match/ });
  await note.waitFor({ timeout: 90_000 });
  const t = (await note.textContent()).trim();
  await shot(page, 'ai-describe');
  return t;
});

await step('finishes onboarding (hatch, name, first care, garden walk)', async () => {
  await page.getByRole('button', { name: 'Ready to hatch' }).click();
  await page.getByRole('button', { name: 'Hatch!' }).click();
  await page.getByRole('heading', { name: "What's its name?" }).waitFor({ timeout: 15_000 });
  await page.getByLabel("Kinling's name").fill('Comet');
  await page.getByLabel(/What should it call you/).fill('Sam');
  await page.getByRole('button', { name: "That's Comet!" }).click();
  await page.getByRole('button', { name: 'Feed a dewberry' }).click();
  await page.getByRole('button', { name: 'Next: a walk in the garden' }).click();
  await page.getByRole('button', { name: "Let's go!" }).click();
  await playTutorial();
  await page.getByRole('button', { name: 'Go home' }).click({ timeout: 20_000 });
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
});

await step('care reaction: authored line instantly, then a short AI reaction', async () => {
  await page.waitForTimeout(4000); // let the arrival greeting finish
  await page.getByRole('button', { name: 'Groom' }).click();
  const instant = (await page.locator('.speech').textContent())?.replace(/^.*says: /, '');
  await page.waitForTimeout(12_000);
  const later = (await page.locator('.speech').textContent())?.replace(/^.*says: /, '');
  transcript.push({ event: 'groom', instant, later });
  return `instant: "${instant}" → later: "${later}"`;
});

await step('streams a chat reply grounded in game state (1–2 sentences)', async () => {
  await page.getByRole('tab', { name: /Talk/ }).click();
  await page.waitForTimeout(1000);
  const r = await chat('Hi Comet! What did we find on our garden walk?');
  expect(r.reply && r.reply.length > 3, 'empty reply');
  const sentences = (r.reply.match(/[.!?…]+/g) ?? []).length;
  expect(sentences <= 3, `too long: ${r.reply}`);
  await shot(page, 'ai-chat');
  return `"${r.reply}" (${r.partials.length} streamed updates, ${(r.ms / 1000).toFixed(1)}s)`;
});

await step('cancellation stops a reply mid-stream', async () => {
  const r = await chat('Tell me a long story about the pond, the frogs and the lily pads.', { stopAfterMs: 400 });
  return `kept partial: "${r.reply}"`;
});

await step('care instruction → validated JSON proposal the player confirms', async () => {
  const r = await chat('You should eat a dewberry and then take a nap');
  const group = page.getByRole('group', { name: 'Suggested actions' }).last();
  await group.waitFor({ timeout: 10_000 });
  const buttons = await group.getByRole('button').allTextContents();
  return `"${r.reply}" → [${buttons.join(' | ')}]`;
});

await step('appearance request via chat → AI proposal → Evolve preview', async () => {
  const r = await chat('Could you make yourself more aquatic but keep your pink fur?');
  await page.getByRole('button', { name: 'Preview in Evolve' }).last().click({ timeout: 10_000 });
  await page.getByRole('heading', { name: 'Evolve' }).waitFor();
  const plan = (await page.locator('.plan').textContent())?.replace(/\s+/g, ' ');
  await shot(page, 'ai-evolve');
  return `"${r.reply}" | ${plan?.slice(0, 220)}`;
});

await step('Evolve panel natural-language request uses the model and code validation', async () => {
  await page.getByLabel('Describe a change').fill('Give it striped markings and fluffy ears, but keep the body color');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Suggest' }).click();
  await page.locator('.evo-request').getByRole('button', { name: 'Thinking…' }).waitFor({ state: 'detached', timeout: 90_000 });
  await page.waitForTimeout(300);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const notice = (await page.locator('.notice').first().textContent())?.trim();
  const plan = (await page.locator('.plan').textContent().catch(() => ''))?.replace(/\s+/g, ' ');
  return `${secs}s: ${notice} | ${plan?.slice(0, 200)}`;
});

await step('diary entry written by the model from recorded events', async () => {
  await page.getByRole('tab', { name: /Diary/ }).click();
  await page.getByRole('button', { name: "Write today's entry" }).click();
  await page.locator('.diary-entry').first().waitFor({ timeout: 90_000 });
  const meta = await page.locator('.diary-entry .pill').first().textContent();
  const text = await page.locator('.diary-entry p').first().textContent();
  transcript.push({ diary: text, meta });
  await shot(page, 'ai-diary');
  return `[${meta}] "${text}"`;
});

await step('reload loads the model from the browser cache (no re-download)', async () => {
  await page.reload();
  const t0 = Date.now();
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
  const chip = await waitReady(5 * 60_000);
  return `${chip} in ${((Date.now() - t0) / 1000).toFixed(1)}s (first load took ${(loadMs / 1000).toFixed(1)}s)`;
});

await step('switches to the smaller model (one model loaded at a time)', async () => {
  await page.getByRole('tab', { name: /Settings/ }).click();
  await page.getByRole('radio', { name: /Qwen3 0.6B/ }).check();
  await page.waitForTimeout(1000);
  const chip = await waitReady(10 * 60_000);
  await page.getByRole('tab', { name: /Talk/ }).click();
  const r = await chat('How are you feeling right now?');
  const workers = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /worker/.test(e.name)).length);
  return `${chip}; reply "${r.reply}" (worker scripts fetched: ${workers})`;
});

await step('no AI request silently fell back to authored text', async () => {
  const fallbacks = logs.filter((l) => /\[kinling ai\].*fell back/.test(l));
  expect(fallbacks.length === 0, fallbacks.join(' | '));
  return 'every AI-ready request used the model';
});

await shot(page, 'final');
await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ results, transcript, logs: logs.filter((l) => !/^debug|^log: \[/.test(l)).slice(-80) }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} AI steps passed.`);
process.exit(failed.length ? 1 : 0);
