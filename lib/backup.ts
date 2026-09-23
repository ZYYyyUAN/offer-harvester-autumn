import { getBindings, safeJson } from "./server-data.ts";
import { safeArchiveName, sha256Hex } from "./data-safety.ts";

export { safeArchiveName, sha256Hex } from "./data-safety.ts";

export const BACKUP_PART_BYTES = 80 * 1024 * 1024;

export type BackupFileEntry = {
  id: string; recordId: string | null; purpose: string; filename: string; mimeType: string; size: number;
  metadata: Record<string, unknown>; version: number; createdAt: string; updatedAt: string; deletedAt: string | null;
  archivePath: string; sha256: string; part: number;
};

export async function buildBackupFileEntries(ownerId: string) {
  const { db, bucket } = getBindings();
  const rows = await db.prepare("SELECT id, record_id, purpose, filename, object_key, mime_type, size, metadata, version, created_at, updated_at, deleted_at FROM stored_files WHERE owner_id = ? ORDER BY created_at").bind(ownerId).all<Record<string, unknown>>();
  const entries: BackupFileEntry[] = []; let part = 0; let partBytes = 0;
  for (const row of rows.results) {
    const object = await bucket.get(String(row.object_key));
    if (!object) continue;
    if (partBytes && partBytes + object.size > BACKUP_PART_BYTES) { part++; partBytes = 0; }
    const buffer = await object.arrayBuffer();
    entries.push({
      id: String(row.id), recordId: row.record_id ? String(row.record_id) : null, purpose: String(row.purpose), filename: String(row.filename),
      mimeType: String(row.mime_type), size: object.size, metadata: safeJson(String(row.metadata), {}), version: Number(row.version),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at ? String(row.deleted_at) : null,
      archivePath: safeArchiveName(row), sha256: await sha256Hex(buffer), part,
    });
    partBytes += object.size;
  }
  return entries;
}
