import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";
import { analyzeResumeFile } from "@/lib/qwen";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

const PreviewSchema = z.object({ text: z.string().max(200000) }).strict();
const previewJsonSchema = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };

function decodeXml(text: string) {
  return text.replace(/<w:tab\s*\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((line) => line.trim()).filter(Boolean).join("\n").slice(0, 200000);
}

export async function GET(request: Request) {
  try { const { userId } = await requireApiUser(); const id = new URL(request.url).searchParams.get("id"); if (!id) throw new ApiError(400, "缺少文件 ID"); const row = await getBindings().db.prepare("SELECT metadata, version FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(id, userId).first<Record<string, unknown>>(); if (!row) throw new ApiError(404, "简历不存在"); const metadata = safeJson<Record<string, unknown>>(String(row.metadata), {}); return Response.json({ text: String(metadata.previewText || ""), generatedAt: metadata.previewGeneratedAt || null, version: Number(row.version) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const body = await request.json() as { id?: string; version?: number }; if (!body.id) throw new ApiError(400, "缺少文件 ID"); if (!Number.isInteger(body.version)) throw new ApiError(400, "生成预览必须提供版本号", "VERSION_REQUIRED"); const { db, bucket } = getBindings(); const row = await db.prepare("SELECT object_key, filename, mime_type, metadata, version FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(body.id, userId).first<Record<string, unknown>>(); if (!row) throw new ApiError(404, "简历不存在"); if (Number(row.version) !== body.version) throw new ApiError(409, "简历已在其他设备更新", "VERSION_CONFLICT", false, { currentVersion: Number(row.version) }); const object = await bucket.get(String(row.object_key)); if (!object) throw new ApiError(404, "简历原文件不存在"); const bytes = await object.arrayBuffer(); let text = "";
    if (String(row.mime_type).includes("wordprocessingml")) { const files = unzipSync(new Uint8Array(bytes)); const xml = files["word/document.xml"]; if (!xml) throw new ApiError(422, "DOCX 中未找到正文"); text = decodeXml(strFromU8(xml)); }
    else if (String(row.mime_type) === "application/msword") { const result = await analyzeResumeFile({ bytes, filename: String(row.filename) }, "只提取文档正文，按原有段落顺序返回 text。不得概括、补写或润色。", previewJsonSchema, PreviewSchema); text = String(result.text || ""); }
    else throw new ApiError(415, "当前文本预览只支持 DOCX 和 DOC");
    if (!text.trim()) throw new ApiError(422, "文档中没有解析到可显示的正文"); const metadata = { ...safeJson<Record<string, unknown>>(String(row.metadata), {}), previewText: text, previewGeneratedAt: new Date().toISOString() }; await db.prepare("UPDATE stored_files SET metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(JSON.stringify(metadata), body.id, userId, body.version).run(); return Response.json({ text, generatedAt: metadata.previewGeneratedAt, version: Number(row.version) + 1 });
  } catch (error) { return apiError(error); }
}
