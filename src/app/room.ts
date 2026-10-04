// Runs the home room while it is on screen: kinlings wander at 10 Hz, and
// when two linger together they hold a conversation. Positions live only
// here (never saved); each conversation is saved the moment it starts and
// then played back line by line as speech bubbles.
import { useEffect, useSyncExternalStore } from 'react';
import { holdConversation } from '../game/chatter';
import type { ConversationLog } from '../game/types';
import { beginTalk, cooledDown, detectEncounter, endTalk, newEncounters, type EncounterState } from '../room/encounters';
import { furnitureNear } from '../room/layout';
import { createRoom, placeTogether, stepRoom, type RoomState } from '../room/sim';
import { store } from './store';
import { ui } from './ui';

export const ROOM_HZ = 10;
/** How long each conversation line stays up. */
export const LINE_MS = 2600;

export interface Talk {
  log: ConversationLog;
  /** Index of the line showing now. */
  index: number;
}

export interface RoomSnapshot {
  room: RoomState | null;
  talk: Talk | null;
}

class RoomController {
  private snapshot: RoomSnapshot = { room: null, talk: null };
  private enc: EncounterState = newEncounters();
  private nextLineAt = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private users = 0;
  private rand = Math.random;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.snapshot;

  private emit(p: Partial<RoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...p };
    for (const l of this.listeners) l();
  }

  /** Start simulating while at least one room view is mounted. */
  acquire(): () => void {
    this.users += 1;
    const save = store.save;
    if (!this.snapshot.room && save?.kinlings.length) this.emit({ room: createRoom(save, this.rand) });
    if (!this.timer) this.timer = setInterval(() => this.tick(Date.now()), 1000 / ROOM_HZ);
    return () => {
      this.users -= 1;
      if (this.users > 0 || !this.timer) return;
      clearInterval(this.timer);
      this.timer = null;
      this.finishTalk();
    };
  }

  tick(now: number): void {
    // Paused while the tab is hidden: nothing moves and nobody talks.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const save = store.save;
    if (!save?.kinlings.length) return;
    let room = this.snapshot.room ?? createRoom(save, this.rand);
    room = stepRoom(room, save, 1 / ROOM_HZ, this.rand);
    let talk = this.snapshot.talk;

    if (talk) {
      if (now >= this.nextLineAt) {
        if (talk.index + 1 < talk.log.lines.length) {
          talk = { ...talk, index: talk.index + 1 };
          this.nextLineAt = now + LINE_MS;
        } else {
          ({ room, enc: this.enc } = endTalk(room, this.enc, this.rand));
          talk = null;
        }
      }
    } else if (store.canWrite && save.onboarding.step === 'done') {
      const found = detectEncounter(room, this.enc, save, 1 / ROOM_HZ, now);
      this.enc = found.enc;
      if (found.start) {
        const [a, b] = found.start;
        const ka = room.kinlings.find((k) => k.id === a)!;
        const kb = room.kinlings.find((k) => k.id === b)!;
        const held = holdConversation(save, a, b, { near: furnitureNear((ka.x + kb.x) / 2, (ka.y + kb.y) / 2), now, rand: this.rand });
        if (held && store.update(() => held.save)) {
          // The conversation's bubbles take over from anything the selected kinling was saying.
          if (save.activeKinlingId === a || save.activeKinlingId === b) ui.hush();
          room = beginTalk(room, a, b);
          talk = { log: held.log, index: 0 };
          this.nextLineAt = now + LINE_MS;
        } else {
          this.enc = newEncounters();
        }
      }
    }
    this.emit({ room, talk });
  }

  private finishTalk() {
    if (!this.snapshot.talk || !this.snapshot.room) return;
    const { room, enc } = endTalk(this.snapshot.room, this.enc, this.rand);
    this.enc = enc;
    this.emit({ room, talk: null });
  }

  /**
   * Dev/e2e hook: stand two kinlings side by side so they start talking. With
   * no ids, picks two who are free to talk. Returns the pair, or null.
   */
  placeTogether(aId?: string, bId?: string): [string, string] | null {
    const room = this.snapshot.room;
    const save = store.save;
    if (!room || !save || this.snapshot.talk) return null;
    let pair: [string, string] | null = aId && bId ? [aId, bId] : null;
    if (!pair) {
      const ids = save.kinlings.map((k) => k.id);
      for (let i = 0; i < ids.length && !pair; i++) for (let j = i + 1; j < ids.length && !pair; j++) if (cooledDown(save, ids[i]!, ids[j]!, Date.now())) pair = [ids[i]!, ids[j]!];
    }
    if (!pair || !pair.every((id) => room.kinlings.some((k) => k.id === id))) return null;
    this.emit({ room: placeTogether(room, pair[0], pair[1]) });
    return pair;
  }
}

export const roomController = new RoomController();

export function useRoom(): RoomSnapshot {
  useEffect(() => roomController.acquire(), []);
  return useSyncExternalStore(roomController.subscribe, roomController.getSnapshot, roomController.getSnapshot);
}

// Only exposed in development, or when the page is opened with ?e2e for browser tests.
if (typeof window !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(window.location.search).has('e2e'))) {
  (window as unknown as { kinlingRoom: RoomController }).kinlingRoom = roomController;
}
