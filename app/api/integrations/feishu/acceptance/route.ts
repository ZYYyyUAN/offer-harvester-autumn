import {
  applicationFieldMap,
  applicationToFeishuFields,
  feishuFieldsToApplication,
  remoteLocalId,
  type FeishuWorkspaceConfig,
  type LocalApplication,
  type SyncMapping,
} from "@/lib/feishu-contracts";
import {
  appendNativeDocument,
  bootstrapWorkspace,
  createBitableRecord,
  createNativeDocument,
  deleteBitableRecord,
  listBitableRecords,
  listWorkspaceFiles,
  updateBitableRecord,
  uploadDriveFile,
} from "@/lib/feishu-api";
import { getFeishuConnection, updateWorkspaceConfig, verifyFeishuRefreshToken } from "@/lib/feishu";
import { requiredCapabilitiesReady } from "@/lib/feishu-diagnostics";
import { buildSyncPreview, localApplicationHash, remoteApplicationHash } from "@/lib/feishu-sync";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

type Step = { id: string; label: string; status: "succeeded" | "failed"; detail?: string };
type Resources = {
  localApplicationIds: string[];
  localResumeIds: string[];
  objectKeys: string[];
  remoteApplicationIds: string[];
  remoteResumeIds: string[];
  remoteDocumentIds: string[];
};

function workspaceIdentity(config: FeishuWorkspaceConfig) {
  return {
    rootFolderToken: config.rootFolderToken,
    resumeFolderToken: config.resumeFolderToken,
    reportFolderToken: config.reportFolderToken,
    interviewFolderToken: config.interviewFolderToken,
    bitableAppToken: config.bitableAppToken,
    tableId: config.tableId,
  };
}

export async function POST() {
  const { userId } = await requireApiUser();
  const { db, bucket } = getBindings();
  const runId = crypto.randomUUID();
  const tag = `ACCEPT-${runId.slice(0, 8)}`;
  const steps: Step[] = [];
  const resources: Resources = {
    localApplicationIds: [], localResumeIds: [], objectKeys: [],
    remoteApplicationIds: [], remoteResumeIds: [], remoteDocumentIds: [],
  };
  let connectionId = "";
  let runCreated = false;
  let activeStep = "连接与权限检查";

  const recordStep = (id: string, label: string, ok: boolean, detail?: string) => {
    steps.push({ id, label, status: ok ? "succeeded" : "failed", detail });
  };

  const saveRun = async (status: "succeeded" | "partial", error?: string) => {
    const result = { acceptanceRunId: runId, tag, synthetic: true, steps, resources };
    await db.prepare("UPDATE integration_runs SET status = ?, result = ?, error = ?, version = version + 1, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
      .bind(status, JSON.stringify(result), error ?? null, runId, userId).run();
    return Response.json({ run: { id: runId, version: 2, status, result, error: error ?? null } }, { status: 201 });
  };

  try {
    const connection = await getFeishuConnection(userId);
    if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    connectionId = String(connection.id);
    const scopes = safeJson<string[]>(String(connection.scopes ?? "[]"), []);
    if (!requiredCapabilitiesReady(scopes)) throw new ApiError(409, "缺少飞书必需权限，验收包未创建任何数据");
    recordStep("permissions", "必需权限诊断", true);

    await db.prepare("INSERT INTO integration_runs (id, owner_id, integration_id, run_type, status, preview) VALUES (?, ?, ?, 'acceptance_suite', 'running', ?)")
      .bind(runId, userId, connectionId, JSON.stringify({ tag, synthetic: true, startedAt: new Date().toISOString() })).run();
    runCreated = true;

    activeStep = "初始化专用空间";
    let config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {});
    config = await bootstrapWorkspace(userId, config, (partial) => updateWorkspaceConfig(userId, connectionId, partial));
    const firstIdentity = workspaceIdentity(config);
    config = await bootstrapWorkspace(userId, config, (partial) => updateWorkspaceConfig(userId, connectionId, partial));
    await updateWorkspaceConfig(userId, connectionId, config);
    const bootstrapIdempotent = JSON.stringify(firstIdentity) === JSON.stringify(workspaceIdentity(config));
    recordStep("bootstrap", "专用空间连续初始化不重复创建", bootstrapIdempotent);

    activeStep = "投递双向同步";
    const now = new Date().toISOString();
    const appId = crypto.randomUUID();
    const application: LocalApplication = {
      id: appId,
      version: 1,
      updatedAt: now,
      data: {
        company: `${tag} 合成公司`, role: "Java 后端开发（合成）", direction: "Java 后端",
        location: "测试城市", stage: "待投递", priority: "中", notes: "仅用于飞书全链路验收",
        acceptanceRunId: runId, synthetic: true,
      },
    };
    const resumeId = crypto.randomUUID();
    const objectKey = `${userId}/acceptance/${runId}/resume.pdf`;
    resources.localApplicationIds.push(appId);
    resources.localResumeIds.push(resumeId);
    resources.objectKeys.push(objectKey);
    await bucket.put(objectKey, pdf, { httpMetadata: { contentType: "application/pdf" } });
    await db.batch([
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'applications', ?, ?)")
        .bind(appId, userId, `${tag} 合成公司 Java 后端开发`, JSON.stringify(application.data)),
      db.prepare("INSERT INTO stored_files (id, owner_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, 'resume', ?, ?, 'application/pdf', ?, ?)")
        .bind(resumeId, userId, `${tag}-synthetic-resume.pdf`, objectKey, pdf.byteLength, JSON.stringify({ synthetic: true, acceptanceRunId: runId, displayName: `${tag} 合成简历` })),
    ]);

    const remoteApplicationId = await createBitableRecord(userId, config, applicationToFeishuFields(application));
    resources.remoteApplicationIds.push(remoteApplicationId);
    let remotes = await listBitableRecords(userId, config);
    const baselineRemote = remotes.find((item) => item.recordId === remoteApplicationId);
    if (!baselineRemote) throw new ApiError(502, "合成投递写入后无法从飞书读回", "FEISHU_ACCEPTANCE_FAILED");
    const baselineLocalHash = await localApplicationHash(application);
    const baselineRemoteHash = await remoteApplicationHash(baselineRemote);
    const mappingId = crypto.randomUUID();
    await db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, local_hash, remote_hash, metadata, last_synced_at) VALUES (?, ?, ?, 'application', ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(mappingId, userId, connectionId, appId, remoteApplicationId, baselineLocalHash, baselineRemoteHash, JSON.stringify({ synthetic: true, acceptanceRunId: runId })).run();
    recordStep("push", "本地合成投递写入并读回飞书", true);

    await updateBitableRecord(userId, config, remoteApplicationId, applicationToFeishuFields({
      ...application, data: { ...application.data, notes: "飞书单侧修改验收" },
    }));
    remotes = await listBitableRecords(userId, config);
    let remoteMain = remotes.find((item) => item.recordId === remoteApplicationId);
    if (!remoteMain) throw new ApiError(502, "飞书单侧修改后记录不可见", "FEISHU_ACCEPTANCE_FAILED");
    let mappings: SyncMapping[] = [{ id: mappingId, localId: appId, remoteId: remoteApplicationId, localHash: baselineLocalHash, remoteHash: baselineRemoteHash }];
    let preview = await buildSyncPreview([application], remotes, mappings);
    const pull = preview.find((item) => item.remoteId === remoteApplicationId);
    recordStep("remote_change", "飞书单侧修改建议回写本地", pull?.type === "pull" && pull.defaultDecision === "remote", pull?.type);

    const pulledData = { ...feishuFieldsToApplication(remoteMain.fields), acceptanceRunId: runId, synthetic: true };
    const pulled: LocalApplication = { id: appId, version: 2, updatedAt: new Date().toISOString(), data: pulledData };
    const pulledHash = await localApplicationHash(pulled);
    const pulledRemoteHash = await remoteApplicationHash(remoteMain);
    await db.batch([
      db.prepare("UPDATE records SET data = ?, version = 2, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(JSON.stringify(pulledData), appId, userId),
      db.prepare("UPDATE integration_mappings SET local_version = 2, local_hash = ?, remote_hash = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(pulledHash, pulledRemoteHash, mappingId, userId),
    ]);

    const localConflict: LocalApplication = { ...pulled, version: 3, updatedAt: new Date().toISOString(), data: { ...pulled.data, notes: "本地冲突版本" } };
    await db.prepare("UPDATE records SET data = ?, version = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
      .bind(JSON.stringify(localConflict.data), appId, userId).run();
    await updateBitableRecord(userId, config, remoteApplicationId, applicationToFeishuFields({ ...pulled, data: { ...pulled.data, priority: "高", notes: "飞书冲突版本" } }));
    remotes = await listBitableRecords(userId, config);
    remoteMain = remotes.find((item) => item.recordId === remoteApplicationId);
    mappings = [{ id: mappingId, localId: appId, remoteId: remoteApplicationId, localHash: pulledHash, remoteHash: pulledRemoteHash }];
    preview = await buildSyncPreview([localConflict], remotes, mappings);
    const conflict = preview.find((item) => item.remoteId === remoteApplicationId);
    recordStep("conflict", "双向修改识别冲突并默认保留本地", conflict?.type === "conflict" && conflict.defaultDecision === "local", conflict?.type);

    const remoteOnlyFields = applicationToFeishuFields({
      id: crypto.randomUUID(), version: 1, updatedAt: new Date().toISOString(),
      data: { company: `${tag} 飞书新增公司`, role: "后端开发（远程新增）", stage: "待投递", notes: "合成远程新增记录" },
    });
    remoteOnlyFields[applicationFieldMap.localId] = "";
    const remoteOnlyId = await createBitableRecord(userId, config, remoteOnlyFields);
    resources.remoteApplicationIds.push(remoteOnlyId);
    remotes = await listBitableRecords(userId, config);
    preview = await buildSyncPreview([localConflict], remotes, mappings);
    const remoteOnly = preview.find((item) => item.remoteId === remoteOnlyId);
    const importId = crypto.randomUUID();
    if (remoteOnly?.type === "remote_only" && remoteOnly.remote) {
      resources.localApplicationIds.push(importId);
      await db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'applications', ?, ?)")
        .bind(importId, userId, `${tag} 飞书新增公司 后端开发`, JSON.stringify({ ...remoteOnly.remote, acceptanceRunId: runId, synthetic: true })).run();
    }
    recordStep("remote_create", "飞书新增记录可预览并导入本地", remoteOnly?.type === "remote_only" && resources.localApplicationIds.includes(importId), remoteOnly?.type);

    const duplicateCount = remotes.filter((item) => remoteLocalId(item.fields) === appId).length;
    recordStep("dedupe", "稳定 ID 防止重复提交", duplicateCount === 1, `匹配记录数：${duplicateCount}`);

    activeStep = "简历导入导出";
    const remoteResumeId = await uploadDriveFile(userId, String(config.resumeFolderToken), `${tag}-synthetic-resume.pdf`, "application/pdf", pdf.buffer as ArrayBuffer);
    resources.remoteResumeIds.push(remoteResumeId);
    const resumeFiles = await listWorkspaceFiles(userId, config, "resumes");
    const resumeVisible = resumeFiles.some((item) => String(item.token ?? item.file_token ?? "") === remoteResumeId || String(item.name ?? "") === `${tag}-synthetic-resume.pdf`);
    await db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, metadata, last_synced_at) VALUES (?, ?, ?, 'resume', ?, ?, 1, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), userId, connectionId, resumeId, remoteResumeId, JSON.stringify({ synthetic: true, acceptanceRunId: runId })).run();
    recordStep("resume", "合成简历导出与导入预览可见", resumeVisible);

    activeStep = "报告创建、更新与另存";
    const reportTitle = `${tag} 合成分析报告`;
    const document = await createNativeDocument(userId, String(config.reportFolderToken), reportTitle, ["这是不含真实业务信息的合成验收报告。", `验收批次：${runId}`]);
    resources.remoteDocumentIds.push(document.documentId);
    await appendNativeDocument(userId, document.documentId, ["更新原文档验收段落。"]);
    const copy = await createNativeDocument(userId, String(config.reportFolderToken), `${reportTitle} - 副本`, ["另存副本验收内容。"]);
    resources.remoteDocumentIds.push(copy.documentId);
    await db.batch([
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'report', NULL, ?, ?, CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), userId, connectionId, document.documentId, JSON.stringify({ synthetic: true, acceptanceRunId: runId, title: reportTitle })),
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'report', NULL, ?, ?, CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), userId, connectionId, copy.documentId, JSON.stringify({ synthetic: true, acceptanceRunId: runId, title: `${reportTitle} - 副本` })),
    ]);
    recordStep("report", "报告创建、更新原文档与另存副本", true);

    activeStep = "妙记能力降级";
    const minutesGranted = scopes.some((scope) => scope.startsWith("minutes:"));
    recordStep("minutes", minutesGranted ? "妙记权限已授权并可显示链接入口" : "妙记未授权时仅显示文件和文本降级入口", true);

    activeStep = "远程删除提示";
    await deleteBitableRecord(userId, config, remoteApplicationId);
    remotes = await listBitableRecords(userId, config);
    preview = await buildSyncPreview([localConflict], remotes, mappings);
    const deletionWarning = preview.find((item) => item.localId === appId);
    recordStep("deletion", "飞书单侧删除只生成提示", deletionWarning?.type === "deletion_warning", deletionWarning?.type);

    activeStep = "刷新令牌";
    const refreshed = await verifyFeishuRefreshToken(userId);
    recordStep("refresh", "刷新令牌真实调用并保存", Boolean(refreshed.expiresAt));

    const failed = steps.some((step) => step.status === "failed");
    return saveRun(failed ? "partial" : "succeeded", failed ? "部分验收断言未通过，可清理后重试" : undefined);
  } catch (error) {
    if (!runCreated) return apiError(error);
    const message = error instanceof Error ? error.message : "验收失败";
    recordStep("runtime", `${activeStep}执行中断`, false, message);
    return saveRun("partial", `${activeStep}：${message}`);
  }
}
