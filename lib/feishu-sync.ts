import { applicationToFeishuFields, feishuFieldsToApplication, isRemoteImportable, normalizeApplicationData, remoteLocalId, type LocalApplication, type RemoteApplication, type SyncMapping, type SyncPreviewItem } from "./feishu-contracts.ts";

async function deterministicHash(value: unknown) {
  function sort(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
    return input;
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(sort(value))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function localApplicationHash(item: LocalApplication) {
  return deterministicHash(normalizeApplicationData(item.data));
}

export async function remoteApplicationHash(item: RemoteApplication) {
  return deterministicHash(normalizeApplicationData(feishuFieldsToApplication(item.fields)));
}

export async function buildSyncPreview(locals: LocalApplication[], remotes: RemoteApplication[], mappings: SyncMapping[]) {
  const localById = new Map(locals.map((item) => [item.id, item]));
  const remoteById = new Map(remotes.map((item) => [item.recordId, item]));
  const mappingByLocal = new Map(mappings.filter((item) => item.localId).map((item) => [item.localId!, item]));
  const mappingByRemote = new Map(mappings.filter((item) => item.remoteId).map((item) => [item.remoteId!, item]));
  const remoteByLocal = new Map<string, RemoteApplication>();
  for (const item of remotes) { const id = remoteLocalId(item.fields); if (id) remoteByLocal.set(id, item); }
  const usedRemote = new Set<string>();
  const result: SyncPreviewItem[] = [];

  for (const local of locals) {
    const mapping = mappingByLocal.get(local.id);
    const remote = (mapping?.remoteId ? remoteById.get(mapping.remoteId) : undefined) ?? remoteByLocal.get(local.id);
    const localHash = await localApplicationHash(local);
    if (!remote) {
      result.push({ id: crypto.randomUUID(), type: mapping?.remoteId ? "deletion_warning" : "local_only", localId: local.id, remoteId: mapping?.remoteId ?? null, localVersion: local.version, localHash, remoteHash: null, local: local.data, remote: null, message: mapping?.remoteId ? "飞书侧记录已删除，不会自动删除本地记录" : "仅本地存在，建议写入飞书", defaultDecision: mapping?.remoteId ? "skip" : "local" });
      continue;
    }
    usedRemote.add(remote.recordId);
    const remoteHash = await remoteApplicationHash(remote);
    const remoteData = feishuFieldsToApplication(remote.fields);
    const snapshotLocal = mapping?.localHash ?? null;
    const snapshotRemote = mapping?.remoteHash ?? null;
    const localChanged = !snapshotLocal || snapshotLocal !== localHash;
    const remoteChanged = !snapshotRemote || snapshotRemote !== remoteHash;
    let type: SyncPreviewItem["type"] = "unchanged";
    let message = "两侧内容与上次同步一致";
    let defaultDecision: SyncPreviewItem["defaultDecision"] = "skip";
    if (!mapping && localHash === remoteHash) { type = "unchanged"; message = "已按稳定 ID 匹配，内容一致"; }
    else if (!mapping) { type = "conflict"; message = "首次匹配时两侧内容不同"; defaultDecision = "local"; }
    else if (localChanged && remoteChanged) { type = "conflict"; message = "两侧自上次同步后均有修改"; defaultDecision = "local"; }
    else if (localChanged) { type = "push"; message = "仅 OFFER 收割机有修改"; defaultDecision = "local"; }
    else if (remoteChanged) { type = "pull"; message = "仅飞书有修改"; defaultDecision = "remote"; }
    result.push({ id: crypto.randomUUID(), type, localId: local.id, remoteId: remote.recordId, localVersion: local.version, localHash, remoteHash, local: local.data, remote: remoteData, message, defaultDecision });
  }

  for (const remote of remotes) {
    if (usedRemote.has(remote.recordId)) continue;
    const mapping = mappingByRemote.get(remote.recordId);
    const linkedId = remoteLocalId(remote.fields) ?? mapping?.localId ?? null;
    if (linkedId && localById.has(linkedId)) continue;
    const remoteData = feishuFieldsToApplication(remote.fields);
    const remoteHash = await remoteApplicationHash(remote);
    const invalid = !isRemoteImportable(remoteData);
    result.push({ id: crypto.randomUUID(), type: mapping?.localId ? "deletion_warning" : invalid ? "invalid_remote" : "remote_only", localId: mapping?.localId ?? linkedId, remoteId: remote.recordId, localVersion: null, localHash: null, remoteHash, local: null, remote: remoteData, message: mapping?.localId ? "本地记录已删除，不会自动删除飞书记录" : invalid ? "缺少公司或岗位，不能导入" : "仅飞书存在，确认后创建本地投递", defaultDecision: mapping?.localId || invalid ? "skip" : "remote" });
  }
  return result;
}

export { applicationToFeishuFields };
