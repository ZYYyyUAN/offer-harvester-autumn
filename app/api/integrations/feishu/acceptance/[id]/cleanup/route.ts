import { acceptanceCleanupSchema, type FeishuWorkspaceConfig } from "@/lib/feishu-contracts";
import { deleteBitableRecord, deleteDriveFile } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const id = (await context.params).id; const body = acceptanceCleanupSchema.parse(await request.json()); const { db, bucket } = getBindings();
    const run = await db.prepare("SELECT * FROM integration_runs WHERE id = ? AND owner_id = ? AND run_type = 'acceptance_suite'").bind(id, userId).first<Record<string, unknown>>(); if (!run) throw new ApiError(404, "验收批次不存在"); if (Number(run.version) !== body.version) throw new ApiError(409, "验收记录已变化，请刷新后重试"); if (String(run.status) === "cleaned") return Response.json({ run: { id, status: "cleaned", version: run.version, result: safeJson(String(run.result), {}) } });
    const result = safeJson<any>(String(run.result), {}); if (result.acceptanceRunId !== id || result.synthetic !== true) throw new ApiError(409, "清理范围校验失败，未删除任何数据"); const resources = result.resources || {}; const connection = await getFeishuConnection(userId); const config = safeJson<FeishuWorkspaceConfig>(String(connection?.config ?? "{}"), {}); const failures: Array<{ resource: string; error: string }> = [];
    if (resources.remoteApplicationId) try { await deleteBitableRecord(userId, config, resources.remoteApplicationId); } catch (error) { failures.push({ resource: "remoteApplication", error: error instanceof Error ? error.message : "删除失败" }); }
    if (resources.remoteResumeId) try { await deleteDriveFile(userId, resources.remoteResumeId, "file"); } catch (error) { failures.push({ resource: "remoteResume", error: error instanceof Error ? error.message : "删除失败" }); }
    if (resources.remoteDocumentId) try { await deleteDriveFile(userId, resources.remoteDocumentId, "docx"); } catch (error) { failures.push({ resource: "remoteDocument", error: error instanceof Error ? error.message : "删除失败" }); }
    if (resources.objectKey) await bucket.delete(resources.objectKey);
    await db.batch([
      db.prepare("UPDATE records SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND id = ? AND json_extract(data, '$.acceptanceRunId') = ?").bind(userId, resources.localApplicationId ?? "", id),
      db.prepare("UPDATE stored_files SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND id = ? AND json_extract(metadata, '$.acceptanceRunId') = ?").bind(userId, resources.localResumeId ?? "", id),
      db.prepare("UPDATE integration_mappings SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND integration_id = ? AND json_extract(metadata, '$.acceptanceRunId') = ?").bind(userId, run.integration_id, id),
    ]);
    const nextStatus = failures.length ? "partial" : "cleaned"; const cleaned = { ...result, cleanup: { at: new Date().toISOString(), failures } }; await db.prepare("UPDATE integration_runs SET status = ?, result = ?, error = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(nextStatus, JSON.stringify(cleaned), failures.length ? `${failures.length} 个远程对象清理失败，可重试` : null, id, userId).run(); return Response.json({ run: { id, status: nextStatus, version: Number(run.version) + 1, result: cleaned } });
  } catch (error) { return apiError(error); }
}
