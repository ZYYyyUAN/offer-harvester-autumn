import { ApiError, getDatabase, mapRecord, type StoredRecord } from "./server-data";
import { jdDataSchemas } from "./jd-contracts";

export type JDRecord = Omit<StoredRecord, "data"> & { data: Record<string, any> };
export async function ownedRecord(ownerId: string, id: string, kind?: string): Promise<JDRecord> {
  const row = await getDatabase().prepare("SELECT * FROM records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL").bind(id, ownerId).first<Record<string, unknown>>();
  if (!row || (kind && row.kind !== kind)) throw new ApiError(404, "记录不存在");
  return mapRecord(row);
}
export function insertRecord(ownerId: string, kind: string, title: string, data: Record<string, unknown>, id = crypto.randomUUID()) {
  const schema = jdDataSchemas[kind];
  const parsed = schema ? schema.parse(data) : data;
  return getDatabase().prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, ?, ?, ?)").bind(id, ownerId, kind, title, JSON.stringify(parsed));
}
export function updateRecordStatement(ownerId: string, record: JDRecord, data: Record<string, unknown>) {
  const parsed = jdDataSchemas[record.kind]?.parse(data) ?? data;
  return getDatabase().prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL").bind(JSON.stringify(parsed), record.id, ownerId, record.version);
}
export function versionGuard(ownerId: string, id: string, version: number, table: "records" | "stored_files" | "ai_jobs" = "records", status?: string) {
  const where = table === "ai_jobs" ? (status ? " AND status = ?" : "") : status === "deleted" ? " AND deleted_at IS NOT NULL" : " AND deleted_at IS NULL";
  const values: unknown[] = [id, ownerId, version, ...(table === "ai_jobs" && status ? [status] : [])];
  // A failed CAS must abort the entire D1 batch, including its audit and snapshot inserts.
  return getDatabase().prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM " + table + " WHERE id = ? AND owner_id = ? AND version = ?" + where + ") THEN 1 ELSE abs(-9223372036854775808) END").bind(...values);
}
export async function atomicBatch(statements: D1PreparedStatement[]) {
  try { return await getDatabase().batch(statements); }
  catch (error) {
    if (error instanceof Error && error.message.includes("integer overflow")) throw new ApiError(409, "数据已更新或任务已取消，请刷新后重试", "VERSION_CONFLICT");
    throw error;
  }
}
export async function listKind(ownerId: string, kind: string): Promise<JDRecord[]> {
  const rows = await getDatabase().prepare("SELECT * FROM records WHERE owner_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY created_at, id").bind(ownerId, kind).all<Record<string, unknown>>();
  return rows.results.map(mapRecord);
}
