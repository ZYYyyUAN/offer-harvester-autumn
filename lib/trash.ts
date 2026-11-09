import { ApiError, getBindings } from "./server-data.ts";
import { scrubJDJobs, eraseJDFileCopies } from "./jd-trash";
import { atomicBatch, versionGuard } from "./jd-store";

export { trashRetention } from "./data-safety.ts";

export type TrashTarget = { type: "record" | "file"; id: string; version: number };

export async function purgeExpiredTrash(ownerId: string) {
  const { db, bucket } = getBindings();
  const expiredFiles = await db.prepare("SELECT id, object_key FROM stored_files WHERE owner_id = ? AND deleted_at IS NOT NULL AND deleted_at <= datetime('now', '-30 days')").bind(ownerId).all<Record<string, unknown>>();
  const failed: Array<{ id: string; error: string }> = [];
  let filesPurged = 0;
  for (const row of expiredFiles.results) {
    try {
      await bucket.delete(String(row.object_key));
      await atomicBatch([...(await eraseJDFileCopies(ownerId, String(row.id))), db.prepare("DELETE FROM stored_files WHERE id = ? AND owner_id = ? AND deleted_at <= datetime('now', '-30 days')").bind(row.id, ownerId)]);
      filesPurged++;
    } catch (error) {
      failed.push({ id: String(row.id), error: error instanceof Error ? error.message : "R2_DELETE_FAILED" });
    }
  }
  const expiredRecords = await db.prepare("SELECT id FROM records WHERE owner_id = ? AND deleted_at IS NOT NULL AND deleted_at <= datetime('now', '-30 days')").bind(ownerId).all<{ id: string }>();
  const statements = expiredRecords.results.flatMap((r) => scrubJDJobs(ownerId, r.id));
  if (statements.length) await atomicBatch(statements);
  const records = await db.prepare("DELETE FROM records WHERE owner_id = ? AND deleted_at IS NOT NULL AND deleted_at <= datetime('now', '-30 days')").bind(ownerId).run();
  return { filesPurged, recordsPurged: Number(records.meta?.changes || 0), failed };
}

export async function restoreTrash(ownerId: string, targets: TrashTarget[]) {
  const { db } = getBindings();
  const statements: D1PreparedStatement[] = [];
  const batches = new Set<string>();
  for (const target of targets) {
    const table = target.type === "file" ? "stored_files" : "records";
    const row = await db.prepare(`SELECT version, deleted_at${target.type === "record" ? ", data" : ""} FROM ${table} WHERE id = ? AND owner_id = ?`).bind(target.id, ownerId).first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "回收站项目不存在");
    if (!row.deleted_at) throw new ApiError(409, "项目已经恢复", "NOT_IN_TRASH");
    if (Number(row.version) !== target.version) throw new ApiError(409, "回收站项目版本已变化", "VERSION_CONFLICT", false, { id: target.id, currentVersion: Number(row.version) });
    const batchId = target.type === "record" ? JSON.parse(String(row.data)).deletionBatchId : null;
    if (batchId && batches.has(batchId)) continue;
    if (batchId) batches.add(batchId);
    statements.push(versionGuard(ownerId, target.id, target.version, table, "deleted"), db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ?`).bind(target.id, ownerId, target.version));
    if (target.type === "record") {
      if (batchId) statements.push(db.prepare("UPDATE records SET deleted_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND deleted_at IS NOT NULL AND json_extract(data, '$.deletionBatchId') = ? AND id != ?").bind(ownerId, batchId, target.id));
    }
  }
  if (statements.length) await atomicBatch(statements);
  return { restored: statements.length };
}

export async function permanentlyDeleteTrash(ownerId: string, targets: TrashTarget[]) {
  const { db, bucket } = getBindings();
  const failed: Array<{ id: string; error: string }> = [];
  let deleted = 0;
  for (const target of targets) {
    const table = target.type === "file" ? "stored_files" : "records";
    const row = await db.prepare(`SELECT version, deleted_at${target.type === "file" ? ", object_key" : ", data"} FROM ${table} WHERE id = ? AND owner_id = ?`).bind(target.id, ownerId).first<Record<string, unknown>>();
    if (!row) continue;
    if (!row.deleted_at) throw new ApiError(409, "只能永久删除回收站中的项目", "NOT_IN_TRASH");
    if (Number(row.version) !== target.version) throw new ApiError(409, "回收站项目版本已变化", "VERSION_CONFLICT", false, { id: target.id, currentVersion: Number(row.version) });
    try {
      if (target.type === "file") await bucket.delete(String(row.object_key));
      if (target.type === "record") {
        const batchId = JSON.parse(String(row.data)).deletionBatchId;
        const members = batchId ? (await db.prepare("SELECT id FROM records WHERE owner_id = ? AND deleted_at IS NOT NULL AND json_extract(data, '$.deletionBatchId') = ?").bind(ownerId, batchId).all<{ id: string }>()).results : [{ id: target.id }];
        await atomicBatch([versionGuard(ownerId, target.id, target.version, "records", "deleted"), ...members.flatMap((r) => [...scrubJDJobs(ownerId, r.id), db.prepare("DELETE FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL").bind(r.id, ownerId)])]);
        deleted += members.length;
      } else {
        await atomicBatch([versionGuard(ownerId, target.id, target.version, "stored_files", "deleted"), ...(await eraseJDFileCopies(ownerId, target.id)), db.prepare("DELETE FROM stored_files WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NOT NULL").bind(target.id, ownerId, target.version)]);
        deleted++;
      }
    } catch (error) {
      failed.push({ id: target.id, error: error instanceof Error ? error.message : "DELETE_FAILED" });
    }
  }
  return { deleted, failed };
}
