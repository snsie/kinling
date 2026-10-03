// Procedural SVG icons for materials, foods, keepsakes and the golden find.
// Every glyph is drawn inside a 32x32 box with flat fills (no gradients), so
// many copies can live on one page without id clashes.
import type { JSX } from 'react';
import type { FoodId, KeepsakeId, MaterialId } from '../game/types';

export type ItemKind = MaterialId | FoodId | KeepsakeId | 'golden';

const LINE = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Four-point sparkle path centered on (cx, cy). */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

/** Rounded five-point star path. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}

function Leaf() {
  return (
    <g {...LINE}>
      <path d="M5.5 27 L9 23.5" stroke="#6B4A2B" strokeWidth="1.8" />
      <path d="M8 24.5 C7 14 14 5.5 26.5 5.5 C27 17.5 19.5 26 8 24.5Z" fill="#8CC66A" stroke="#4E8A39" strokeWidth="1.5" />
      <path d="M8.5 24 C13.5 18.5 18.5 13.5 24.5 7.5" stroke="#4E8A39" strokeWidth="1.2" fill="none" />
      <path d="M13 19.5 L12.2 14.8 M17 15.6 L16.6 10.6 M14.6 18 L19.4 18 M18.6 14.2 L23 13.6" stroke="#5E9A45" strokeWidth="1" fill="none" />
      <path d="M11.5 12.5 C13.5 10 16.5 8.4 20 7.8" stroke="#D3EFB4" strokeWidth="1.4" fill="none" opacity="0.9" />
    </g>
  );
}

const PETAL_PATH = 'M16 29 C10 25.6 7 18 8 10.6 C8.6 6.6 11.6 5 14.2 6.4 L16 8 L17.8 6.4 C20.4 5 23.4 6.6 24 10.6 C25 18 22 25.6 16 29Z';

function Petal() {
  return (
    <g {...LINE}>
      <g transform="rotate(-28 16 16)">
        <path d={PETAL_PATH} fill="#F7A9C0" stroke="#C9668A" strokeWidth="1.5" />
      <path d="M16 10.5 C15.4 16 15.6 21.5 16 26" stroke="#E487A6" strokeWidth="1.1" fill="none" />
      <path d="M13 13.5 L15.2 17 M19 13.5 L16.8 17" stroke="#E99AB4" strokeWidth="0.9" fill="none" />
      <path d="M9.4 11.6 C9.2 9.4 10.4 7.8 12 7.6" stroke="#FFE3EC" strokeWidth="1.6" fill="none" />
      </g>
    </g>
  );
}

function Pebble() {
  return (
    <g {...LINE}>
      <ellipse cx="16" cy="25" rx="10" ry="2.2" fill="#000" opacity="0.08" />
      <path d="M5 19 C5 12.5 10.5 9 16.5 9 C23 9 27.5 12.5 27.5 18 C27.5 23 22.5 25.5 16 25.5 C9.5 25.5 5 23.5 5 19Z" fill="#BDB4AA" stroke="#7D746B" strokeWidth="1.5" />
      <circle cx="19.5" cy="19.5" r="0.9" fill="#958B80" />
      <circle cx="12" cy="21" r="0.7" fill="#958B80" />
      <circle cx="22.5" cy="15.5" r="0.6" fill="#958B80" />
      <path d="M9 15.5 C10.5 12.8 13.4 11.6 16.4 11.5" stroke="#EAE4DD" strokeWidth="1.6" fill="none" />
    </g>
  );
}

function Shell() {
  return (
    <g {...LINE}>
      <path d="M12.5 24 L19.5 24 L19 27.5 L13 27.5Z" fill="#E9C391" stroke="#B98A57" strokeWidth="1.2" />
      <path d="M16 25 L5.5 15.5 C5.5 8.5 10.5 5.5 16 5.5 C21.5 5.5 26.5 8.5 26.5 15.5Z" fill="#F7DDB8" stroke="#B98A57" strokeWidth="1.5" />
      <path d="M16 24.5 L9 10 M16 24.5 L12.5 7.2 M16 24.5 L16 6.2 M16 24.5 L19.5 7.2 M16 24.5 L23 10" stroke="#D3A877" strokeWidth="1.1" fill="none" />
      <path d="M8.2 12 C9.5 9.2 11.8 7.6 14 7" stroke="#FFF4E2" strokeWidth="1.4" fill="none" />
    </g>
  );
}

function Reed() {
  return (
    <g {...LINE}>
      <path d="M16 29 C16.5 22 16.6 14 17 3.5" stroke="#5E9A45" strokeWidth="1.8" fill="none" />
      <path d="M15.6 29 C11 25 8 19 7.5 12 C10.5 17 13 21 16 24.5Z" fill="#8CC66A" stroke="#4E8A39" strokeWidth="1.2" />
      <path d="M16.4 29 C20.5 26 23.5 22 24.5 17 C21.5 20.5 19 22.5 16.5 24.5Z" fill="#8CC66A" stroke="#4E8A39" strokeWidth="1.2" />
      <rect x="13.6" y="7.5" width="6.4" height="12.5" rx="3.2" fill="#8C5A35" stroke="#5E3A20" strokeWidth="1.4" />
      <path d="M15.4 10 L15.4 16.5" stroke="#B07A4E" strokeWidth="1.3" />
    </g>
  );
}

function Dewdrop() {
  return (
    <g {...LINE}>
      <path d="M16 4 C16 4 25.5 14.5 25.5 20 A9.5 9.5 0 0 1 6.5 20 C6.5 14.5 16 4 16 4Z" fill="#8ED4F2" stroke="#3E8DB8" strokeWidth="1.5" />
      <path d="M20.5 22.5 C19.8 24.6 18.2 25.8 16.2 26" stroke="#5FB3DD" strokeWidth="1.4" fill="none" />
      <ellipse cx="12.3" cy="18.6" rx="1.9" ry="3" fill="#fff" opacity="0.85" transform="rotate(20 12.3 18.6)" />
      <circle cx="13.6" cy="23.2" r="0.9" fill="#fff" opacity="0.7" />
    </g>
  );
}

function Stardust() {
  return (
    <g {...LINE}>
      <path d={sparkle(13.5, 16.5, 9.5)} fill="#F7D66B" stroke="#C99A2E" strokeWidth="1.3" />
      <path d={sparkle(24, 8.5, 4.6)} fill="#F9E39A" stroke="#C99A2E" strokeWidth="1.1" />
      <path d={sparkle(24.5, 23.5, 3.6)} fill="#F9E39A" stroke="#C99A2E" strokeWidth="1" />
      <circle cx="13.5" cy="16.5" r="1.6" fill="#FFF8D8" />
      <circle cx="6" cy="7" r="1" fill="#E3B84A" />
      <circle cx="28" cy="15.5" r="0.9" fill="#E3B84A" />
    </g>
  );
}

function SeedBun() {
  return (
    <g {...LINE}>
      <ellipse cx="16" cy="25.2" rx="12" ry="2.3" fill="#000" opacity="0.08" />
      <path d="M4 21 C4 11.5 9.5 8.5 16 8.5 C22.5 8.5 28 11.5 28 21 C28 24 23 24.8 16 24.8 C9 24.8 4 24 4 21Z" fill="#E8B46E" stroke="#A6733A" strokeWidth="1.5" />
      <path d="M5.5 20.5 C9 22.3 23 22.3 26.5 20.5" stroke="#C98E4B" strokeWidth="1.1" fill="none" />
      <path d="M8.6 14.8 C10.2 11.8 13 10.6 16 10.4" stroke="#F8D9A8" strokeWidth="1.7" fill="none" />
      {[
        [12, 15, 20],
        [17, 13.5, -15],
        [21.5, 16, 35],
        [15, 18, -30],
        [19.5, 19.2, 10],
        [10.5, 18.8, 60],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.4" ry="0.75" fill="#FFF3D6" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </g>
  );
}

function Dewberry() {
  const beads: [number, number][] = [
    [12, 15.5],
    [16, 14.5],
    [20, 15.5],
    [10, 19.5],
    [14, 19.2],
    [18, 19.2],
    [22, 19.5],
    [12.2, 23.4],
    [16, 24.4],
    [19.8, 23.4],
  ];
  return (
    <g {...LINE}>
      {beads.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#D24D6E" stroke="#8E2B47" strokeWidth="1.1" />
      ))}
      {beads.map(([x, y], i) => (
        <circle key={`h${i}`} cx={x - 1.1} cy={y - 1.1} r="0.9" fill="#F7A8BA" />
      ))}
      <path d="M16 12.5 L11.5 9 L14.5 10.4 L16 6.5 L17.5 10.4 L20.5 9Z" fill="#79B85A" stroke="#3F7A31" strokeWidth="1.1" />
      <path d="M16 7 C16.5 5 17.5 3.8 19 3.2" stroke="#5E8A3A" strokeWidth="1.4" fill="none" />
    </g>
  );
}

function Clover() {
  const florets: [number, number][] = [
    [16, 6.5],
    [12.6, 8.6],
    [19.4, 8.6],
    [11.8, 12.4],
    [20.2, 12.4],
    [14.2, 14.6],
    [17.8, 14.6],
    [16, 10.8],
  ];
  return (
    <g {...LINE}>
      <path d="M16 16 C15.6 21 16.2 25.5 17 29" stroke="#4E8A39" strokeWidth="1.8" fill="none" />
      <ellipse cx="10.5" cy="22" rx="5.2" ry="2.8" fill="#7CC27A" stroke="#3F8A45" strokeWidth="1.2" transform="rotate(-25 10.5 22)" />
      <ellipse cx="22" cy="23.5" rx="5" ry="2.7" fill="#7CC27A" stroke="#3F8A45" strokeWidth="1.2" transform="rotate(25 22 23.5)" />
      <path d="M7.5 23 L12.5 21 M19.5 22.8 L24.5 24.4" stroke="#BDE6AF" strokeWidth="0.9" />
      {florets.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#F5C2D6" stroke="#C77FA0" strokeWidth="1" />
      ))}
      <circle cx="14.6" cy="8" r="1" fill="#fff" opacity="0.8" />
    </g>
  );
}

function PondPlum() {
  return (
    <g {...LINE}>
      <circle cx="16" cy="18.5" r="10" fill="#9466C4" stroke="#5F3E8E" strokeWidth="1.5" />
      <path d="M16 9 C13.5 13 13.5 22 16.5 28" stroke="#7A51AA" strokeWidth="1.2" fill="none" />
      <ellipse cx="11.6" cy="15" rx="2.2" ry="3.2" fill="#C9A9EA" opacity="0.9" transform="rotate(25 11.6 15)" />
      <path d="M16 9 C16.2 7 16.8 5.6 18 4.5" stroke="#6B4A2B" strokeWidth="1.6" fill="none" />
      <path d="M17.6 6 C20.5 3.6 24.5 4 26 6.5 C23 8.5 20 8.4 17.6 6Z" fill="#79B85A" stroke="#3F7A31" strokeWidth="1.1" />
    </g>
  );
}

function Cress() {
  const stems = ['M16 27 C14.5 21 10.5 16.5 6 13.5', 'M16 27 C16 20 16 13.5 16.8 6.5', 'M16 27 C17.5 21 21.5 16.5 26 13.5'];
  const leaves: [number, number, number][] = [
    [6.4, 13.2, -30],
    [10.2, 16.4, 30],
    [8.8, 19.6, -20],
    [16.8, 6.8, 0],
    [13.8, 11, -40],
    [19.2, 12.2, 40],
    [25.6, 13.2, 30],
    [21.8, 16.4, -30],
    [23.2, 19.6, 20],
  ];
  return (
    <g {...LINE}>
      {stems.map((d, i) => (
        <path key={i} d={d} stroke="#5D8F3A" strokeWidth="1.3" fill="none" />
      ))}
      {leaves.map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx="3.1" ry="2.5" fill="#A3D46E" stroke="#5D8F3A" strokeWidth="1.1" />
          <ellipse cx={x - 0.9} cy={y - 0.7} rx="1" ry="0.7" fill="#D8F0BC" />
        </g>
      ))}
      <rect x="13" y="22.6" width="6" height="3" rx="1.3" fill="#E3A92F" stroke="#A9781A" strokeWidth="1" />
    </g>
  );
}

function StarDrop() {
  return (
    <g {...LINE}>
      <path d={star(16, 16.5, 12.5, 5.8)} fill="#FFCF5A" stroke="#C9922B" strokeWidth="1.6" />
      <path d={star(16, 16.5, 6.5, 3)} fill="#F7A8C8" opacity="0.85" />
      <path d="M10.5 12.6 L13.6 12.4" stroke="#FFF2C4" strokeWidth="1.6" />
      <path d={sparkle(26.5, 5.5, 2.8)} fill="#FFF2C4" stroke="#C9922B" strokeWidth="0.8" />
    </g>
  );
}

function Acorn() {
  return (
    <g {...LINE}>
      <path d="M8.6 15.5 C8.6 23 12 27.5 16 28.5 C20 27.5 23.4 23 23.4 15.5Z" fill="#DDA567" stroke="#8F5E2E" strokeWidth="1.5" />
      <path d="M11.5 18.5 C11.8 22 13.2 24.6 15 25.8" stroke="#F3CF9E" strokeWidth="1.5" fill="none" />
      <path d="M6.8 15.6 C6.8 10.2 10.8 7.8 16 7.8 C21.2 7.8 25.2 10.2 25.2 15.6 C21 17.4 11 17.4 6.8 15.6Z" fill="#9C6A3A" stroke="#6B4423" strokeWidth="1.5" />
      <path d="M9.5 11.8 L12.5 16.4 M13 9.4 L16.4 16.8 M17.2 8.6 L20.6 16.4 M21.4 9.8 L23.6 14.6 M8.4 14 L12 9.8 M11.4 16.4 L16.6 9 M15.6 16.9 L21.4 9.3 M20.4 16.6 L24.2 12.2" stroke="#7E522A" strokeWidth="0.9" />
      <path d="M16 8 C16.4 5.8 17.6 4.4 19.6 3.8" stroke="#6B4423" strokeWidth="1.7" fill="none" />
    </g>
  );
}

function LadybugButton() {
  const spots = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    return [16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6] as const;
  });
  return (
    <g {...LINE}>
      <circle cx="16" cy="16.5" r="12" fill="#000" opacity="0.08" />
      <circle cx="16" cy="16" r="12" fill="#E2524A" stroke="#9E2F2A" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="6.2" fill="#D8463F" stroke="#B83A34" strokeWidth="1" />
      {spots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.75" fill="#3B2A2A" />
      ))}
      {[
        [13.8, 13.8],
        [18.2, 13.8],
        [13.8, 18.2],
        [18.2, 18.2],
      ].map(([x, y], i) => (
        <circle key={`h${i}`} cx={x} cy={y} r="1.3" fill="#6E1F1C" />
      ))}
      <path d="M8.2 11.4 C9.4 8.8 11.6 7 14.2 6.4" stroke="#F6A39D" strokeWidth="1.5" fill="none" />
    </g>
  );
}

function FourLeafClover() {
  const leaflet = 'M0 0 C-2 -2.6 -6.6 -3.8 -6.6 -7.6 C-6.6 -10.4 -3 -11.4 0 -8.6 C3 -11.4 6.6 -10.4 6.6 -7.6 C6.6 -3.8 2 -2.6 0 0Z';
  return (
    <g {...LINE}>
      <path d="M16 15 C17 20 18.5 25 21.5 29" stroke="#3C8A3F" strokeWidth="1.8" fill="none" />
      {[45, 135, 225, 315].map((r) => (
        <g key={r} transform={`translate(16 14) rotate(${r})`}>
          <path d={leaflet} fill="#6DBF5F" stroke="#3C8A3F" strokeWidth="1.3" />
          <path d="M-2.6 -6.4 L0 -4.2 L2.6 -6.4" stroke="#C6EBB8" strokeWidth="1" fill="none" />
        </g>
      ))}
      <circle cx="16" cy="14" r="1.4" fill="#4E9E45" />
    </g>
  );
}

function Moonpetal() {
  return (
    <g {...LINE}>
      <circle cx="16" cy="16.5" r="15" fill="#DCE6FF" opacity="0.4" />
      <circle cx="16" cy="16.5" r="11.5" fill="#E8EEFF" opacity="0.6" />
      <g transform="rotate(-28 16 16)">
        <path d={PETAL_PATH} fill="#F6F6FF" stroke="#8D99D2" strokeWidth="1.5" />
        <path d="M18.8 13.4 A5 5 0 1 0 18.8 22.6 A4 4 0 1 1 18.8 13.4Z" fill="#C3CDF6" />
        <path d="M9.4 11.6 C9.2 9.4 10.4 7.8 12 7.6" stroke="#fff" strokeWidth="1.6" fill="none" />
      </g>
      <path d={sparkle(26.5, 4.5, 2.8)} fill="#fff" stroke="#8D99D2" strokeWidth="0.8" />
      <path d={sparkle(4.5, 24, 2)} fill="#fff" stroke="#8D99D2" strokeWidth="0.7" />
    </g>
  );
}

function SwirlShell() {
  return (
    <g {...LINE}>
      <ellipse cx="16" cy="26" rx="11" ry="2" fill="#000" opacity="0.08" />
      <path d="M5.5 22 C3.6 14 10.5 5.6 19.5 6.2 C27 6.8 29 16.5 22.8 21.2 C18.4 24.6 11 25.2 5.5 22Z" fill="#F5B9C4" stroke="#C47785" strokeWidth="1.5" />
      <path d="M19.5 6.4 C13.2 8.4 12.6 16.6 18.6 17 C23.2 17.2 23.6 11.4 20 11.2 C17.8 11.2 17.8 14.4 19.6 14.2" stroke="#C47785" strokeWidth="1.3" fill="none" />
      <path d="M5.6 21.8 C8.6 19.4 12 19.6 13.6 22.6 C11 24 7.8 23.6 5.6 21.8Z" fill="#FFF0E6" stroke="#C47785" strokeWidth="1.1" />
      <path d="M8.4 14.2 C9.6 11 12.2 8.6 15.4 7.6" stroke="#FFE6EC" strokeWidth="1.5" fill="none" />
    </g>
  );
}

function Feather({ vane, shaft, base, light }: { vane: string; shaft: string; base: string; light: string }) {
  return (
    <g {...LINE}>
      <path d="M8.5 27 C6.5 19 10 9 24.5 4 C26 13 22 23 11.5 25.5Z" fill={vane} stroke={shaft} strokeWidth="1.4" />
      <path d="M8.8 26.6 C7.8 23 8.8 20.5 10.8 19 C11.6 21.6 11.8 23.6 11.4 25.6Z" fill={base} />
      <path d="M17 13.5 L13.5 13 M20.2 10.6 L22.6 12.2 M16 18.4 L18.8 19.6" stroke={shaft} strokeWidth="1.1" />
      <path d="M6.5 29.5 C10.5 22 16 13 24.5 4.2" stroke={shaft} strokeWidth="1.5" fill="none" />
      <path d="M11.5 15.5 C13.5 11.4 16.5 8.6 20 6.8" stroke={light} strokeWidth="1.5" fill="none" />
    </g>
  );
}

function WishingStone() {
  return (
    <g {...LINE}>
      <ellipse cx="16" cy="26.5" rx="12" ry="2" fill="#000" opacity="0.08" />
      <path
        d="M3.5 17 C3.5 11.4 9 8 16 8 C23.4 8 28.5 11.4 28.5 16.6 C28.5 22.4 22.8 25.6 16 25.6 C8.8 25.6 3.5 22.6 3.5 17Z M16.4 12.2 C13.4 12.2 11.6 14.2 11.6 16.4 C11.6 18.6 13.6 20.2 16.4 20.2 C19.2 20.2 21.2 18.6 21.2 16.4 C21.2 14 19.2 12.2 16.4 12.2Z"
        fill="#9DB1BE"
        fillRule="evenodd"
        stroke="#607682"
        strokeWidth="1.5"
      />
      <path d="M12 15 C12.8 13.2 14.4 12.4 16.4 12.4 C18.6 12.4 20.4 13.6 21 15.4" stroke="#4E626D" strokeWidth="1.6" fill="none" />
      <path d="M6.6 14.6 C7.8 11.8 10.6 10.2 13.6 9.8" stroke="#E2ECF2" strokeWidth="1.6" fill="none" />
      <path d="M7 20.6 C9 22.4 12 23.2 14.6 23.2" stroke="#8399A7" strokeWidth="1.1" fill="none" />
      <circle cx="24" cy="20.4" r="0.8" fill="#7D93A1" />
      <circle cx="22.6" cy="12" r="0.6" fill="#7D93A1" />
    </g>
  );
}

function RiverPearl() {
  return (
    <g {...LINE}>
      <path d="M3.5 21 C6.5 27.5 25.5 27.5 28.5 21 C24 23.2 8 23.2 3.5 21Z" fill="#E7D6C2" stroke="#9F8A72" strokeWidth="1.3" />
      <circle cx="16" cy="15" r="8.2" fill="#F8F5FF" stroke="#A99BC9" strokeWidth="1.5" />
      <path d="M10.2 17.2 C11 20.4 13.6 22.2 16.6 22.2" stroke="#F2C6DA" strokeWidth="1.6" fill="none" />
      <path d="M21.6 11.6 C22.6 13.2 22.8 15 22.2 16.8" stroke="#BFD9F4" strokeWidth="1.6" fill="none" />
      <ellipse cx="13" cy="12" rx="2.3" ry="1.6" fill="#fff" transform="rotate(-30 13 12)" />
      <path d={sparkle(25.5, 6, 2.8)} fill="#fff" stroke="#A99BC9" strokeWidth="0.8" />
    </g>
  );
}

function StarlitFeather() {
  return (
    <g>
      <Feather vane="#E9DFFB" shaft="#B08A2A" base="#F7D66B" light="#FFFFFF" />
      <path d={sparkle(26, 18, 3.4)} fill="#F7D66B" stroke="#B08A2A" strokeWidth="0.9" />
      <path d={sparkle(6.5, 9.5, 2.6)} fill="#F7D66B" stroke="#B08A2A" strokeWidth="0.8" />
      <circle cx="16.5" cy="13" r="1" fill="#F7D66B" />
      <circle cx="13" cy="19.5" r="0.8" fill="#C9B6F2" />
    </g>
  );
}

function Golden() {
  return (
    <g {...LINE}>
      <circle cx="16" cy="16.5" r="10.5" fill="#F6C945" stroke="#B98A1F" strokeWidth="1.6" />
      <circle cx="16" cy="16.5" r="7.6" fill="#F9D86A" />
      <path d="M12.6 13.6 C12.6 11.2 14.2 10 16.2 10 C18.4 10 19.8 11.4 19.8 13.2 C19.8 15.6 16.4 15.8 16.4 18.4" stroke="#8A5F0E" strokeWidth="2.2" fill="none" />
      <circle cx="16.4" cy="22" r="1.4" fill="#8A5F0E" />
      <path d="M9.6 12.4 C10.4 10.4 11.8 9 13.6 8.2" stroke="#FFF3C2" strokeWidth="1.6" fill="none" />
      <path d={sparkle(27.5, 5, 3)} fill="#FFF3C2" stroke="#B98A1F" strokeWidth="0.9" />
      <path d={sparkle(4.5, 26.5, 2.4)} fill="#FFF3C2" stroke="#B98A1F" strokeWidth="0.8" />
    </g>
  );
}

const GLYPHS: Record<ItemKind, () => JSX.Element> = {
  leaf: Leaf,
  petal: Petal,
  pebble: Pebble,
  shell: Shell,
  reed: Reed,
  dewdrop: Dewdrop,
  stardust: Stardust,
  seedBun: SeedBun,
  dewberry: Dewberry,
  clover: Clover,
  pondPlum: PondPlum,
  cress: Cress,
  starDrop: StarDrop,
  'first-acorn': Acorn,
  'ladybug-button': LadybugButton,
  'four-leaf-clover': FourLeafClover,
  moonpetal: Moonpetal,
  'swirl-shell': SwirlShell,
  'kingfisher-feather': () => <Feather vane="#2F8FD8" shaft="#1D5E93" base="#F08C3A" light="#8FD0F7" />,
  'wishing-stone': WishingStone,
  'river-pearl': RiverPearl,
  'starlit-feather': StarlitFeather,
  golden: Golden,
};

/** A <g> drawing of the item inside a 32x32 box (0..32). Embeddable in other SVGs. */
export function ItemGlyph({ kind }: { kind: ItemKind }): JSX.Element {
  const Glyph = GLYPHS[kind] ?? Golden;
  return <Glyph />;
}

/** Standalone icon. If title is given it is role="img" with that label, else aria-hidden. */
export function ItemIcon({ kind, size = 28, title, className }: { kind: ItemKind; size?: number; title?: string; className?: string }): JSX.Element {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className ? `item-icon ${className}` : 'item-icon'} focusable="false" {...a11y}>
      <ItemGlyph kind={kind} />
    </svg>
  );
}
