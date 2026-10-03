// Dev-only visual check for scene and item artwork. Not part of the game build.
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { ArenaBackdrop, FieldItem, MoverSprite } from '../render/ArenaArt';
import { Habitat, type TimeOfDay } from '../render/Habitat';
import { ItemIcon, type ItemKind } from '../render/ItemIcon';
import { ARENAS, PLAYER_R, routeCollectibles } from '../minigame/arenas';
import { MinigameRun, type Item, type MoverState } from '../minigame/engine';
import { FOOD_IDS, KEEPSAKE_IDS, MATERIAL_IDS, ROUTE_IDS, type RouteId } from '../game/types';

const KINDS: ItemKind[] = [...MATERIAL_IDS, ...FOOD_IDS, ...KEEPSAKE_IDS, 'golden'];
const params = new URLSearchParams(location.search);
const section = params.get('s') ?? 'all';
const still = params.has('still');

function Placeholder() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', display: 'block' }} aria-hidden="true">
      <ellipse cx="50" cy="94" rx="30" ry="5" fill="#000" opacity="0.15" />
      <ellipse cx="50" cy="62" rx="34" ry="32" fill="#F4A7BB" stroke="#C96F88" strokeWidth="2" />
      <circle cx="38" cy="56" r="4" fill="#3b2f2a" />
      <circle cx="62" cy="56" r="4" fill="#3b2f2a" />
      <path d="M44 68 q6 5 12 0" stroke="#3b2f2a" strokeWidth="2" fill="none" />
    </svg>
  );
}

function Icons() {
  return (
    <section>
      <h2>Item icons</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 150px)', gap: 10 }}>
        {KINDS.map((k) => (
          <div key={k} style={{ background: '#fffaf3', border: '1px solid #e8d6bd', borderRadius: 10, padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ItemIcon kind={k} size={24} title={k} />
            <ItemIcon kind={k} size={48} />
            <span style={{ fontSize: 11 }}>{k}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Habitats() {
  const combos: { t: TimeOfDay; n: number; bowl?: 'empty' | 'full' }[] = [
    { t: 'morning', n: 0, bowl: 'empty' },
    { t: 'day', n: 3, bowl: 'full' },
    { t: 'evening', n: 9 },
    { t: 'night', n: 9, bowl: 'full' },
  ];
  return (
    <section>
      <h2>Habitat</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 640px)', gap: 16 }}>
        {combos.map((c) => (
          <div key={c.t}>
            <div style={{ fontSize: 12 }}>
              {c.t} / {c.n} keepsakes / bowl {c.bowl ?? 'none'}
            </div>
            <Habitat timeOfDay={c.t} keepsakes={KEEPSAKE_IDS.slice(0, c.n)} bowl={c.bowl} reducedMotion={still}>
              <Placeholder />
            </Habitat>
          </div>
        ))}
      </div>
      <div style={{ width: 360, marginTop: 16 }}>
        <div style={{ fontSize: 12 }}>narrow (mobile) day, 9 keepsakes</div>
        <Habitat timeOfDay="day" keepsakes={[...KEEPSAKE_IDS]} bowl="full" reducedMotion={still}>
          <Placeholder />
        </Habitat>
      </div>
    </section>
  );
}

function sample(route: RouteId): { movers: MoverState[]; items: Item[] } {
  const run = new MinigameRun({ route, seed: 4, canSwim: route === 'pond-deep' });
  for (let i = 0; i < 60; i++) run.step({}, 1 / 30);
  const movers = [...run.state.movers];
  if (route === 'pond-shallows') {
    const pad = ARENAS[route].pads[13]!;
    movers.push({ kind: 'frog', x: pad.x + 14, y: pad.y - 12, hop: 0.5, facing: -1 });
  }
  const kinds = routeCollectibles(route);
  const items: Item[] = [...run.state.items];
  kinds.forEach((k, i) => items.push({ id: 100 + i, kind: k, x: 40 + i * 22, y: route === 'pond-deep' ? 240 : 246, bornAt: 0 }));
  items.push({ id: 200, kind: 'golden', x: route === 'pond-shallows' ? 204 : 300, y: route === 'pond-shallows' ? 106 : 210, bornAt: 0, ttl: 5 });
  return { movers, items };
}

function Debug({ route }: { route: RouteId }) {
  const d = ARENAS[route];
  const red = { fill: 'none', stroke: '#ff0033', strokeWidth: 0.8 } as const;
  return (
    <g>
      {d.slowZones.map((c, i) => <circle key={`s${i}`} cx={c.x} cy={c.y} r={c.r} {...red} />)}
      {d.blockers.map((c, i) => <circle key={`b${i}`} cx={c.x} cy={c.y} r={c.r} {...red} />)}
      {d.blockers.map((c, i) => <circle key={`bb${i}`} cx={c.x} cy={c.y} r={c.r + PLAYER_R * 0.8} {...red} strokeDasharray="2 2" />)}
      {d.water.map((e, i) => <ellipse key={`w${i}`} cx={e.x} cy={e.y} rx={e.rx} ry={e.ry} {...red} />)}
      {d.pads.map((c, i) => <circle key={`p${i}`} cx={c.x} cy={c.y} r={c.r} {...red} />)}
      {d.waterBand && <path d={`M0 ${d.waterBand.top} H400 M0 ${d.waterBand.bottom} H400`} {...red} />}
      <circle cx={d.start.x} cy={d.start.y} r={PLAYER_R} fill="none" stroke="#0033ff" strokeWidth="1" />
    </g>
  );
}

function Arenas() {
  return (
    <section>
      <h2>Arenas</h2>
      {ROUTE_IDS.map((route) => {
        const { movers, items } = sample(route);
        return (
          <div key={route} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {[false, true].map((debug) => (
              <svg key={String(debug)} viewBox="0 0 400 260" width="640" height="416" style={{ borderRadius: 12, display: 'block' }}>
                <ArenaBackdrop route={route} reducedMotion={still} />
                {items.map((it) => <FieldItem key={it.id} item={it} reducedMotion={still} />)}
                {movers.map((m, i) => <MoverSprite key={i} mover={m} reducedMotion={still} />)}
                {debug && <Debug route={route} />}
              </svg>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function App() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, background: '#f7ead8', color: '#3b2f2a' }}>
      {(section === 'all' || section === 'icons') && <Icons />}
      {(section === 'all' || section === 'habitat') && <Habitats />}
      {(section === 'all' || section === 'arenas') && <Arenas />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
