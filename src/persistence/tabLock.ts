// Single-writer coordination across tabs. The tab holding the Web Lock may
// write; other tabs are read-only until they explicitly take over. A
// BroadcastChannel tells read-only tabs when fresh data was saved.

const LOCK_NAME = 'kinling-save-writer';
const CHANNEL = 'kinling-tabs';

export type TabRole = 'writer' | 'reader';

type Message = { type: 'saved'; revision: number } | { type: 'hello' } | { type: 'writer-here' } | { type: 'reset' };

export type TabEvent = { type: 'role'; role: TabRole } | { type: 'remote-saved'; revision: number } | { type: 'remote-reset' };

export class TabCoordinator {
  role: TabRole = 'reader';
  private release: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(event: TabEvent) => void>();
  readonly supported: boolean;

  constructor() {
    this.supported = typeof navigator !== 'undefined' && !!navigator.locks;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<Message>) => this.onMessage(e.data);
    }
  }

  on(listener: (event: TabEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TabEvent) {
    for (const l of this.listeners) l(event);
  }

  private onMessage(msg: Message) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'saved') this.emit({ type: 'remote-saved', revision: msg.revision });
    if (msg.type === 'reset') this.emit({ type: 'remote-reset' });
    if (msg.type === 'hello' && this.role === 'writer') this.channel?.postMessage({ type: 'writer-here' } satisfies Message);
  }

  /** Try to become the writer without waiting. Returns the resulting role. */
  async acquire(steal = false): Promise<TabRole> {
    if (!this.supported) {
      // Without Web Locks, fall back to asking other tabs (best effort) and
      // rely on revision checks in storage to catch any remaining conflict.
      const other = await this.probeForWriter();
      this.setRole(other && !steal ? 'reader' : 'writer');
      return this.role;
    }
    return new Promise<TabRole>((resolve) => {
      const options: LockOptions = steal ? { steal: true } : { ifAvailable: true };
      navigator.locks
        .request(LOCK_NAME, options, (lock) => {
          if (!lock) {
            this.setRole('reader');
            resolve('reader');
            return undefined;
          }
          this.setRole('writer');
          resolve('writer');
          // Hold the lock until released or stolen.
          return new Promise<void>((done) => {
            this.release = done;
          });
        })
        .catch(() => {
          // Our lock was stolen by another tab.
          this.release = null;
          this.setRole('reader');
          resolve('reader');
        });
    });
  }

  private probeForWriter(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.channel) return resolve(false);
      const ch = this.channel;
      let found = false;
      const handler = (e: MessageEvent<Message>) => {
        if (e.data?.type === 'writer-here') found = true;
      };
      ch.addEventListener('message', handler);
      ch.postMessage({ type: 'hello' } satisfies Message);
      setTimeout(() => {
        ch.removeEventListener('message', handler);
        resolve(found);
      }, 250);
    });
  }

  private setRole(role: TabRole) {
    if (this.role === role) return;
    this.role = role;
    this.emit({ type: 'role', role });
  }

  announceSaved(revision: number) {
    this.channel?.postMessage({ type: 'saved', revision } satisfies Message);
  }

  announceReset() {
    this.channel?.postMessage({ type: 'reset' } satisfies Message);
  }

  dispose() {
    this.release?.();
    this.release = null;
    this.channel?.close();
    this.listeners.clear();
  }
}
