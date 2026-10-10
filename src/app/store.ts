// The game store: owns the current save, autosaves meaningful changes to
// IndexedDB, coordinates with other tabs, and reports save status.
import { tick as advanceTime } from '../game/care';
import type { Feedback } from '../game/outcome';
import { createSave } from '../game/state';
import type { SaveData } from '../game/types';
import { SaveConflictError, SaveStorage, requestPersistentStorage } from '../persistence/db';
import { TabCoordinator, type TabRole } from '../persistence/tabLock';

export type SaveStatus =
  | { kind: 'loading' }
  | { kind: 'saved'; at: number }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'memory-only'; message: string }
  | { kind: 'readonly' }
  | { kind: 'conflict' };

export interface StoreSnapshot {
  save: SaveData | null;
  status: SaveStatus;
  role: TabRole;
  /** Notes to show once after loading (e.g. restored from backup, migrated). */
  notice: string | null;
  /** Feedback from the most recent time advance (e.g. "welcome back"). */
  lastTick: Feedback | null;
}

type Listener = () => void;

const AUTOSAVE_DELAY = 600;
const TICK_SAVE_INTERVAL = 30_000;

export class GameStore {
  private snapshot: StoreSnapshot = { save: null, status: { kind: 'loading' }, role: 'reader', notice: null, lastTick: null };
  private listeners = new Set<Listener>();
  private storage: SaveStorage | null = null;
  private tabs = new TabCoordinator();
  private revision: number | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private lastTickSave = 0;
  private initialized = false;
  /** How long the player had been away when they last arrived (page load or return to the tab). */
  private arrivalGap = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.snapshot;

  private patch(p: Partial<StoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...p };
    for (const l of this.listeners) l();
  }

  get save(): SaveData | null {
    return this.snapshot.save;
  }

  get canWrite(): boolean {
    return this.snapshot.role === 'writer' && this.snapshot.status.kind !== 'conflict';
  }

  async init(now = Date.now()): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.tabs.on((e) => {
      if (e.type === 'role') {
        if (e.role === 'reader' && this.snapshot.role === 'writer') {
          // Another tab took over: stop writing immediately.
          this.dirty = false;
          if (this.timer) clearTimeout(this.timer);
          this.patch({ role: 'reader', status: { kind: 'readonly' } });
        } else {
          this.patch({ role: e.role });
        }
      }
      if ((e.type === 'remote-saved' || e.type === 'remote-reset') && this.snapshot.role === 'reader') void this.reloadFromDisk();
    });

    try {
      this.storage = new SaveStorage();
      await this.storage.open();
    } catch (err) {
      this.storage = null;
      this.patch({
        save: createSave(now),
        role: 'writer',
        status: { kind: 'memory-only', message: `Saving is unavailable in this browser (${err instanceof Error ? err.message : 'storage blocked'}). You can play, but progress will be lost when the page closes.` },
      });
      return;
    }

    const role = await this.tabs.acquire();
    let save: SaveData;
    let notice: string | null = null;
    try {
      const loaded = await this.storage.load();
      if (loaded) {
        save = loaded.save;
        this.revision = loaded.save.revision;
        if (loaded.fromBackup) notice = 'Your latest save could not be read, so the previous backup was restored.';
        else if (loaded.migratedFrom) notice = `Your save was upgraded from an older format (v${loaded.migratedFrom}).`;
        // Keep the revision of what is actually on disk for conflict checks.
        this.revision = await this.storage.currentRevision();
      } else {
        save = createSave(now);
        this.revision = null;
      }
    } catch (err) {
      this.patch({
        save: null,
        role,
        status: { kind: 'error', message: `Your save could not be loaded: ${err instanceof Error ? err.message : String(err)}. You can import a backup or reset in Settings.` },
      });
      return;
    }

    let lastTick: Feedback | null = null;
    if (role === 'writer') {
      this.arrivalGap = Math.max(0, now - save.lastTickAt);
      const t = advanceTime(save, now);
      save = t.save;
      if (t.absentMs > 0) lastTick = t.feedback;
    }
    this.patch({ save, role, notice, lastTick, status: role === 'writer' ? { kind: 'saved', at: now } : { kind: 'readonly' } });
    if (role === 'writer') {
      this.dirty = true;
      await this.flush();
      void requestPersistentStorage();
    }
  }

  /** Apply a change. Meaningful changes are autosaved shortly after. */
  update(fn: (s: SaveData) => SaveData, opts: { meaningful?: boolean } = {}): boolean {
    const current = this.snapshot.save;
    if (!current) return false;
    if (!this.canWrite) {
      this.patch({ status: this.snapshot.status.kind === 'conflict' ? this.snapshot.status : { kind: 'readonly' } });
      return false;
    }
    const next = fn(current);
    if (next === current) return false;
    this.patch({ save: next });
    if (opts.meaningful !== false) this.schedule();
    return true;
  }

  /** Advance game time (needs decay). Saved periodically rather than on every tick. */
  tick(now = Date.now()): Feedback | null {
    const current = this.snapshot.save;
    if (!current || !this.canWrite) return null;
    const t = advanceTime(current, now);
    if (t.save === current) return null;
    if (t.absentMs > 0) this.arrivalGap = t.absentMs;
    this.patch({ save: t.save, lastTick: t.absentMs > 0 ? t.feedback : this.snapshot.lastTick });
    if (t.absentMs > 0 || now - this.lastTickSave > TICK_SAVE_INTERVAL) {
      this.lastTickSave = now;
      this.schedule();
    }
    return t.absentMs > 0 ? t.feedback : null;
  }

  clearNotice() {
    this.patch({ notice: null });
  }

  /** Milliseconds away before the latest arrival; reads once. */
  consumeArrivalGap(): number {
    const gap = this.arrivalGap;
    this.arrivalGap = 0;
    return gap;
  }

  consumeLastTick(): Feedback | null {
    const f = this.snapshot.lastTick;
    if (f) this.patch({ lastTick: null });
    return f;
  }

  private schedule() {
    this.dirty = true;
    if (!this.storage) return;
    if (this.snapshot.status.kind !== 'saving') this.patch({ status: { kind: 'pending' } });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY);
  }

  /** Write pending changes now (also used on page hide). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.writing) await this.writing;
    if (!this.dirty || !this.storage || !this.snapshot.save || !this.canWrite) return;
    const storage = this.storage;
    const save = this.snapshot.save;
    this.dirty = false;
    this.patch({ status: { kind: 'saving' } });
    this.writing = (async () => {
      try {
        const revision = await storage.write(save, this.revision);
        this.revision = revision;
        // Reflect the stored revision without counting it as a new change.
        if (this.snapshot.save === save) this.snapshot = { ...this.snapshot, save: { ...save, revision } };
        this.patch({ status: this.dirty ? { kind: 'pending' } : { kind: 'saved', at: Date.now() } });
        this.tabs.announceSaved(revision);
      } catch (err) {
        if (err instanceof SaveConflictError) {
          this.patch({ status: { kind: 'conflict' }, role: 'reader' });
          return;
        }
        this.dirty = true;
        const message = err instanceof Error && /quota/i.test(err.name + err.message)
          ? 'Browser storage is full. Free some space or export a backup.'
          : `Could not save: ${err instanceof Error ? err.message : String(err)}`;
        this.patch({ status: { kind: 'error', message } });
      }
    })();
    await this.writing;
    this.writing = null;
    if (this.dirty && this.snapshot.status.kind === 'pending') this.schedule();
  }

  retrySave() {
    this.dirty = true;
    void this.flush();
  }

  private async reloadFromDisk(): Promise<void> {
    if (!this.storage) return;
    try {
      const loaded = await this.storage.load();
      this.revision = await this.storage.currentRevision();
      this.patch({ save: loaded ? loaded.save : createSave(Date.now()) });
    } catch {
      // Keep showing what we have; the writer tab owns the save.
    }
  }

  /** Become the writing tab (the other tab turns read-only). */
  async takeOver(): Promise<void> {
    const role = await this.tabs.acquire(true);
    await this.reloadFromDisk();
    this.patch({ role, status: role === 'writer' ? { kind: 'saved', at: Date.now() } : { kind: 'readonly' } });
  }

  /** Replace the whole save (import). Caller must have validated and confirmed. */
  async replaceSave(save: SaveData): Promise<void> {
    if (!this.canWrite) throw new Error('This tab is read-only.');
    const now = Date.now();
    const next: SaveData = { ...save, lastTickAt: Math.min(save.lastTickAt, now) };
    if (this.storage) {
      this.revision = await this.storage.replace(next);
      this.tabs.announceReset();
    }
    this.dirty = false;
    this.patch({ save: { ...next, revision: this.revision ?? 0 }, status: { kind: 'saved', at: now } });
  }

  async resetAll(): Promise<void> {
    if (!this.canWrite) throw new Error('This tab is read-only.');
    const fresh = createSave(Date.now());
    if (this.storage) {
      await this.storage.replace(null);
      this.revision = null;
      this.tabs.announceReset();
    }
    this.dirty = true;
    this.patch({ save: fresh, notice: null, lastTick: null });
    await this.flush();
  }
}

export const store = new GameStore();
