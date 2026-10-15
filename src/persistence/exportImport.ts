// JSON export/import of saves. Imports are size-limited, parsed defensively,
// migrated and fully validated before they can replace anything.
import { activeKinling } from '../game/state';
import type { SaveData } from '../game/types';
import { migrateSave } from './migrations';

export const EXPORT_FORMAT = 'kinling-save';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  app: 'Kinling';
  /** Left by the kinling late in the story. Ignored on import. */
  note?: string;
  save: SaveData;
}

export function exportSave(save: SaveData, now = Date.now(), note?: string): string {
  const file: ExportFile = { format: EXPORT_FORMAT, exportedAt: new Date(now).toISOString(), app: 'Kinling', ...(note ? { note } : {}), save };
  return JSON.stringify(file, null, 2);
}

export function exportFileName(save: SaveData, now = Date.now()): string {
  const name = (activeKinling(save)?.name || 'kinling').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase();
  const d = new Date(now);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `kinling-${name}-${stamp}.json`;
}

export type ImportResult =
  | { ok: true; save: SaveData; migratedFrom: number | null }
  | { ok: false; error: string };

export function parseImport(text: string): ImportResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'The file is empty.' };
  if (new Blob([text]).size > MAX_IMPORT_BYTES) return { ok: false, error: 'That file is too large to be a Kinling save.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'That file does not contain a Kinling save.' };
  const obj = parsed as Record<string, unknown>;
  let raw: unknown = obj;
  if ('format' in obj) {
    if (obj.format !== EXPORT_FORMAT) return { ok: false, error: 'That file is not a Kinling save export.' };
    raw = obj.save;
  }
  try {
    const { save, migratedFrom } = migrateSave(raw);
    return { ok: true, save, migratedFrom };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The save could not be read.' };
  }
}

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
