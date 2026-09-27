import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";
import { sha256Hex } from "@/lib/backup";

function readText(bytes: Uint8Array, start: number, length: number) { return new TextDecoder().decode(bytes.slice(start, start + length)).replace(/\0.*$/, "").trim(); }
function parseTar(bytes: Uint8Array) {
  const entries: Array<{ name: string; body: Uint8Array }> = []; let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512); if (header.every((value) => value === 0)) break;
    const name = readText(header, 0, 100); const size = Number.parseInt(readText(header, 124, 12).replace(/\s/g, "") || "0", 8);
    if (!name || !Number.isFinite(size) || size < 0 || offset + 512 + size > bytes.length) throw new ApiError(422, "附件包结构损坏");
    const body = bytes.slice(offset + 512, offset + 512 + size); entries.push({ name, body }); offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const { id } = await context.params; const length = Number(request.headers.get("content-length") || 0);
    if (!length || length > 90 * 1024 * 1024) throw new ApiError(413, "单个附件分包必须小于 90 MB");
    const { db, bucket } = getBindings(); const row = await db.prepare("SELECT data, version FROM records WHERE id = ? AND owner_id = ? AND kind = 'data_imports' AND deleted_at IS NULL").bind(id, userId).first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "导入预览不存在"); const preview = safeJson<Record<string, unknown>>(String(row.data), {}); if (new Date(String(preview.expiresAt)).getTime() < Date.now()) throw new ApiError(410, "导入预览已过期，请重新上传");
    const files = Array.isArray(preview.files) ? preview.files as Array<Record<string, unknown>> : []; const expectedByPath = new Map(files.map((file) => [String(file.archivePath), file])); const entries = parseTar(new Uint8Array(await request.arrayBuffer())); const uploaded = { ...(preview.fileUploads as Record<string, string> || {}) }; let accepted = 0;
    for (const entry of entries) {
      if (entry.name === "manifest.json") continue; const expected = expectedByPath.get(entry.name); if (!expected) throw new ApiError(422, `附件包包含未知文件：${entry.name}`);
      if (entry.body.byteLength !== Number(expected.size)) throw new ApiError(422, `附件大小不匹配：${entry.name}`); const hashBytes = new Uint8Array(entry.body.byteLength); hashBytes.set(entry.body); const hash = await sha256Hex(hashBytes.buffer); if (hash !== String(expected.sha256)) throw new ApiError(422, `附件校验失败：${entry.name}`);
      const objectKey = `${userId}/imports/${id}/${String(expected.id)}`; await bucket.put(objectKey, entry.body, { httpMetadata: { contentType: String(expected.mimeType) } }); uploaded[String(expected.id)] = objectKey; accepted++;
    }
    preview.fileUploads = uploaded; await db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(JSON.stringify(preview), id, userId, Number(row.version)).run();
    return Response.json({ ok: true, accepted, uploadedFiles: Object.keys(uploaded).length, requiredFiles: files.length });
  } catch (error) { return apiError(error); }
}
