import { useEffect, useState } from 'react';
import type { MotionPref } from '../game/types';

function systemPrefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Resolve the player's motion setting against the OS preference. */
export function useReducedMotion(pref: MotionPref | undefined): boolean {
  const [system, setSystem] = useState(systemPrefersReduced);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return system;
}
