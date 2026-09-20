import { ApiError } from "@/lib/server-data";
import { applicationFieldMap, checklistFieldMap, feishuBitableAppInfo, feishuBitableTableId, type FeishuWorkspaceConfig, type RemoteApplication } from "@/lib/feishu-contracts";
import { feishuRequest } from "@/lib/feishu";

type Item = Record<string, unknown>;

async function createFolder(ownerId: string, name: string, parentToken = "") {
  const data = await feishuRequest<{ token?: string; folder?: { token?: string; url?: string } }>(ownerId, "/drive/v1/files/create_folder", { method: "POST", body: JSON.stringify({ name, folder_token: parentToken }) });
  const token = String(data.token ?? data.folder?.token ?? "");
  if (!token) throw new ApiError(502, `飞书未返回“${name}”文件夹标识`, "FEISHU_INVALID_RESPONSE");
  return { token, url: data.folder?.url ? String(data.folder.url) : `https://feishu.cn/drive/folder/${token}` };
}

async function listFiles(ownerId: string, folderToken: string) {
  const items: Item[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "200" });
    if (folderToken) query.set("folder_token", folderToken);
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuRequest<{ files?: Item[]; items?: Item[]; has_more?: boolean; page_token?: string }>(ownerId, `/drive/v1/files?${query}`);
    items.push(...(data.files ?? data.items ?? []));
    pageToken = data.has_more ? String(data.page_token ?? "") : "";
  } while (pageToken);
  return items;
}

async function ensureFolder(ownerId: string, name: string, parentToken: string, current?: string) {
  if (current) return { token: current, url: `https://feishu.cn/drive/folder/${current}` };
  {
    const existing = (await listFiles(ownerId, parentToken)).find((item) => String(item.name ?? "") === name && String(item.type ?? "") === "folder");
    if (existing?.token) return { token: String(existing.token), url: String(existing.url ?? `https://feishu.cn/drive/folder/${existing.token}`) };
  }
  return createFolder(ownerId, name, parentToken);
}

const bitableFields = [
  ...Object.values(applicationFieldMap).map((fieldName) => ({ field_name: fieldName, type: fieldName === applicationFieldMap.localVersion ? 2 : 1 })),
  ...Object.values(checklistFieldMap).map((fieldName) => ({ field_name: fieldName, type: 7 })),
];

async function ensureBitable(ownerId: string, folderToken: string, config: FeishuWorkspaceConfig, onAppReady?: (partial: FeishuWorkspaceConfig) => Promise<void>) {
  let appToken = config.bitableAppToken;
  let appUrl = config.bitableUrl;
  if (!appToken) {
    const existing = (await listFiles(ownerId, folderToken)).find((item) => {
      const type = String(item.type ?? "").toLowerCase();
      return String(item.name ?? "") === "OFFER 收割机 · 投递记录" && (type === "bitable" || type === "base" || String(item.url ?? "").includes("/base/"));
    });
    const existingInfo = feishuBitableAppInfo(existing ?? {});
    appToken = existingInfo.appToken;
    appUrl = existingInfo.url;
  }
  if (!appToken) {
    const created = await feishuRequest<{ app?: Item; app_token?: string; url?: string }>(ownerId, "/bitable/v1/apps", { method: "POST", body: JSON.stringify({ name: "OFFER 收割机 · 投递记录", folder_token: folderToken }) });
    const createdInfo = feishuBitableAppInfo(created as Item);
    appToken = createdInfo.appToken;
    appUrl = createdInfo.url;
  }
  if (!appToken) throw new ApiError(502, "飞书未返回多维表格标识", "FEISHU_INVALID_RESPONSE");
  if (onAppReady) await onAppReady({ ...config, bitableAppToken: appToken, bitableUrl: appUrl });
  const tables = await feishuRequest<{ items?: Item[] }>(ownerId, `/bitable/v1/apps/${appToken}/tables?page_size=100`);
  let table = (tables.items ?? []).find((item) => String(item.name ?? "") === "投递记录");
  let tableId = table ? feishuBitableTableId(table) : "";
  if (!table) {
    const created = await feishuRequest<{ table?: Item; table_id?: string; id?: string }>(ownerId, `/bitable/v1/apps/${appToken}/tables`, { method: "POST", body: JSON.stringify({ table: { name: "投递记录", default_view_name: "全部投递", fields: bitableFields } }) });
    tableId = feishuBitableTableId(created as Item);
    if (!tableId) {
      const refreshed = await feishuRequest<{ items?: Item[] }>(ownerId, `/bitable/v1/apps/${appToken}/tables?page_size=100`);
      table = (refreshed.items ?? []).find((item) => String(item.name ?? "") === "投递记录");
      tableId = table ? feishuBitableTableId(table) : "";
    }
  }
  if (!tableId) throw new ApiError(502, "飞书已响应创建数据表，但重新查询后仍未找到数据表标识", "FEISHU_INVALID_RESPONSE");
  const existing = await feishuRequest<{ items?: Item[] }>(ownerId, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`);
  const byName = new Map((existing.items ?? []).map((field) => [String(field.field_name ?? field.name ?? ""), field]));
  for (const definition of bitableFields) {
    if (!byName.has(definition.field_name)) {
      const created = await feishuRequest<{ field?: Item }>(ownerId, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, { method: "POST", body: JSON.stringify(definition) });
      if (created.field) byName.set(definition.field_name, created.field);
    }
  }
  return { appToken, appUrl, tableId, fieldIds: Object.fromEntries([...byName].map(([name, field]) => [name, String(field.field_id ?? field.id ?? "")])) };
}

export async function bootstrapWorkspace(ownerId: string, current: FeishuWorkspaceConfig, onProgress?: (config: FeishuWorkspaceConfig) => Promise<void>) {
  let workspace = { ...current };
  const save = async (next: FeishuWorkspaceConfig) => {
    workspace = next;
    if (onProgress) await onProgress(workspace);
  };
  const root = await ensureFolder(ownerId, "OFFER 收割机", "", current.rootFolderToken);
  await save({ ...workspace, rootFolderToken: root.token, rootFolderUrl: root.url });
  const resumes = await ensureFolder(ownerId, "简历", root.token, workspace.resumeFolderToken);
  await save({ ...workspace, resumeFolderToken: resumes.token });
  const reports = await ensureFolder(ownerId, "分析报告", root.token, workspace.reportFolderToken);
  await save({ ...workspace, reportFolderToken: reports.token });
  const interviews = await ensureFolder(ownerId, "面试复盘", root.token, workspace.interviewFolderToken);
  await save({ ...workspace, interviewFolderToken: interviews.token });
  const bitable = await ensureBitable(ownerId, root.token, workspace, async (partial) => save({ ...workspace, ...partial }));
  await save({ ...workspace, bitableAppToken: bitable.appToken, bitableUrl: bitable.appUrl, tableId: bitable.tableId, fieldIds: bitable.fieldIds, bootstrappedAt: new Date().toISOString() });
  return workspace satisfies FeishuWorkspaceConfig;
}

export async function listBitableRecords(ownerId: string, config: FeishuWorkspaceConfig) {
  if (!config.bitableAppToken || !config.tableId) throw new ApiError(409, "请先初始化飞书专用空间", "FEISHU_NOT_BOOTSTRAPPED");
  const records: RemoteApplication[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuRequest<{ items?: Item[]; has_more?: boolean; page_token?: string }>(ownerId, `/bitable/v1/apps/${config.bitableAppToken}/tables/${config.tableId}/records?${query}`);
    records.push(...(data.items ?? []).map((item) => ({ recordId: String(item.record_id ?? item.id), fields: (item.fields ?? {}) as Record<string, unknown> })));
    pageToken = data.has_more ? String(data.page_token ?? "") : "";
  } while (pageToken);
  return records;
}

export async function createBitableRecord(ownerId: string, config: FeishuWorkspaceConfig, fields: Record<string, unknown>) {
  const data = await feishuRequest<{ record?: Item }>(ownerId, `/bitable/v1/apps/${config.bitableAppToken}/tables/${config.tableId}/records`, { method: "POST", body: JSON.stringify({ fields }) });
  const id = String(data.record?.record_id ?? data.record?.id ?? "");
  if (!id) throw new ApiError(502, "飞书未返回记录标识", "FEISHU_INVALID_RESPONSE");
  return id;
}

export async function updateBitableRecord(ownerId: string, config: FeishuWorkspaceConfig, recordId: string, fields: Record<string, unknown>) {
  await feishuRequest(ownerId, `/bitable/v1/apps/${config.bitableAppToken}/tables/${config.tableId}/records/${recordId}`, { method: "PUT", body: JSON.stringify({ fields }) });
}

export async function deleteBitableRecord(ownerId: string, config: FeishuWorkspaceConfig, recordId: string) {
  await feishuRequest(ownerId, `/bitable/v1/apps/${config.bitableAppToken}/tables/${config.tableId}/records/${recordId}`, { method: "DELETE" });
}

export async function listWorkspaceFiles(ownerId: string, config: FeishuWorkspaceConfig, folder: "resumes" | "reports" | "interviews" = "resumes") {
  const token = folder === "resumes" ? config.resumeFolderToken : folder === "reports" ? config.reportFolderToken : config.interviewFolderToken;
  if (!token) throw new ApiError(409, "请先初始化飞书专用空间", "FEISHU_NOT_BOOTSTRAPPED");
  return listFiles(ownerId, token);
}

export async function uploadDriveFile(ownerId: string, folderToken: string, filename: string, mime: string, bytes: ArrayBuffer) {
  const form = new FormData();
  form.append("file_name", filename);
  form.append("parent_type", "explorer");
  form.append("parent_node", folderToken);
  form.append("size", String(bytes.byteLength));
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const data = await feishuRequest<{ file_token?: string }>(ownerId, "/drive/v1/medias/upload_all", { method: "POST", body: form });
  if (!data.file_token) throw new ApiError(502, "飞书未返回文件标识", "FEISHU_INVALID_RESPONSE");
  return String(data.file_token);
}

export async function deleteDriveFile(ownerId: string, token: string, type: "file" | "docx" = "file") {
  await feishuRequest(ownerId, `/drive/v1/files/${encodeURIComponent(token)}?type=${type}`, { method: "DELETE" });
}

export async function downloadDriveFile(ownerId: string, token: string) {
  const row = await import("@/lib/feishu");
  // Binary downloads are not wrapped by feishuRequest because they do not return a JSON envelope.
  const connection = await row.getFeishuConnection(ownerId);
  if (!connection?.access_token_encrypted) throw new ApiError(409, "请先连接飞书", "FEISHU_NOT_CONNECTED");
  const access = await row.decryptSecret(String(connection.access_token_encrypted));
  const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(token)}/download`, { headers: { authorization: `Bearer ${access}` } });
  if (!response.ok) throw new ApiError(response.status, "飞书文件下载失败", "FEISHU_DOWNLOAD_FAILED", response.status === 429 || response.status >= 500);
  return response.arrayBuffer();
}

export async function exportDocumentFile(ownerId: string, token: string, type = "docx", extension = "docx") {
  const task = await feishuRequest<{ ticket?: string }>(ownerId, "/drive/v1/export_tasks", { method: "POST", body: JSON.stringify({ file_extension: extension, token, type }) });
  if (!task.ticket) throw new ApiError(502, "飞书未返回文档导出任务", "FEISHU_INVALID_RESPONSE");
  let fileToken = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const query = new URLSearchParams({ token });
    const detail = await feishuRequest<{ result?: Item; job_status?: number; file_token?: string }>(ownerId, `/drive/v1/export_tasks/${encodeURIComponent(task.ticket)}?${query}`);
    fileToken = String(detail.file_token ?? detail.result?.file_token ?? "");
    if (fileToken) break;
    if ([2, 3].includes(Number(detail.job_status ?? detail.result?.job_status))) throw new ApiError(502, String(detail.result?.job_error_msg ?? "飞书文档导出失败"), "FEISHU_EXPORT_FAILED");
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (!fileToken) throw new ApiError(202, "飞书文档仍在导出，请稍后重试导入", "FEISHU_EXPORT_PENDING", true);
  const row = await import("@/lib/feishu"); const connection = await row.getFeishuConnection(ownerId); if (!connection?.access_token_encrypted) throw new ApiError(409, "请先连接飞书", "FEISHU_NOT_CONNECTED"); const access = await row.decryptSecret(String(connection.access_token_encrypted)); const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/export_tasks/file/${encodeURIComponent(fileToken)}/download`, { headers: { authorization: `Bearer ${access}` } }); if (!response.ok) throw new ApiError(response.status, "飞书导出文件下载失败", "FEISHU_DOWNLOAD_FAILED", response.status === 429 || response.status >= 500); return response.arrayBuffer();
}

export async function createNativeDocument(ownerId: string, folderToken: string, title: string, paragraphs: string[]) {
  const created = await feishuRequest<{ document?: Item }>(ownerId, "/docx/v1/documents", { method: "POST", body: JSON.stringify({ folder_token: folderToken, title }) });
  const documentId = String(created.document?.document_id ?? created.document?.id ?? "");
  if (!documentId) throw new ApiError(502, "飞书未返回文档标识", "FEISHU_INVALID_RESPONSE");
  const children = paragraphs.filter(Boolean).slice(0, 300).map((content) => ({ block_type: 2, text: { elements: [{ text_run: { content: content.slice(0, 10_000) } }] } }));
  if (children.length) await feishuRequest(ownerId, `/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_create`, { method: "POST", body: JSON.stringify({ children, index: -1 }) });
  return { documentId, url: `https://feishu.cn/docx/${documentId}` };
}

export async function appendNativeDocument(ownerId: string, documentId: string, paragraphs: string[]) {
  const children = paragraphs.filter(Boolean).slice(0, 300).map((content) => ({ block_type: 2, text: { elements: [{ text_run: { content: content.slice(0, 10_000) } }] } }));
  if (children.length) await feishuRequest(ownerId, `/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_create`, { method: "POST", body: JSON.stringify({ children, index: -1 }) });
  return { documentId, url: `https://feishu.cn/docx/${documentId}` };
}

export async function readDocumentText(ownerId: string, documentId: string) {
  const data = await feishuRequest<{ content?: string }>(ownerId, `/docx/v1/documents/${documentId}/raw_content`);
  return String(data.content ?? "");
}
