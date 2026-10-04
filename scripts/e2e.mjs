// End-to-end browser verification for Kinling.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/e2e.mjs
// Env: BASE_URL (default http://localhost:4173/), OUT (screenshot dir, default e2e-results)
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'e2e-results';
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleErrors = [];
let shotN = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note: note ?? '' });
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(err?.message ?? err).split('\n')[0] });
    console.log(`  ✗ ${name}: ${String(err?.message ?? err).split('\n')[0]}`);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function shot(page, label) {
  const file = join(OUT, `${String(++shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
}

/** Steer the creature by tapping the nearest item (exercises tap-to-move pathfinding). */
async function playMinigame(page, { maxMs = 70_000, quitAfterMs = null } = {}) {
  await page.getByRole('button', { name: 'Start' }).click();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (quitAfterMs && Date.now() - t0 > quitAfterMs) {
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: 'Head home early' }).click();
      break;
    }
    const done = await page.locator('svg.arena').count();
    if (!done) break;
    const target = await page.evaluate(() => {
      const svg = document.querySelector('svg.arena');
      if (!svg) return null;
      const parse = (el) => {
        const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(el.getAttribute('transform') ?? '');
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
      };
      const pl = document.querySelector('[data-player]');
      const pp = pl && parse(pl);
      if (!pp) return null;
      const p = { x: pp.x + 24, y: pp.y + 38 };
      const items = [...document.querySelectorAll('[data-item]')].map((el) => ({ kind: el.getAttribute('data-item'), ...parse(el) }));
      if (!items.length) return null;
      items.sort((a, b) => (a.kind === 'golden' ? -1 : b.kind === 'golden' ? 1 : Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)));
      const box = svg.getBoundingClientRect();
      const it = items[0];
      return { x: box.x + (it.x / 400) * box.width, y: box.y + (it.y / 260) * box.height };
    });
    if (target) await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(450);
  }
}

const browser = await chromium.launch({ headless: true });

// ---------------------------------------------------------------------------
console.log('Onboarding and core loop');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
watch(page, 'main');
const axeReports = [];
async function axe(label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  axeReports.push({ label, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(' ') })) });
  return r.violations.length;
}

await step('loads and explains AI is unavailable without WebGPU', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Welcome to Kinling' }).waitFor();
  // The WebGPU check is async; wait for its result rather than reading the page immediately.
  const notice = await page.getByText("isn't available in this browser").waitFor({ timeout: 10000 }).then(() => true, () => false);
  expect(notice, 'no WebGPU notice');
  await shot(page, 'welcome');
  const v = await axe('welcome');
  return `axe violations: ${v}`;
});

await step('chooses an egg', async () => {
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Choose an egg' }).waitFor();
  await page.getByRole('button', { name: /Woodland Egg/ }).click();
  await page.getByRole('heading', { name: 'Imagine your kinling' }).waitFor();
});

await step('customizes via natural-language description (offline parser)', async () => {
  await page.getByLabel('Or describe it (optional)').fill('pink fur with a cream belly, yellow spots, floppy ears and a paddle tail');
  await page.getByRole('button', { name: 'Apply' }).click();
  const note = page.getByRole('status').filter({ hasText: 'Applied' });
  await note.waitFor();
  const text = await note.textContent();
  expect(/Rose coat/.test(text) && /Floppy ears/.test(text), `unexpected note: ${text}`);
  expect(/Paddle tail/.test(text) && /evolve later/.test(text), 'paddle tail should be deferred');
  expect((await page.getByRole('button', { name: 'Rose', exact: true }).first().getAttribute('aria-pressed')) === 'true', 'rose not selected');
  await shot(page, 'customize');
  const v = await axe('customize');
  return `${text.trim()} | axe violations: ${v}`;
});

await step('hatches with animation and names the creature', async () => {
  await page.getByRole('button', { name: 'Ready to hatch' }).click();
  await page.getByRole('button', { name: 'Hatch!' }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'hatching');
  await page.getByRole('heading', { name: "What's its name?" }).waitFor({ timeout: 10_000 });
  await page.getByLabel("Kinling's name").fill('Mochi');
  await page.getByLabel(/What should it call you/).fill('Sam');
  await page.getByRole('button', { name: "That's Mochi!" }).click();
  await page.getByRole('heading', { name: 'First things first' }).waitFor();
});

await step('first feeding works instantly', async () => {
  await page.getByRole('button', { name: 'Feed a dewberry' }).click();
  await page.getByRole('button', { name: 'Next: a walk in the garden' }).waitFor();
  await shot(page, 'first-care');
  await page.getByRole('button', { name: 'Next: a walk in the garden' }).click();
});

await step('garden tutorial awards the first keepsake', async () => {
  await page.getByRole('button', { name: "Let's go!" }).click();
  await playMinigame(page, { maxMs: 40_000 });
  await page.getByText(/Your first keepsake: Tiny Acorn Cap/).waitFor({ timeout: 15_000 });
  await shot(page, 'first-keepsake');
  await page.getByRole('button', { name: 'Go home' }).click();
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
});

await step('home shows habitat, labelled meters and keepsake shelf', async () => {
  const meters = await page.getByRole('meter').count();
  expect(meters >= 4, `only ${meters} meters`);
  for (const n of ['Hunger', 'Energy', 'Cleanliness', 'Happiness']) await page.getByText(n, { exact: true }).first().waitFor();
  await shot(page, 'home');
  const v = await axe('home');
  return `meters: ${meters} | axe violations: ${v}`;
});

await step('care actions respond immediately (groom, rest, play, feed)', async () => {
  const getNeed = async (label) => Number(await page.locator('.needs [role=meter]').nth(['Hunger', 'Energy', 'Cleanliness', 'Happiness'].indexOf(label)).getAttribute('aria-valuenow'));
  const clean0 = await getNeed('Cleanliness');
  await page.getByRole('button', { name: 'Groom' }).click();
  await page.waitForTimeout(200);
  const clean1 = await getNeed('Cleanliness');
  expect(clean1 >= clean0, `cleanliness did not rise (${clean0} → ${clean1})`);
  await page.getByRole('button', { name: 'Rest' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await page.getByRole('button', { name: /Feed Seed Bun/ }).click();
  const speech = await page.locator('.speech').textContent();
  return `cleanliness ${clean0}→${clean1}; creature said "${speech?.trim()}"`;
});

await step('chat replies with authored dialogue when AI is off; facts and care proposals work', async () => {
  await page.getByRole('tab', { name: /Talk/ }).click();
  await page.getByLabel('Message Mochi').fill('hello Mochi!');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('.msg--creature').first().waitFor();
  await page.getByLabel('Message Mochi').fill('remember that I love rainy days');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(/Saved to "Things you told Mochi"/).waitFor();
  await page.getByLabel('Message Mochi').fill('you should take a nap and then play');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('group', { name: 'Suggested actions' }).last().waitFor();
  await page.getByRole('group', { name: 'Suggested actions' }).last().getByRole('button', { name: /Rest/ }).click();
  await page.getByLabel('Message Mochi').fill('can you make your ears fluffy?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Preview in Evolve' }).waitFor();
  const n = await page.locator('.msg').count();
  await shot(page, 'talk');
  const v = await axe('talk');
  return `${n} messages | axe violations: ${v}`;
});

await step('chat → Evolve hand-off previews without applying', async () => {
  await page.getByRole('button', { name: 'Preview in Evolve' }).click();
  await page.getByRole('heading', { name: 'Evolve' }).waitFor();
  await page.getByText('Ready to adopt').waitFor();
  const ears = page.getByRole('group', { name: 'Ears' });
  expect((await ears.getByRole('button', { name: /Fluffy ears/ }).getAttribute('aria-pressed')) === 'true', 'fluffy ears not in preview');
  expect(/Wearing/.test(await ears.getByRole('button', { name: /Floppy ears/ }).textContent()), 'floppy ears should still be worn');
  await page.getByRole('button', { name: 'Clear' }).click();
  return 'preview shows fluffy ears; still wearing floppy until Apply';
});

let exploreRewards = '';
await step('pond adventure: real interactions, outcomes and inventory changes', async () => {
  await page.getByRole('tab', { name: /Bag/ }).click();
  const before = await page.locator('.inv-grid--mats').textContent();
  await page.getByRole('tab', { name: /Explore/ }).click();
  await page.getByRole('button', { name: 'Go to the Pond Shallows' }).click();
  await page.getByRole('heading', { name: 'Pond Shallows' }).waitFor();
  await shot(page, 'pond-intro');
  const playing = playMinigame(page, { maxMs: 70_000 });
  await page.waitForTimeout(12_000);
  await shot(page, 'pond-playing');
  await playing;
  await page.getByRole('heading', { name: /haul|stroll/ }).waitFor({ timeout: 20_000 });
  exploreRewards = (await page.locator('.results').textContent()).replace(/\s+/g, ' ').trim();
  await shot(page, 'pond-results');
  await page.getByRole('button', { name: 'Return home' }).click();
  await page.getByRole('tab', { name: /Bag/ }).click();
  const after = await page.locator('.inv-grid--mats').textContent();
  expect(before !== after, 'materials did not change');
  return exploreRewards.slice(0, 160);
});

await step('Deep Reeds is locked without a paddle tail and explains why', async () => {
  await page.getByRole('tab', { name: /Explore/ }).click();
  const card = page.locator('article', { has: page.getByRole('heading', { name: 'Deep Reeds' }) });
  const txt = await card.textContent();
  expect(/Needs a paddle tail|adopt it in Evolve/.test(txt), 'no lock explanation');
  expect(await card.getByRole('button', { name: 'Not available' }).isDisabled(), 'deep route should be disabled');
  return txt.match(/Needs a paddle tail[^.]*\.|adopt it in Evolve[^.]*\./)?.[0];
});

await step('natural-language evolution request explains unavailable features', async () => {
  await page.getByRole('tab', { name: /Evolve/ }).click();
  await page.getByLabel('Describe a change').fill('Make it more aquatic, but keep its pink fur and floppy ears');
  await page.getByRole('button', { name: 'Suggest' }).click();
  await page.getByText('Not possible right now').waitFor();
  const plan = (await page.locator('.plan').textContent()).replace(/\s+/g, ' ');
  expect(/Not unlocked yet/.test(plan), 'should explain locks');
  await shot(page, 'evolve-request');
  const v = await axe('evolve');
  return `${plan.slice(0, 200)} | axe violations: ${v}`;
});

await step('visual editor: preview, apply, then revert without refunds', async () => {
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('group', { name: 'Markings' }).getByRole('button', { name: /Stripes/ }).click();
  await page.getByText('Ready to adopt').waitFor();
  await page.getByRole('button', { name: /^Apply/ }).click();
  await page.getByText('Mochi evolved!').waitFor();
  const stripes = await page.getByRole('group', { name: 'Markings' }).getByRole('button', { name: /Stripes/ }).textContent();
  expect(/Wearing/.test(stripes), 'stripes not worn after apply');
  await page.getByRole('button', { name: /Revert to previous look/ }).click();
  await page.getByText('Appearance reverted.').waitFor();
  const spots = await page.getByRole('group', { name: 'Markings' }).getByRole('button', { name: /^Spots/ }).textContent();
  expect(/Wearing/.test(spots), 'revert did not restore spots');
  const stripesAgain = await page.getByRole('group', { name: 'Markings' }).getByRole('button', { name: /Stripes/ }).textContent();
  expect(/Owned/.test(stripesAgain), 'stripes should stay owned after revert');
});

await step('diary entry grounded in recorded events', async () => {
  await page.getByRole('tab', { name: /Diary/ }).click();
  await page.getByRole('button', { name: "Write today's entry" }).click();
  await page.locator('.diary-entry').first().waitFor();
  const entry = (await page.locator('.diary-entry p').first().textContent()).trim();
  expect(/Dear diary|Diary/.test(entry), 'entry format');
  expect(/Pond Shallows|explored|ate|hatched|named/i.test(entry), 'entry should mention real events');
  await page.getByText('I love rainy days').waitFor();
  await shot(page, 'diary');
  const v = await axe('diary');
  return `"${entry.slice(0, 140)}…" | axe violations: ${v}`;
});

await step('keyboard: tab list arrow navigation and visible focus', async () => {
  await page.getByRole('tab', { name: /Diary/ }).focus();
  await page.keyboard.press('ArrowRight');
  const active = await page.evaluate(() => document.activeElement?.textContent);
  expect(/Settings/.test(active ?? ''), `arrow moved focus to ${active}`);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  return `focus on ${active?.trim()}, outline ${outline}`;
});

await step('settings: AI unavailable state, save info, motion and sound', async () => {
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  const txt = await page.locator('.settings').textContent();
  expect(/isn't available here/.test(txt), 'AI unavailable message missing');
  expect(/only in this browser/.test(txt), 'local save explanation missing');
  await shot(page, 'settings');
  const v = await axe('settings');
  return `axe violations: ${v}`;
});

await step('autosave + reload restores everything', async () => {
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
  const top = await page.locator('.topbar').textContent();
  expect(/Mochi/.test(top), 'name missing after reload');
  await page.getByRole('tab', { name: /Diary/ }).click();
  expect((await page.locator('.diary-entry').count()) === 1, 'diary entry missing after reload');
  await page.getByRole('tab', { name: /Bag/ }).click();
  await page.getByRole('button', { name: 'Tiny Acorn Cap' }).waitFor();
  return 'name, diary and keepsake persisted';
});

let exported = null;
await step('export backup produces a validated JSON file', async () => {
  await page.getByRole('tab', { name: /Settings/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup (.json)' }).click()]);
  const path = await download.path();
  exported = JSON.parse(readFileSync(path, 'utf8'));
  expect(exported.format === 'kinling-save', 'format tag');
  expect(exported.save.schemaVersion === 4, 'schema version');
  expect(exported.save.kinlings[0].name === 'Mochi', 'kinling name');
  writeFileSync(join(OUT, 'exported-save.json'), JSON.stringify(exported, null, 2));
  return `${download.suggestedFilename()} (${JSON.stringify(exported).length} bytes)`;
});

await step('malformed import is rejected with a clear message', async () => {
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"kinling-save","save":{"schemaVersion":2,"creature":{"name":"<script>"}}}') });
  await page.getByText(/Import failed/).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'notjson.json', mimeType: 'application/json', buffer: Buffer.from('this is not json') });
  await page.getByText(/not valid JSON/).waitFor();
  return 'invalid schema and invalid JSON both refused';
});

await step('import a modified backup (paddle tail earned) and use the paddle-tail route', async () => {
  const mod = structuredClone(exported);
  const s = mod.save;
  s.kinlings[0].affinities.aquatic = 26;
  s.stats.pondTrips = Math.max(1, s.stats.pondTrips);
  s.inventory.materials.reed = 6;
  s.inventory.materials.shell = 6;
  if (!s.unlocks.traits.includes('tail.paddle')) s.unlocks.traits.push('tail.paddle');
  await page.locator('input[type=file]').setInputFiles({ name: 'mod.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mod)) });
  await page.getByRole('dialog', { name: 'Replace your current save?' }).waitFor();
  await page.getByRole('button', { name: 'Import and replace' }).click();
  await page.getByText('Backup imported.').waitFor();
  await page.getByRole('tab', { name: /Evolve/ }).click();
  await page.getByRole('group', { name: 'Tail' }).getByRole('button', { name: /Paddle tail/ }).click();
  await page.getByText('Ready to adopt').waitFor();
  await shot(page, 'evolve-paddle-preview');
  await page.getByRole('button', { name: /^Apply/ }).click();
  await page.getByText('Mochi evolved!').waitFor();
  await page.getByRole('tab', { name: /Explore/ }).click();
  await page.getByRole('button', { name: 'Go to the Deep Reeds' }).click();
  await page.getByRole('heading', { name: 'Deep Reeds' }).waitFor();
  await playMinigame(page, { maxMs: 30_000, quitAfterMs: 15_000 });
  await page.getByRole('heading', { name: /haul|stroll/ }).waitFor({ timeout: 15_000 });
  const res = (await page.locator('.results').textContent()).replace(/\s+/g, ' ');
  await shot(page, 'deep-results');
  await page.getByRole('button', { name: 'Return home' }).click();
  return res.slice(0, 160);
});

/** The exported save with three more kinlings who have all just met. */
function withFourKinlings(file) {
  const out = structuredClone(file);
  const s = out.save;
  const base = s.kinlings[0];
  const extras = [
    ['Pip', { curiosity: 48, confidence: 38, playfulness: 70 }],
    ['Fig', { curiosity: 66, confidence: 55, playfulness: 40 }],
    ['Luma', { curiosity: 52, confidence: 47, playfulness: 58 }],
  ];
  for (const [i, [name, personality]] of extras.entries()) {
    s.kinlings.push({
      ...structuredClone(base),
      id: `kin_e2e_${i}`,
      name,
      personality,
      baseline: { ...personality },
      bond: 0,
      memories: [],
      chat: [],
      chatSummary: null,
      appearanceHistory: [],
      careLog: { feed: [], groom: [], rest: [], play: [] },
      socialDaily: { ...base.socialDaily, socialPersonality: { curiosity: 0, confidence: 0, playfulness: 0 }, feelingDelta: {} },
    });
  }
  s.feelings = s.feelings.filter((f) => f.to === 'player');
  for (const k of s.kinlings) {
    if (!s.feelings.some((f) => f.from === k.id)) s.feelings.push({ from: k.id, to: 'player', warmth: 20, trust: 20, familiarity: 0, topics: [] });
    for (const o of s.kinlings) if (o.id !== k.id) s.feelings.push({ from: k.id, to: o.id, warmth: 15, trust: 10, familiarity: 0, topics: [] });
  }
  s.conversations = [];
  return out;
}

await step('four kinlings: import, then pick one from the list to care for', async () => {
  await page.getByRole('tab', { name: /Settings/ }).click();
  const four = withFourKinlings(exported);
  await page.locator('input[type=file]').setInputFiles({ name: 'four.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(four)) });
  await page.getByRole('dialog', { name: 'Replace your current save?' }).waitFor();
  await page.getByRole('button', { name: 'Import and replace' }).click();
  await page.getByText('Backup imported.').waitFor();
  const picker = page.getByRole('group', { name: 'Choose a kinling to care for' });
  await picker.waitFor();
  const names = (await picker.getByRole('button').allTextContents()).map((t) => t.trim());
  expect(names.join(',') === 'Mochi,Pip,Fig,Luma', `picker shows ${names}`);
  await picker.getByRole('button', { name: 'Pip' }).click();
  expect((await picker.getByRole('button', { name: 'Pip' }).getAttribute('aria-pressed')) === 'true', 'Pip not selected');
  await page.getByRole('tab', { name: /Talk/ }).click();
  await page.getByRole('heading', { name: 'Talk with Pip' }).waitFor();
  const cleanBefore = Number(await page.locator('.needs [role=meter]').nth(2).getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: 'Groom' }).click();
  await page.waitForTimeout(200);
  const cleanAfter = Number(await page.locator('.needs [role=meter]').nth(2).getAttribute('aria-valuenow'));
  expect(cleanAfter >= cleanBefore, 'grooming Pip did not register');
  await shot(page, 'room-four');
  const v = await axe('room');
  return `${names.join(', ')}; Pip selected | axe violations: ${v}`;
});

await step('two kinlings meet and talk; the conversation survives a reload', async () => {
  // The ?e2e flag exposes a hook for placing kinlings (not available otherwise).
  await page.goto(`${BASE}?e2e`);
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
  let pair = null;
  for (let i = 0; i < 20 && !pair; i++) {
    pair = await page.evaluate(() => window.kinlingRoom?.placeTogether() ?? null);
    if (!pair) await page.waitForTimeout(500);
  }
  expect(pair, 'no pair free to talk');
  await page.locator('.room-bubble').first().waitFor({ timeout: 8000 });
  await shot(page, 'room-conversation');
  await page.getByRole('tab', { name: /Talk/ }).click();
  const item = page.locator('.overheard__item').first();
  await item.waitFor();
  const before = (await item.textContent()).trim();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('tab', { name: /Talk/ }).click();
  const after = (await page.locator('.overheard__item').first().textContent()).trim();
  expect(after === before, `conversation changed after reload: ${after}`);
  return before.slice(0, 140);
});

await step('Bag describes feelings in words', async () => {
  await page.getByRole('tab', { name: /Bag/ }).click();
  const text = (await page.locator('.about__feelings').textContent()).trim();
  expect(/Feelings: .*(you)/.test(text), `unexpected feelings text: ${text}`);
  const mochi = page.getByRole('group', { name: 'Choose a kinling to care for' }).getByRole('button', { name: 'Mochi' });
  await mochi.click();
  expect((await mochi.getAttribute('aria-pressed')) === 'true', 'Mochi not selected again');
  // Let the autosave land before the next step opens a second tab.
  await page.waitForTimeout(1200);
  return text;
});

await step('second tab is read-only; "Play here instead" takes over', async () => {
  const p2 = await ctx.newPage();
  watch(p2, 'tab2');
  await p2.goto(BASE);
  await p2.getByText(/open in another tab/).waitFor();
  await shot(p2, 'second-tab');
  await p2.getByRole('button', { name: 'Play here instead' }).click();
  await page.getByText(/open in another tab/).waitFor({ timeout: 5000 });
  await p2.getByRole('button', { name: 'Groom' }).click();
  await p2.waitForTimeout(1200);
  const st = await p2.locator('.topbar').textContent();
  await p2.close();
  return st.match(/Saved[^A]*/)?.[0]?.trim();
});

await step('offline: the cached shell loads without network', async () => {
  const p3 = await ctx.newPage();
  await p3.goto(BASE);
  await p3.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p3.waitForTimeout(800);
  await ctx.setOffline(true);
  await p3.reload();
  await p3.locator('.topbar__title').waitFor({ timeout: 10_000 });
  const ok = await p3.locator('.topbar').textContent();
  await shot(p3, 'offline');
  await ctx.setOffline(false);
  await p3.close();
  return `rendered offline: ${/Kinling/.test(ok)}`;
});

await step('reset requires typing the name, then returns to onboarding', async () => {
  await page.bringToFront();
  await page.reload();
  await page.getByRole('tab', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Reset game…' }).click();
  await page.getByRole('dialog', { name: 'Reset everything?' }).waitFor();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/to confirm/).waitFor();
  await page.getByRole('dialog').getByLabel(/to confirm/).fill('Mochi');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome to Kinling' }).waitFor();
});

await ctx.close();

// ---------------------------------------------------------------------------
console.log('Reduced motion and mobile');
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
const mp = await rm.newPage();
watch(mp, 'mobile');
await step('reduced-motion preference is honoured; mobile layout fits', async () => {
  await mp.goto(BASE);
  await mp.getByRole('heading', { name: 'Welcome to Kinling' }).waitFor();
  const cls = await mp.evaluate(() => document.documentElement.className);
  expect(/reduce-motion/.test(cls), 'reduce-motion class missing');
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `horizontal overflow ${overflow}px`);
  await shot(mp, 'mobile-welcome');
  return `html.${cls}; horizontal overflow ${overflow}px`;
});
await rm.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
const summary = {
  base: BASE,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  axe: axeReports,
  consoleErrors: consoleErrors.filter((e) => !/No available adapters/.test(e)),
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${results.length} steps passed. Console errors: ${summary.consoleErrors.length}. Axe screens: ${axeReports.map((a) => `${a.label}:${a.violations.length}`).join(' ')}`);
process.exit(failed.length ? 1 : 0);
