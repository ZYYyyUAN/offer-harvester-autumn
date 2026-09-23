import { acceptanceCleanupSchema, type FeishuWorkspaceConfig } from "@/lib/feishu-contracts";
import { deleteBitableRecord, deleteDriveFile } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const id = (await context.params).id; const body = acceptanceCleanupSchema.parse(await request.json()); const { db, bucket } = getBindings();
    const run = await db.prepare("SELECT * FROM integration_runs WHERE id = ? AND owner_id = ? AND run_type = 'acceptance_suite'").bind(id, userId).first<Record<string, unknown>>(); if (!run) throw new ApiError(404, "验收批次不存在"); if (Number(run.version) !== body.version) throw new ApiError(409, "验收记录已变化，请刷新后重试"); if (String(run.status) === "cleaned") return Response.json({ run: { id, status: "cleaned", version: run.version, result: safeJson(String(run.result), {}) } });
    const result = safeJson<any>(String(run.result), {}); if (result.acceptanceRunId !== id || result.synthetic !== true) throw new ApiError(409, "清理范围校验失败，未删除任何数据"); const resources = result.resources || {}; const connection = await getFeishuConnection(userId); const config = safeJson<FeishuWorkspaceConfig>(String(connection?.config ?? "{}"), {}); const failures: Array<{ resource: string; error: string }> = [];
    const values = (many: unknown, legacy: unknown) => Array.isArray(many) ? many.map(String).filter(Boolean) : legacy ? [String(legacy)] : [];
    const remoteApplicationIds = values(resources.remoteApplicationIds, resources.remoteApplicationId);
    const remoteResumeIds = values(resources.remoteResumeIds, resources.remoteResumeId);
    const remoteDocumentIds = values(resources.remoteDocumentIds, resources.remoteDocumentId);
    const objectKeys = values(resources.objectKeys, resources.objectKey);
    for (const remoteId of remoteApplicationIds) try { await deleteBitableRecord(userId, config, remoteId); } catch (error) { failures.push({ resource: `remoteApplication:${remoteId}`, error: error instanceof Error ? error.message : "删除失败" }); }
    for (const remoteId of remoteResumeIds) try { await deleteDriveFile(userId, remoteId, "file"); } catch (error) { failures.push({ resource: `remoteResume:${remoteId}`, error: error instanceof Error ? error.message : "删除失败" }); }
    for (const remoteId of remoteDocumentIds) try { await deleteDriveFile(userId, remoteId, "docx"); } catch (error) { failures.push({ resource: `remoteDocument:${remoteId}`, error: error instanceof Error ? error.message : "删除失败" }); }
    for (const objectKey of objectKeys) try { await bucket.delete(objectKey); } catch (error) { failures.push({ resource: `localR2:${objectKey}`, error: error instanceof Error ? error.message : "删除失败" }); }
    if (!failures.length) await db.batch([
      db.prepare("DELETE FROM records WHERE owner_id = ? AND json_extract(data, '$.acceptanceRunId') = ?").bind(userId, id),
      db.prepare("DELETE FROM stored_files WHERE owner_id = ? AND json_extract(metadata, '$.acceptanceRunId') = ?").bind(userId, id),
      db.prepare("DELETE FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND json_extract(metadata, '$.acceptanceRunId') = ?").bind(userId, run.integration_id, id),
    ]);
    const nextStatus = failures.length ? "partial" : "cleaned"; const cleaned = { ...result, cleanup: { at: new Date().toISOString(), failures } }; await db.prepare("UPDATE integration_runs SET status = ?, result = ?, error = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(nextStatus, JSON.stringify(cleaned), failures.length ? `${failures.length} 个远程对象清理失败，可重试` : null, id, userId).run(); return Response.json({ run: { id, status: nextStatus, version: Number(run.version) + 1, result: cleaned } });
  } catch (error) { return apiError(error); }
}
