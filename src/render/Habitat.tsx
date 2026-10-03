// The home habitat: a snug hollow inside an old tree. The creature is passed
// in as children and rendered as an HTML overlay standing on the rug.
import { useId, type ReactNode } from 'react';
import type { KeepsakeId } from '../game/types';
import { ItemGlyph } from './ItemIcon';
import '../styles/scenes.css';

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';

export function timeOfDayFor(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

export interface HabitatProps {
  keepsakes: KeepsakeId[];
  timeOfDay: TimeOfDay;
  reducedMotion?: boolean;
  children?: ReactNode;
  bowl?: 'empty' | 'full';
  className?: string;
  label?: string;
}

const SKY: Record<TimeOfDay, [string, string, string]> = {
  morning: ['#F9C9A8', '#FBE2C4', '#CFE6F2'],
  day: ['#8FCBEF', '#B9E0F6', '#E4F4FB'],
  evening: ['#6E5AA6', '#E98A6B', '#F8C27C'],
  night: ['#141B3D', '#24305E', '#3A4A7E'],
};

// Multiplied over the scene (so colors deepen instead of turning grey), and
// fading out around the lamp so its pool of light stays warm.
const TINT: Record<TimeOfDay, { color: string; near: number; far: number }> = {
  morning: { color: '#FFD3B4', near: 0.2, far: 0.4 },
  day: { color: '#FFFFFF', near: 0, far: 0 },
  evening: { color: '#E98F6A', near: 0.08, far: 0.5 },
  night: { color: '#3E4890', near: 0.04, far: 0.85 },
};

const LAMP_GLOW: Record<TimeOfDay, number> = { morning: 0.3, day: 0.22, evening: 0.62, night: 0.95 };

// Shelf slots: five on the upper shelf, four on the lower one.
const SHELF_UPPER_Y = 168;
const SHELF_LOWER_Y = 250;
const SLOTS: { x: number; y: number }[] = [
  ...[538, 574, 610, 646, 682].map((x) => ({ x, y: SHELF_UPPER_Y })),
  ...[556, 592, 628, 664].map((x) => ({ x, y: SHELF_LOWER_Y })),
];

const BUNTING_COLORS = ['#E8836B', '#F7D98B', '#A9DDBE', '#A7CDEE', '#C9B3E8'];

function quad(t: number, p0: [number, number], p1: [number, number], p2: [number, number]): [number, number] {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

function Window({ time, ids }: { time: TimeOfDay; ids: Record<string, string> }) {
  const night = time === 'night';
  return (
    <g>
      {/* sill */}
      <rect x="112" y="248" width="186" height="13" rx="5" fill="#9A6A3F" />
      <rect x="112" y="248" width="186" height="4" rx="2" fill="#B88456" />
      {/* the view */}
      <g clipPath={`url(#${ids.windowClip})`}>
        <rect x="127" y="97" width="156" height="156" fill={`url(#${ids.sky})`} />
        {time === 'day' && (
          <g className="habitat-cloud">
            <path d="M150 140 c4 -10 18 -12 24 -4 c6 -8 20 -5 20 5 c8 0 10 10 2 12 h-44 c-8 -2 -8 -12 -2 -13z" fill="#fff" opacity="0.92" />
            <path d="M222 118 c3 -7 13 -8 17 -3 c4 -5 14 -3 14 4 c6 0 7 7 1 8 h-31 c-6 -1 -6 -8 -1 -9z" fill="#fff" opacity="0.85" />
          </g>
        )}
        {time === 'morning' && <circle cx="240" cy="200" r="20" fill="#FFE7A8" opacity="0.95" />}
        {time === 'evening' && <circle cx="170" cy="212" r="24" fill="#FFC36E" opacity="0.95" />}
        {night && (
          <g>
            <circle cx="238" cy="148" r="30" fill="#F4F0D8" opacity="0.12" />
            <path d="M246 128 A20 20 0 1 0 246 168 A16 16 0 1 1 246 128Z" fill="#F4F0D8" />
            {[
              [160, 125, 2.2],
              [185, 150, 1.4],
              [205, 118, 1.8],
              [150, 175, 1.3],
              [215, 182, 1.6],
              [178, 112, 1.2],
              [265, 196, 1.3],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill="#FFF8D6" className="habitat-twinkle" style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
          </g>
        )}
        {/* distant hills and treetops */}
        <path d="M120 222 C150 200 175 206 200 216 C225 200 255 198 290 214 L290 260 L120 260Z" fill={night ? '#22325A' : time === 'evening' ? '#7C5B7E' : '#9CC88A'} />
        <path d="M120 236 C160 222 190 228 215 236 C240 226 265 226 290 236 L290 260 L120 260Z" fill={night ? '#1A2648' : time === 'evening' ? '#5F4766' : '#7FB06E'} />
      </g>
      {/* frame and muntins */}
      <circle cx="205" cy="175" r="72" fill="none" stroke="#8E5E35" strokeWidth="15" />
      <circle cx="205" cy="175" r="79" fill="none" stroke="#6E4527" strokeWidth="2" opacity="0.6" />
      <circle cx="205" cy="175" r="65" fill="none" stroke="#B88456" strokeWidth="2" />
      <path d="M205 104 V246 M134 175 H276" stroke="#8E5E35" strokeWidth="6" />
      <path d="M150 128 C162 116 176 110 190 107" stroke="#fff" strokeWidth="4" opacity={night ? 0.12 : 0.3} fill="none" strokeLinecap="round" />
      {/* a little flower pot on the sill, beside the frame */}
      <path d="M266 233 L288 233 L285 249 L269 249Z" fill="#D07B57" stroke="#9E5536" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M272 233 C270 224 266 220 262 218 M277 233 C278 222 282 216 287 214 M281 233 C284 226 289 224 294 224" stroke="#5E8A3A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="262" cy="217" r="4.5" fill="#F4A7BB" />
      <circle cx="287" cy="213" r="4.5" fill="#F7D98B" />
      <circle cx="294" cy="223" r="3.8" fill="#F4A7BB" />
    </g>
  );
}

function Lamp({ glow, ids }: { glow: number; ids: Record<string, string> }) {
  return (
    <g>
      <g opacity={glow} style={{ mixBlendMode: 'screen' }}>
        <circle cx="400" cy="122" r="190" fill={`url(#${ids.lampGlow})`} className="habitat-flicker" />
      </g>
      <path d="M400 20 V92" stroke="#6E4527" strokeWidth="2.5" />
      <path d="M386 92 L414 92 L408 84 L392 84Z" fill="#5A3A22" />
      <rect x="380" y="92" width="40" height="46" rx="9" fill="#FFD98A" stroke="#5A3A22" strokeWidth="3" />
      <rect x="388" y="98" width="24" height="34" rx="6" fill="#FFF0BF" opacity="0.9" />
      <path d="M400 104 C394 112 396 120 400 124 C404 120 406 112 400 104Z" fill="#F29B3A" className="habitat-flicker" />
      <path d="M380 115 H420" stroke="#5A3A22" strokeWidth="2" opacity="0.6" />
      <path d="M392 138 L408 138 L403 146 L397 146Z" fill="#5A3A22" />
    </g>
  );
}

function Shelf({ keepsakes }: { keepsakes: KeepsakeId[] }) {
  const shown = keepsakes.slice(0, SLOTS.length);
  return (
    <g>
      {[SHELF_UPPER_Y, SHELF_LOWER_Y].map((y) => (
        <g key={y}>
          <path d={`M524 ${y + 9} L524 ${y + 26} L540 ${y + 9}Z M696 ${y + 9} L696 ${y + 26} L680 ${y + 9}Z`} fill="#7A4F2E" />
          <rect x="512" y={y} width="196" height="10" rx="3" fill="#9A6A3F" />
          <rect x="512" y={y} width="196" height="3.5" rx="1.5" fill="#BC8A5A" />
          <rect x="512" y={y + 8} width="196" height="2" fill="#6E4527" opacity="0.5" />
        </g>
      ))}
      {/* a little hanging tag */}
      <path d="M530 178 L530 192 M548 178 L548 192" stroke="#6E4527" strokeWidth="1.5" />
      <rect x="522" y="190" width="34" height="16" rx="4" fill="#F3DFC1" stroke="#9A6A3F" strokeWidth="1.5" />
      <path d={'M539 193.5 L540.6 197 L544.4 197.4 L541.5 199.9 L542.4 203.6 L539 201.6 L535.6 203.6 L536.5 199.9 L533.6 197.4 L537.4 197Z'} fill="#E3A92F" />
      {SLOTS.map((slot, i) => {
        const id = shown[i];
        if (!id) {
          return (
            <g key={i} opacity="0.55">
              <ellipse cx={slot.x} cy={slot.y - 0.5} rx="11" ry="2.4" fill="#6E4527" opacity="0.18" />
              <circle cx={slot.x} cy={slot.y - 13} r="11" fill="none" stroke="#9A6A3F" strokeWidth="1.3" strokeDasharray="2.5 3.5" opacity="0.6" />
            </g>
          );
        }
        return (
          <g key={i}>
            <ellipse cx={slot.x} cy={slot.y - 0.5} rx="12" ry="2.6" fill="#3B2A1A" opacity="0.18" />
            <g transform={`translate(${slot.x - 15} ${slot.y - 30}) scale(${30 / 32})`}>
              <ItemGlyph kind={id} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function Plant() {
  return (
    <g>
      <ellipse cx="95" cy="474" rx="40" ry="7" fill="#3B2A1A" opacity="0.2" />
      <g className="habitat-sway" style={{ transformOrigin: '95px 412px' }}>
        <path d="M95 412 C88 380 70 362 52 352" stroke="#4E7A3A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M95 412 C99 372 112 346 130 330" stroke="#4E7A3A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M95 412 C94 382 92 356 94 330" stroke="#4E7A3A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M52 352 C38 330 48 312 70 318 C82 334 72 350 52 352Z" fill="#7FB56A" stroke="#4E7A3A" strokeWidth="2" />
        <path d="M130 330 C136 306 158 304 162 322 C152 340 140 340 130 330Z" fill="#8FC46A" stroke="#4E7A3A" strokeWidth="2" />
        <path d="M94 330 C80 312 86 290 100 288 C114 296 110 318 94 330Z" fill="#7FB56A" stroke="#4E7A3A" strokeWidth="2" />
        <path d="M74 380 C58 372 54 356 66 352 C80 356 82 370 74 380Z" fill="#8FC46A" stroke="#4E7A3A" strokeWidth="2" />
        <path d="M115 372 C128 360 144 362 142 374 C134 384 122 382 115 372Z" fill="#7FB56A" stroke="#4E7A3A" strokeWidth="2" />
        <path d="M60 328 C64 324 70 322 75 323 M139 318 C144 314 150 313 154 315 M92 304 C95 299 99 296 103 296" stroke="#C6E3AE" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <path d="M64 410 L126 410 L118 472 L72 472Z" fill="#D07B57" stroke="#9E5536" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="60" y="404" width="70" height="14" rx="5" fill="#DE8C66" stroke="#9E5536" strokeWidth="2.5" />
      <path d="M78 432 C88 438 102 438 112 432" stroke="#F0B595" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Rug() {
  const rings: [number, number, string][] = [
    [192, 46, '#D98C6A'],
    [172, 40, '#F3D9B5'],
    [148, 33, '#8FB573'],
    [124, 27, '#F3D9B5'],
    [96, 20, '#E9A88E'],
    [60, 12, '#F7E2C2'],
  ];
  return (
    <g>
      {[-1, 1].map((side) =>
        [-14, -6, 2, 10].map((dy) => (
          <path key={`${side}${dy}`} d={`M${400 + side * 190} ${440 + dy} l${side * 12} ${dy * 0.15}`} stroke="#C97A58" strokeWidth="3" strokeLinecap="round" />
        )),
      )}
      <ellipse cx="400" cy="446" rx="196" ry="48" fill="#3B2A1A" opacity="0.15" />
      {rings.map(([rx, ry, fill], i) => (
        <ellipse key={i} cx="400" cy="440" rx={rx} ry={ry} fill={fill} />
      ))}
      {rings.slice(0, 5).map(([rx, ry], i) => (
        <ellipse key={`s${i}`} cx="400" cy="440" rx={rx - 7} ry={ry - 3.5} fill="none" stroke="#FFF6E6" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.55" />
      ))}
    </g>
  );
}

function Basket() {
  return (
    <g>
      <ellipse cx="690" cy="470" rx="80" ry="12" fill="#3B2A1A" opacity="0.2" />
      <path d="M612 432 C612 470 650 476 690 476 C730 476 768 470 768 432Z" fill="#D1A06A" stroke="#8F6235" strokeWidth="2.5" />
      {[630, 650, 670, 690, 710, 730, 750].map((x) => (
        <path key={x} d={`M${x} 436 C${x - 2} 452 ${x} 464 ${x + 2} 472`} stroke="#A9783F" strokeWidth="2" fill="none" />
      ))}
      <path d="M616 448 C650 456 730 456 764 448 M622 462 C660 468 720 468 758 462" stroke="#A9783F" strokeWidth="2" fill="none" />
      <ellipse cx="690" cy="432" rx="78" ry="16" fill="#E2B57E" stroke="#8F6235" strokeWidth="2.5" />
      <ellipse cx="690" cy="430" rx="64" ry="11" fill="#F1C7CF" />
      <path d="M640 428 C660 410 700 414 724 426 C740 434 748 446 742 462 C716 470 676 466 650 452 C640 446 636 436 640 428Z" fill="#9FC3E6" stroke="#5F8DB8" strokeWidth="2" />
      <path d="M660 420 L676 458 M690 418 L700 464 M716 424 L722 462 M646 440 L742 444" stroke="#C9DEF2" strokeWidth="3" opacity="0.8" />
    </g>
  );
}

function Bowl({ full }: { full: boolean }) {
  return (
    <g>
      <ellipse cx="250" cy="466" rx="36" ry="7" fill="#3B2A1A" opacity="0.2" />
      {full && (
        <g>
          <ellipse cx="250" cy="446" rx="24" ry="9" fill="#E8B46E" />
          <circle cx="240" cy="442" r="6" fill="#D24D6E" stroke="#8E2B47" strokeWidth="1.2" />
          <circle cx="251" cy="439" r="6" fill="#9466C4" stroke="#5F3E8E" strokeWidth="1.2" />
          <circle cx="261" cy="443" r="5.5" fill="#D24D6E" stroke="#8E2B47" strokeWidth="1.2" />
          <circle cx="238" cy="440" r="1.6" fill="#F7A8BA" />
          <circle cx="249" cy="437" r="1.6" fill="#C9A9EA" />
        </g>
      )}
      <path d="M214 448 C214 464 230 470 250 470 C270 470 286 464 286 448Z" fill="#8EC5E8" stroke="#4F8FBF" strokeWidth="2.5" />
      <ellipse cx="250" cy="448" rx="36" ry="9" fill={full ? 'none' : '#6AA9D2'} stroke="#4F8FBF" strokeWidth="2.5" />
      <path d="M232 456 C240 462 260 462 268 456" stroke="#D5EBF8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="250" cy="461" r="2.3" fill="#fff" opacity="0.8" />
      <circle cx="246" cy="458" r="1.2" fill="#fff" opacity="0.8" />
      <circle cx="254" cy="458" r="1.2" fill="#fff" opacity="0.8" />
    </g>
  );
}

function DriedFlowers() {
  return (
    <g>
      <path d="M318 24 V52" stroke="#6E4527" strokeWidth="1.5" />
      {[-12, -6, 0, 6, 12].map((dx, i) => (
        <g key={dx}>
          <path d={`M318 58 L${318 + dx * 1.4} 118`} stroke="#7F9A5A" strokeWidth="2" strokeLinecap="round" />
          {[0, 1, 2, 3].map((k) => (
            <ellipse key={k} cx={318 + dx * 1.4 * ((70 + k * 12) / 60) * 0.86} cy={104 + k * 6 - (i % 2) * 4} rx="3" ry="4.5" fill={i % 2 ? '#B49BD8' : '#E6A3B9'} />
          ))}
        </g>
      ))}
      <path d="M309 56 C314 62 322 62 327 56 L325 64 C320 66 316 66 311 64Z" fill="#E8836B" />
    </g>
  );
}

function Bunting() {
  const p0: [number, number] = [470, 40];
  const p1: [number, number] = [602, 108];
  const p2: [number, number] = [736, 60];
  const flags = Array.from({ length: 9 }, (_, i) => 0.07 + (i * 0.86) / 8);
  return (
    <g>
      <path d={`M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`} stroke="#8E5E35" strokeWidth="1.8" fill="none" />
      {flags.map((t, i) => {
        const [x, y] = quad(t, p0, p1, p2);
        return <path key={i} d={`M${x - 10} ${y} L${x + 10} ${y + 1} L${x} ${y + 22}Z`} fill={BUNTING_COLORS[i % BUNTING_COLORS.length]} stroke="#8E5E35" strokeWidth="1" strokeLinejoin="round" />;
      })}
    </g>
  );
}

export function Habitat({ keepsakes, timeOfDay, reducedMotion, children, bowl, className, label }: HabitatProps) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = { sky: `${raw}-sky`, windowClip: `${raw}-win`, lampGlow: `${raw}-glow`, beam: `${raw}-beam`, vignette: `${raw}-vig`, tint: `${raw}-tint` };
  const sky = SKY[timeOfDay];
  const tint = TINT[timeOfDay];
  const beam = timeOfDay !== 'night';
  const classes = ['habitat', `habitat--${timeOfDay}`, reducedMotion ? 'habitat--still' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes} role="region" aria-label={label ?? 'Your kinling’s cozy hollow'}>
      <svg className="habitat__bg" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[0]} />
            <stop offset="0.55" stopColor={sky[1]} />
            <stop offset="1" stopColor={sky[2]} />
          </linearGradient>
          <clipPath id={ids.windowClip}>
            <circle cx="205" cy="175" r="66" />
          </clipPath>
          <radialGradient id={ids.lampGlow}>
            <stop offset="0" stopColor="#FFE1A0" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="#FFC56E" stopOpacity="0.38" />
            <stop offset="1" stopColor="#FFB050" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.beam} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF6D8" stopOpacity="0.5" />
            <stop offset="1" stopColor="#FFF6D8" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={ids.tint} cx="0.5" cy="0.3" r="0.72">
            <stop offset="0.12" stopColor={tint.color} stopOpacity={tint.near} />
            <stop offset="0.55" stopColor={tint.color} stopOpacity={(tint.near + tint.far) / 2} />
            <stop offset="1" stopColor={tint.color} stopOpacity={tint.far} />
          </radialGradient>
          <radialGradient id={ids.vignette} cx="0.5" cy="0.55" r="0.75">
            <stop offset="0.6" stopColor="#3B2A1A" stopOpacity="0" />
            <stop offset="1" stopColor="#3B2A1A" stopOpacity="0.28" />
          </radialGradient>
        </defs>

        {/* back wall with wood grain */}
        <rect width="800" height="500" fill="#EBCB9F" />
        {[60, 120, 175, 235, 300, 360, 430, 490, 555, 615, 680, 740].map((x, i) => (
          <path key={x} d={`M${x} 0 C${x + (i % 2 ? 8 : -8)} 120 ${x + (i % 2 ? -6 : 6)} 250 ${x} 380`} stroke="#D9B485" strokeWidth="2" fill="none" opacity="0.6" />
        ))}
        <ellipse cx="470" cy="300" rx="7" ry="11" fill="none" stroke="#D2A877" strokeWidth="2" opacity="0.7" />
        <ellipse cx="120" cy="320" rx="5" ry="8" fill="none" stroke="#D2A877" strokeWidth="2" opacity="0.7" />

        {/* floor */}
        <path d="M0 384 Q400 354 800 384 L800 500 L0 500Z" fill="#C48E5A" />
        <path d="M0 384 Q400 354 800 384" stroke="#A9734A" strokeWidth="6" fill="none" />
        {[-420, -260, -120, 0, 120, 260, 420].map((dx) => (
          <path key={dx} d={`M${400 + dx * 0.55} 372 L${400 + dx * 1.4} 500`} stroke="#AD7849" strokeWidth="2" opacity="0.7" />
        ))}
        <path d="M0 430 Q400 410 800 430" stroke="#AD7849" strokeWidth="2" fill="none" opacity="0.5" />

        <Window time={timeOfDay} ids={ids} />
        {beam && <path d="M150 128 L262 112 L520 486 L300 494Z" fill={`url(#${ids.beam})`} opacity={timeOfDay === 'evening' ? 0.5 : 0.8} />}
        {beam &&
          [
            [230, 210],
            [262, 268],
            [300, 330],
            [330, 252],
            [356, 400],
            [290, 400],
            [405, 360],
          ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.5} fill="#FFF8E2" className="habitat-mote" style={{ animationDelay: `${i * 0.9}s` }} />)}

        <DriedFlowers />
        <Bunting />
        <Shelf keepsakes={keepsakes} />
        <Plant />
        <Basket />
        <Rug />
        {bowl && <Bowl full={bowl === 'full'} />}

        {/* time-of-day tint, then warm lamp light on top */}
        {tint.far > 0 && <rect width="800" height="500" fill={`url(#${ids.tint})`} style={{ mixBlendMode: 'multiply' }} />}
        <Lamp glow={LAMP_GLOW[timeOfDay]} ids={ids} />

        {/* the hollow's bark rim */}
        <path
          d="M0 0 H800 V500 H0Z M34 500 V178 C34 70 196 22 400 22 C604 22 766 70 766 178 V500Z"
          fill="#7A5236"
          fillRule="evenodd"
        />
        <path d="M34 500 V178 C34 70 196 22 400 22 C604 22 766 70 766 178 V500" stroke="#A3734B" strokeWidth="5" fill="none" />
        <path d="M12 120 C18 220 14 330 20 470 M786 110 C780 220 786 330 780 470 M140 10 C230 4 320 2 400 4 M470 4 C560 4 640 8 700 14" stroke="#5E3D27" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
        <rect width="800" height="500" fill={`url(#${ids.vignette})`} />
      </svg>
      <div className="habitat__stage">{children}</div>
    </div>
  );
}
