import { createBitableRecord, listBitableRecords, updateBitableRecord } from "@/lib/feishu-api";
import { applicationToFeishuFields, feishuFieldsToApplication, isRemoteImportable, remoteLocalId, syncCommitSchema, type FeishuWorkspaceConfig, type LocalApplication, type SyncPreviewItem } from "@/lib/feishu-contracts";
import { getFeishuConnection, stableHash } from "@/lib/feishu";
import { localApplicationHash, remoteApplicationHash } from "@/lib/feishu-sync";
import { ApiError, apiError, getDatabase, recordTitle, requireApiUser, safeJson } from "@/lib/server-data";

async function upsertMapping(ownerId: string, integrationId: string, localId: string, remoteId: string, localVersion: number, localHash: string, remoteHash: string) {
  const db = getDatabase(); const existing = await db.prepare("SELECT id FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND object_type = 'application' AND (local_id = ? OR remote_id = ?) LIMIT 1").bind(ownerId, integrationId, localId, remoteId).first<Record<string, unknown>>();
  if (existing) await db.prepare("UPDATE integration_mappings SET local_id = ?, remote_id = ?, local_version = ?, local_hash = ?, remote_hash = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL WHERE id = ? AND owner_id = ?").bind(localId, remoteId, localVersion, localHash, remoteHash, existing.id, ownerId).run();
  else await db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, local_hash, remote_hash, last_synced_at) VALUES (?, ?, ?, 'application', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), ownerId, integrationId, localId, remoteId, localVersion, localHash, remoteHash).run();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const runId = (await context.params).id; const body = syncCommitSchema.parse(await request.json()); const db = getDatabase();
    const run = await db.prepare("SELECT * FROM integration_runs WHERE id = ? AND owner_id = ? AND run_type = 'application_sync'").bind(runId, userId).first<Record<string, unknown>>();
    if (!run) throw new ApiError(404, "同步预览不存在"); if (String(run.status) !== "preview") throw new ApiError(409, "该同步预览已提交或已失效"); if (Number(run.version) !== body.version) throw new ApiError(409, "同步预览版本已变化，请重新生成"); if (Date.parse(String(run.expires_at)) <= Date.now()) throw new ApiError(410, "同步预览已过期，请重新生成");
    const connection = await getFeishuConnection(userId); if (!connection || String(connection.id) !== String(run.integration_id) || String(connection.status) !== "connected") throw new ApiError(409, "飞书连接不可用");
    const config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); const preview = safeJson<{ items: SyncPreviewItem[]; integrationVersion?: number; configHash?: string }>(String(run.preview), { items: [] });
    if (preview.integrationVersion && preview.integrationVersion !== Number(connection.version)) throw new ApiError(409, "飞书连接或空间配置在预览后已变化，请重新生成预览");
    if (preview.configHash && preview.configHash !== await stableHash(config)) throw new ApiError(409, "飞书空间配置在预览后已变化，请重新生成预览");
    const decisionMap = new Map(body.decisions.map((item) => [item.itemId, item.action]));
    const remoteRecords = await listBitableRecords(userId, config); const remoteById = new Map(remoteRecords.map((item) => [item.recordId, item])); const remoteByLocal = new Map<string, (typeof remoteRecords)[number]>(); for (const item of remoteRecords) { const key = remoteLocalId(item.fields); if (key) remoteByLocal.set(key, item); }
    const results: Array<Record<string, unknown>> = [];
    for (const item of preview.items) {
      const action = decisionMap.get(item.id) ?? item.defaultDecision; if (action === "skip" || item.type === "invalid_remote" || item.type === "deletion_warning") { results.push({ itemId: item.id, status: "skipped" }); continue; }
      try {
        if (action === "local") {
          if (!item.localId) throw new ApiError(400, "缺少本地记录"); const row = await db.prepare("SELECT id, data, version, updated_at FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL").bind(item.localId, userId).first<Record<string, unknown>>(); if (!row) throw new ApiError(409, "本地记录已删除，请重新生成预览");
          const local: LocalApplication = { id: String(row.id), version: Number(row.version), updatedAt: String(row.updated_at), data: safeJson(String(row.data), {}) }; const currentLocalHash = await localApplicationHash(local); if (local.version !== item.localVersion || currentLocalHash !== item.localHash) throw new ApiError(409, "本地记录在预览后已变化，请重新生成预览");
          const remote = (item.remoteId ? remoteById.get(item.remoteId) : undefined) ?? remoteByLocal.get(local.id); if (remote && item.remoteHash && await remoteApplicationHash(remote) !== item.remoteHash) throw new ApiError(409, "飞书记录在预览后已变化，请重新生成预览");
          const fields = applicationToFeishuFields(local); const remoteId = remote ? remote.recordId : await createBitableRecord(userId, config, fields); if (remote) await updateBitableRecord(userId, config, remoteId, fields); const remoteHash = await stableHash(local.data && typeof local.data === "object" ? (await import("@/lib/feishu-contracts")).normalizeApplicationData(local.data) : {});
          await upsertMapping(userId, String(connection.id), local.id, remoteId, local.version, currentLocalHash, remoteHash); results.push({ itemId: item.id, status: "succeeded", action, localId: local.id, remoteId });
        } else {
          if (!item.remoteId) throw new ApiError(400, "缺少飞书记录"); const remote = remoteById.get(item.remoteId); if (!remote) throw new ApiError(409, "飞书记录已删除，请重新生成预览"); const currentRemoteHash = await remoteApplicationHash(remote); if (item.remoteHash && currentRemoteHash !== item.remoteHash) throw new ApiError(409, "飞书记录在预览后已变化，请重新生成预览"); const data = feishuFieldsToApplication(remote.fields); if (!isRemoteImportable(data)) throw new ApiError(400, "飞书记录缺少公司或岗位");
          let localId = item.localId; let localVersion = 1; if (localId) { const row = await db.prepare("SELECT version FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL").bind(localId, userId).first<Record<string, unknown>>(); if (!row || Number(row.version) !== item.localVersion) throw new ApiError(409, "本地记录在预览后已变化，请重新生成预览"); await db.prepare("UPDATE records SET data = ?, title = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify(data), recordTitle("applications", data), localId, userId).run(); localVersion = Number(row.version) + 1; }
          else { localId = crypto.randomUUID(); await db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'applications', ?, ?)").bind(localId, userId, recordTitle("applications", data), JSON.stringify(data)).run(); }
          const localRow: LocalApplication = { id: localId, version: localVersion, updatedAt: new Date().toISOString(), data }; const localHash = await localApplicationHash(localRow); await upsertMapping(userId, String(connection.id), localId, remote.recordId, localVersion, localHash, currentRemoteHash); results.push({ itemId: item.id, status: "succeeded", action, localId, remoteId: remote.recordId });
        }
      } catch (error) { results.push({ itemId: item.id, status: "failed", error: error instanceof Error ? error.message : "执行失败" }); }
    }
    const failed = results.filter((item) => item.status === "failed").length; await db.batch([db.prepare("UPDATE integration_runs SET status = ?, decisions = ?, result = ?, error = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(failed ? "partial" : "succeeded", JSON.stringify(body.decisions), JSON.stringify({ items: results, succeeded: results.filter((item) => item.status === "succeeded").length, failed }), failed ? `${failed} 项执行失败，可重新生成预览后安全重试` : null, runId, userId), db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'activity_events', '飞书同步已执行', ?)").bind(crypto.randomUUID(), userId, JSON.stringify({ action: "feishu_sync", runId, succeeded: results.filter((item) => item.status === "succeeded").length, failed }))]);
    return Response.json({ run: { id: runId, status: failed ? "partial" : "succeeded", version: Number(run.version) + 1, result: { items: results, failed } } });
  } catch (error) { return apiError(error); }
}
