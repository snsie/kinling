// Small rounded line icons for the interface (24x24, currentColor).
import type { ReactNode } from 'react';

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Icon = {
  feed: (s?: number) => (
    <Svg size={s}>
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M9 7c0-2 1-3 3-3M12 7c.5-1.5 2-2.5 3.5-2" />
    </Svg>
  ),
  groom: (s?: number) => (
    <Svg size={s}>
      <rect x="4" y="4" width="16" height="6" rx="3" />
      <path d="M7 10v6M10 10v8M13 10v8M16 10v6" />
    </Svg>
  ),
  rest: (s?: number) => (
    <Svg size={s}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </Svg>
  ),
  play: (s?: number) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="8" />
      <path d="M5 9c4 1.5 10 1.5 14 0M5 15c4-1.5 10-1.5 14 0" />
    </Svg>
  ),
  talk: (s?: number) => (
    <Svg size={s}>
      <path d="M5 18l-1 3 4-2h8a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v6c0 1.2.4 2.2 1 3Z" />
      <path d="M9 11h.01M12 11h.01M15 11h.01" />
    </Svg>
  ),
  explore: (s?: number) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </Svg>
  ),
  bag: (s?: number) => (
    <Svg size={s}>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </Svg>
  ),
  evolve: (s?: number) => (
    <Svg size={s}>
      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3Z" />
      <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </Svg>
  ),
  diary: (s?: number) => (
    <Svg size={s}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
      <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
    </Svg>
  ),
  settings: (s?: number) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </Svg>
  ),
  send: (s?: number) => (
    <Svg size={s}>
      <path d="M4 12l16-8-6 16-2-6-8-2Z" />
    </Svg>
  ),
  stop: (s?: number) => (
    <Svg size={s}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </Svg>
  ),
  pin: (s?: number) => (
    <Svg size={s}>
      <path d="M9 4h6l-1 5 3 3H7l3-3-1-5ZM12 12v8" />
    </Svg>
  ),
  trash: (s?: number) => (
    <Svg size={s}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  lock: (s?: number) => (
    <Svg size={s}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  undo: (s?: number) => (
    <Svg size={s}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  ),
  check: (s?: number) => (
    <Svg size={s}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  ),
  clock: (s?: number) => (
    <Svg size={s}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M10 2h4" />
    </Svg>
  ),
  pause: (s?: number) => (
    <Svg size={s}>
      <path d="M9 5v14M15 5v14" />
    </Svg>
  ),
  home: (s?: number) => (
    <Svg size={s}>
      <path d="M4 11l8-7 8 7v9H4v-9Z" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  ),
  egg: (s?: number) => (
    <Svg size={s}>
      <path d="M12 3c3.6 0 7 5.4 7 10a7 7 0 0 1-14 0c0-4.6 3.4-10 7-10Z" />
      <path d="M8.5 13.5l2 1.5 2-2 2 2" />
    </Svg>
  ),
  chip: (s?: number) => (
    <Svg size={s}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </Svg>
  ),
  arrow: (dir: 'up' | 'down' | 'left' | 'right', s?: number) => {
    const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
    return (
      <Svg size={s}>
        <g transform={`rotate(${rot} 12 12)`}>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </g>
      </Svg>
    );
  },
};
