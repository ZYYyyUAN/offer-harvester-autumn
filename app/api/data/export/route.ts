import { apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";
import { csvEscape } from "@/lib/workflow-contracts";
import { buildBackupFileEntries } from "@/lib/backup";

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser(); const db = getDatabase(); const format = new URL(request.url).searchParams.get("format") || "json";
    const [profileRow, recordRows, jobRows, attemptRows, files] = await Promise.all([
      db.prepare("SELECT data, version, created_at, updated_at FROM profiles WHERE owner_id = ?").bind(userId).first<Record<string, unknown>>(),
      db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ? AND kind != 'data_imports' ORDER BY created_at").bind(userId).all<Record<string, unknown>>(),
      db.prepare("SELECT id, capture_key, phase, batch_id, type, status, input_snapshot, source_refs, model, prompt_version, result, result_record_id, confidence, elapsed_ms, error_code, error_message, version, created_at, started_at, finished_at, updated_at FROM ai_jobs WHERE owner_id = ? ORDER BY created_at").bind(userId).all<Record<string, unknown>>(),
      db.prepare("SELECT id, job_id, attempt_number, model, status, telemetry, token_usage, response_summary, error_code, error_message, started_at, finished_at FROM ai_job_attempts WHERE owner_id = ? ORDER BY started_at").bind(userId).all<Record<string, unknown>>(),
      buildBackupFileEntries(userId),
    ]);
    const records = recordRows.results.map(mapRecord); const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const header = ["id", "kind", "title", "dataJson", "version", "createdAt", "updatedAt", "deletedAt"].map(csvEscape).join(",");
      const rows = records.map((item) => [item.id, item.kind, item.title, item.data, item.version, item.createdAt, item.updatedAt, item.deletedAt || ""].map(csvEscape).join(","));
      return new Response(`\uFEFF${[header, ...rows].join("\r\n")}`, { headers: { "content-type": "text/csv;charset=utf-8", "content-disposition": `attachment; filename="offer-harvester-${stamp}.csv"` } });
    }
    const payload = { schemaVersion: 7, exportedAt: new Date().toISOString(), profile: profileRow ? { data: safeJson(String(profileRow.data), {}), version: profileRow.version, createdAt: profileRow.created_at, updatedAt: profileRow.updated_at } : null, records, files, aiJobs: jobRows.results, aiJobAttempts: attemptRows.results, note: "请同时下载全部附件 TAR 分包；恢复时先导入此 JSON，再上传分包并确认提交。" };
    return new Response(JSON.stringify(payload, null, 2), { headers: { "content-type": "application/json;charset=utf-8", "content-disposition": `attachment; filename="offer-harvester-${stamp}.json"` } });
  } catch (error) { return apiError(error); }
}
