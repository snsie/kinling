import { describe, expect, it } from 'vitest';
import { applyEvolution, planEvolution, revertAppearance } from '../src/game/evolution';
import { routeAvailability } from '../src/game/adventure';
import { refreshProgress } from '../src/game/progress';
import { parseAppearanceRequest } from '../src/game/requestParser';
import type { SaveData } from '../src/game/types';
import { hatchedSave, kin, T0 } from './helpers';

function withPaddleUnlocked(): SaveData {
  const s = hatchedSave('aquatic');
  kin(s).affinities.aquatic = 25;
  s.stats.pondTrips = 1;
  refreshProgress(s, kin(s), T0, kin(s).bond);
  s.inventory.materials.reed = 7;
  s.inventory.materials.shell = 6;
  return s;
}

describe('evolution planning', () => {
  it('rejects locked traits with an explanation of what is needed', () => {
    const s = hatchedSave('woodland');
    const plan = planEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] });
    expect(plan.accepted).toHaveLength(0);
    expect(plan.rejected[0]!.code).toBe('locked');
    expect(plan.rejected[0]!.reason).toMatch(/Aquatic affinity 20/);
    expect(plan.changed).toBe(false);
  });

  it('rejects unknown ids from untrusted sources', () => {
    const s = hatchedSave();
    const plan = planEvolution(s, kin(s).id, { changes: [{ trait: 'feature.laser-eyes' as never }, { trait: '<script>' as never }] });
    expect(plan.accepted).toHaveLength(0);
    expect(plan.rejected.every((r) => r.code === 'unknown')).toBe(true);
  });

  it('previews without changing the save', () => {
    const s = withPaddleUnlocked();
    const before = JSON.stringify(s);
    const plan = planEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] });
    expect(plan.preview.tail).toBe('paddle');
    expect(plan.cost).toEqual({ reed: 5, shell: 4 });
    expect(plan.affordable).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('honours keep constraints', () => {
    const s = withPaddleUnlocked();
    const plan = planEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }, { trait: 'color.rose' }], keep: ['bodyColor'] });
    expect(plan.accepted.map((a) => a.trait)).toEqual(['tail.paddle']);
    expect(plan.rejected[0]!.code).toBe('kept');
    expect(plan.preview.bodyColor).toBe(kin(s).appearance.bodyColor);
  });

  it('enforces compatibility between wings and a back fin', () => {
    const s = hatchedSave('aquatic');
    s.unlocks.traits.push('feature.fins', 'feature.wings');
    s.unlocks.owned.push('feature.fins', 'feature.wings');
    kin(s).appearance.fins = true;
    const blocked = planEvolution(s, kin(s).id, { changes: [{ trait: 'feature.wings' }] });
    expect(blocked.rejected[0]!.code).toBe('incompatible');
    const swap = planEvolution(s, kin(s).id, { changes: [{ trait: 'feature.wings' }, { trait: 'feature.fins', remove: true }] });
    expect(swap.rejected).toHaveLength(0);
    expect(swap.preview.wings).toBe(true);
    expect(swap.preview.fins).toBe(false);
  });

  it('cannot apply when materials are missing', () => {
    const s = withPaddleUnlocked();
    s.inventory.materials.reed = 1;
    const plan = planEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] });
    expect(plan.affordable).toBe(false);
    expect(plan.missing).toEqual({ reed: 4 });
    const out = applyEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] }, T0);
    expect(out.feedback.ok).toBe(false);
    expect(kin(out.save).appearance.tail).not.toBe('paddle');
  });

  it('clamps slider proportions and the locked tall range', () => {
    const s = hatchedSave();
    const plan = planEvolution(s, kin(s).id, { changes: [], proportions: { plump: 2, head: -1, height: 0.99 } });
    expect(plan.preview.proportions).toEqual({ plump: 1, head: 0, height: 0.65 });
  });
});

describe('applying and reverting', () => {
  it('spends materials once, and reverting neither refunds nor allows reward farming', () => {
    let s = withPaddleUnlocked();
    const bond0 = kin(s).bond;
    s = applyEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] }, T0).save;
    expect(kin(s).appearance.tail).toBe('paddle');
    expect(s.inventory.materials.reed).toBe(2);
    expect(s.inventory.materials.shell).toBe(2);
    expect(s.unlocks.owned).toContain('tail.paddle');
    const bond1 = kin(s).bond;
    expect(bond1).toBeGreaterThan(bond0);

    s = revertAppearance(s, kin(s).id, T0 + 1).save;
    expect(kin(s).appearance.tail).not.toBe('paddle');
    expect(s.inventory.materials.reed).toBe(2); // no refund

    s = applyEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] }, T0 + 2).save;
    expect(s.inventory.materials.reed).toBe(2); // owned: free to re-apply
    expect(kin(s).bond).toBe(bond1); // no second reward
  });

  it('the paddle tail gates the Deep Reeds route only while worn', () => {
    let s = withPaddleUnlocked();
    expect(routeAvailability(s, 'pond-deep').available).toBe(false);
    s = applyEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] }, T0).save;
    expect(routeAvailability(s, 'pond-deep').available).toBe(true);
    s = revertAppearance(s, kin(s).id, T0 + 1).save;
    expect(routeAvailability(s, 'pond-deep').available).toBe(false);
  });

  it('revert with no history is rejected', () => {
    const s = hatchedSave();
    expect(revertAppearance(s, kin(s).id, T0).feedback.ok).toBe(false);
  });
});

describe('offline appearance parser', () => {
  it('maps the example request to catalog ids with keep constraints', () => {
    const { request } = parseAppearanceRequest('Make it more aquatic, but keep its pink fur and fluffy ears.');
    expect(request.keep).toEqual(expect.arrayContaining(['bodyColor', 'ears']));
    const traits = request.changes.map((c) => c.trait);
    expect(traits).toContain('tail.paddle');
    expect(traits).toContain('feature.fins');
    expect(traits).not.toContain('color.lagoon');
  });

  it('understands explicit parts, colors and removals', () => {
    const { request } = parseAppearanceRequest('give it floppy ears, yellow spots and no wings');
    expect(request.changes).toEqual(
      expect.arrayContaining([{ trait: 'feature.wings', remove: true }, { trait: 'ears.floppy' }, { trait: 'pattern.spots' }]),
    );
    expect(request.markingColor).toBe('butter');
  });

  it('keeps body color without freezing body shape', () => {
    const { request } = parseAppearanceRequest('Give it striped markings and fluffy ears, but keep the body color');
    expect(request.keep).toEqual(['bodyColor']);
    expect(request.changes).toEqual(expect.arrayContaining([{ trait: 'ears.fluffy' }, { trait: 'pattern.stripes' }]));
  });

  it('does not read "a little more" as a size request', () => {
    const { request } = parseAppearanceRequest('a little more woodland please');
    expect(request.changes.map((c) => c.trait)).not.toContain('shape.petite');
    expect(request.changes.map((c) => c.trait)).toContain('ears.leaf');
  });

  it('flags features kinlings cannot grow', () => {
    expect(parseAppearanceRequest('give it scales and antlers').unsupported.length).toBe(2);
  });
});

describe('creation-time descriptions', () => {
  it('applies starter options and defers locked ones to evolution', async () => {
    const { applyCreationRequest } = await import('../src/game/onboarding');
    const { EGGS } = await import('../src/game/catalog');
    const { request } = parseAppearanceRequest('pink fur with stripes, floppy ears and a paddle tail and wings');
    const res = applyCreationRequest('woodland', EGGS.woodland.defaultAppearance, request);
    expect(res.appearance.bodyColor).toBe('rose');
    expect(res.appearance.pattern).toBe('stripes');
    expect(res.appearance.ears).toBe('floppy');
    expect(res.appearance.tail).not.toBe('paddle');
    expect(res.appearance.wings).toBe(false);
    expect(res.later).toEqual(expect.arrayContaining(['Paddle tail', 'Decorative wings']));
  });
});

describe('parser word order', () => {
  it('reads noun-first phrasing', () => {
    expect(parseAppearanceRequest('can you make your tail curly?').request.changes).toEqual([{ trait: 'tail.curled' }]);
    expect(parseAppearanceRequest('I want its ears to be floppy').request.changes).toEqual([{ trait: 'ears.floppy' }]);
    expect(parseAppearanceRequest('give it a paddle tail').request.changes).toEqual([{ trait: 'tail.paddle' }]);
  });
});
