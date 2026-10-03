// Tiny synthesized sound effects (no audio files needed). Respects settings.
import type { SfxId } from '../game/outcome';

let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;
// Browsers only allow audio after a user gesture; stay silent until then.
let gestured = false;
if (typeof window !== 'undefined') {
  const unlock = () => {
    gestured = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol));
}

function audio(): AudioContext | null {
  if (!enabled || !gestured || typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * volume, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.08, filterFreq = 1800) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = gain * volume;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export function playSfx(id: SfxId | undefined) {
  if (!id || !enabled) return;
  switch (id) {
    case 'munch':
      noise(0, 0.08, 0.12, 900);
      noise(0.14, 0.08, 0.12, 1100);
      noise(0.28, 0.08, 0.1, 800);
      break;
    case 'boing':
      tone(220, 0, 0.25, 'sine', 0.25, 660);
      tone(330, 0.18, 0.2, 'triangle', 0.15, 880);
      break;
    case 'brush':
      noise(0, 0.2, 0.06, 3000);
      noise(0.22, 0.2, 0.06, 3400);
      break;
    case 'snooze':
      tone(392, 0, 0.35, 'sine', 0.12, 330);
      tone(330, 0.3, 0.45, 'sine', 0.1, 262);
      break;
    case 'chime':
      tone(784, 0, 0.3, 'sine', 0.15);
      tone(1047, 0.1, 0.4, 'sine', 0.12);
      break;
    case 'pop':
      tone(600, 0, 0.08, 'triangle', 0.2, 300);
      break;
    case 'collect':
      tone(880, 0, 0.09, 'triangle', 0.14);
      tone(1320, 0.06, 0.12, 'triangle', 0.12);
      break;
    case 'bonk':
      tone(180, 0, 0.15, 'square', 0.08, 90);
      break;
    case 'sparkle':
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.25, 'sine', 0.1));
      break;
    case 'error':
      tone(300, 0, 0.12, 'triangle', 0.1, 220);
      break;
  }
}
