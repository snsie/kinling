// IndexedDB storage via Dexie. A single "main" record holds the save, plus a
// rolling backup of the previous good write. Writes use optimistic revision
// checks so two tabs can never silently overwrite each other.
import Dexie, { type Table } from 'dexie';
import type { SaveData } from '../game/types';
import { migrateSave, type MigrationResult } from './migrations';

interface SaveRecord {
  key: string;
  revision: number;
  updatedAt: number;
  data: unknown;
}

class KinlingDB extends Dexie {
  saves!: Table<SaveRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ saves: 'key' });
  }
}

export class SaveConflictError extends Error {
  constructor() {
    super('The save was changed by another tab.');
    this.name = 'SaveConflictError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Browser storage is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'StorageUnavailableError';
  }
}

const MAIN = 'main';
const BACKUP = 'backup';

export interface LoadResult extends MigrationResult {
  /** True if the main record was unreadable and the backup was used. */
  fromBackup: boolean;
}

export class SaveStorage {
  private db: KinlingDB;

  constructor(dbName = 'kinling') {
    this.db = new KinlingDB(dbName);
  }

  async open(): Promise<void> {
    try {
      await this.db.open();
    } catch (err) {
      throw new StorageUnavailableError(err);
    }
  }

  /** Returns null when there is no save yet. Throws if data exists but cannot be read. */
  async load(): Promise<LoadResult | null> {
    const main = await this.db.saves.get(MAIN);
    if (!main) return null;
    try {
      return { ...migrateSave(main.data), fromBackup: false };
    } catch (mainError) {
      const backup = await this.db.saves.get(BACKUP);
      if (backup) {
        try {
          return { ...migrateSave(backup.data), fromBackup: true };
        } catch {
          // fall through to the original error
        }
      }
      throw mainError;
    }
  }

  async currentRevision(): Promise<number | null> {
    const main = await this.db.saves.get(MAIN);
    return main ? main.revision : null;
  }

  /**
   * Write a save if the stored revision still matches `expectedRevision`
   * (null = no save expected yet). Returns the new revision.
   */
  async write(save: SaveData, expectedRevision: number | null): Promise<number> {
    return this.db.transaction('rw', this.db.saves, async () => {
      const current = await this.db.saves.get(MAIN);
      const currentRevision = current ? current.revision : null;
      if (currentRevision !== expectedRevision) throw new SaveConflictError();
      const revision = (currentRevision ?? 0) + 1;
      const data: SaveData = { ...save, revision, updatedAt: Date.now() };
      if (current) await this.db.saves.put({ ...current, key: BACKUP });
      await this.db.saves.put({ key: MAIN, revision, updatedAt: data.updatedAt, data });
      return revision;
    });
  }

  /** Replace the save regardless of revision (used for import and reset after confirmation). */
  async replace(save: SaveData | null): Promise<number | null> {
    return this.db.transaction('rw', this.db.saves, async () => {
      const current = await this.db.saves.get(MAIN);
      if (current) await this.db.saves.put({ ...current, key: BACKUP });
      if (!save) {
        await this.db.saves.delete(MAIN);
        return null;
      }
      const revision = (current?.revision ?? 0) + 1;
      const data: SaveData = { ...save, revision, updatedAt: Date.now() };
      await this.db.saves.put({ key: MAIN, revision, updatedAt: data.updatedAt, data });
      return revision;
    });
  }

  close(): void {
    this.db.close();
  }

  async destroy(): Promise<void> {
    await this.db.delete();
  }
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
