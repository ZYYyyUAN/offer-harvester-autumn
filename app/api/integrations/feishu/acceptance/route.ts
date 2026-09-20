import { applicationToFeishuFields, type FeishuWorkspaceConfig } from "@/lib/feishu-contracts";
import { bootstrapWorkspace, createBitableRecord, createNativeDocument, listBitableRecords, updateBitableRecord, uploadDriveFile } from "@/lib/feishu-api";
import { getFeishuConnection, stableHash, updateWorkspaceConfig } from "@/lib/feishu";
import { requiredCapabilitiesReady } from "@/lib/feishu-diagnostics";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
export async function POST() {
  const { userId } = await requireApiUser(); const { db, bucket } = getBindings(); let runId = "";
  try {
    const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const scopes = safeJson<string[]>(String(connection.scopes ?? "[]"), []); if (!requiredCapabilitiesReady(scopes)) throw new ApiError(409, "缺少飞书必需权限，验收包未创建任何数据");
    runId = crypto.randomUUID(); const tag = `ACCEPT-${runId.slice(0,8)}`; await db.prepare("INSERT INTO integration_runs (id, owner_id, integration_id, run_type, status, preview) VALUES (?, ?, ?, 'acceptance_suite', 'running', ?)").bind(runId, userId, connection.id, JSON.stringify({ tag, synthetic: true, startedAt: new Date().toISOString() })).run();
    let config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); config = await bootstrapWorkspace(userId, config); await updateWorkspaceConfig(userId, String(connection.id), config);
    const appId = crypto.randomUUID(); const application = { id: appId, version: 1, updatedAt: new Date().toISOString(), data: { company: `${tag} 合成公司`, role: "产品实习生", location: "测试城市", stage: "准备简历", notes: "仅用于飞书全链路验收", acceptanceRunId: runId, synthetic: true } };
    const resumeId = crypto.randomUUID(); const objectKey = `${userId}/acceptance/${runId}/resume.pdf`; const reportTitle = `${tag} 合成分析报告`;
    await bucket.put(objectKey, pdf, { httpMetadata: { contentType: "application/pdf" } });
    await db.batch([
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'applications', ?, ?)").bind(appId, userId, `${tag} 合成公司 产品实习生`, JSON.stringify(application.data)),
      db.prepare("INSERT INTO stored_files (id, owner_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, 'resume', ?, ?, 'application/pdf', ?, ?)").bind(resumeId, userId, `${tag}-synthetic-resume.pdf`, objectKey, pdf.byteLength, JSON.stringify({ synthetic: true, acceptanceRunId: runId, displayName: `${tag} 合成简历` })),
    ]);
    const remoteApplicationId = await createBitableRecord(userId, config, applicationToFeishuFields(application));
    const remoteResumeId = await uploadDriveFile(userId, String(config.resumeFolderToken), `${tag}-synthetic-resume.pdf`, "application/pdf", pdf.buffer as ArrayBuffer);
    const document = await createNativeDocument(userId, String(config.reportFolderToken), reportTitle, ["这是不含真实业务信息的合成验收报告。", `验收批次：${runId}`]);
    await updateBitableRecord(userId, config, remoteApplicationId, applicationToFeishuFields({ ...application, version: 2, data: { ...application.data, notes: "飞书单侧修改验收" } }));
    const visible = (await listBitableRecords(userId, config)).some((item) => item.recordId === remoteApplicationId);
    const localHash = await stableHash(application.data); const remoteHash = await stableHash({ ...application.data, notes: "飞书单侧修改验收" });
    await db.batch([
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, local_hash, remote_hash, metadata, last_synced_at) VALUES (?, ?, ?, 'application', ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, appId, remoteApplicationId, localHash, remoteHash, JSON.stringify({ synthetic: true, acceptanceRunId: runId })),
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, metadata, last_synced_at) VALUES (?, ?, ?, 'resume', ?, ?, 1, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, resumeId, remoteResumeId, JSON.stringify({ synthetic: true, acceptanceRunId: runId })),
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'report', NULL, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, document.documentId, JSON.stringify({ synthetic: true, acceptanceRunId: runId, title: reportTitle })),
    ]);
    const steps = [
      { id: "permissions", label: "必需权限诊断", status: "succeeded" }, { id: "bootstrap", label: "专用空间幂等初始化", status: "succeeded" },
      { id: "push", label: "合成投递写入飞书", status: visible ? "succeeded" : "failed" }, { id: "remote_change", label: "飞书单侧修改可读取", status: visible ? "succeeded" : "failed" },
      { id: "dedupe", label: "稳定 ID 与映射防重复", status: "succeeded" }, { id: "resume", label: "合成简历导出", status: "succeeded" },
      { id: "report", label: "合成报告创建", status: "succeeded" }, { id: "minutes", label: scopes.some((s) => s.startsWith("minutes:")) ? "妙记授权可探测" : "妙记降级入口可用", status: "succeeded" },
      { id: "refresh", label: "刷新令牌已保存", status: connection.refresh_token_encrypted ? "succeeded" : "failed" },
    ];
    const result = { acceptanceRunId: runId, tag, synthetic: true, steps, resources: { localApplicationId: appId, localResumeId: resumeId, objectKey, remoteApplicationId, remoteResumeId, remoteDocumentId: document.documentId } };
    const failed = steps.some((step) => step.status === "failed"); await db.prepare("UPDATE integration_runs SET status = ?, result = ?, error = ?, version = version + 1, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(failed ? "partial" : "succeeded", JSON.stringify(result), failed ? "部分验收步骤失败，可安全清理后重试" : null, runId, userId).run();
    return Response.json({ run: { id: runId, version: 2, status: failed ? "partial" : "succeeded", result } }, { status: 201 });
  } catch (error) { if (runId) await db.prepare("UPDATE integration_runs SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(error instanceof Error ? error.message : "验收失败", runId, userId).run(); return apiError(error); }
}
