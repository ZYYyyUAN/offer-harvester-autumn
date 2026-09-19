import { z } from "zod";
import { feishuRequest, getFeishuConnection } from "@/lib/feishu";
import { minutesPreviewSchema } from "@/lib/feishu-contracts";
import { analyzeResumeFile } from "@/lib/qwen";
import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).filter(([key]) => ["text", "content", "sentence", "transcript", "segments", "items"].includes(key)).flatMap(([, item]) => collectText(item));
  return [];
}

async function transcriptFromFile(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new ApiError(413, "转写文件不能超过 20 MB");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "srt") return { title: file.name.replace(/\.[^.]+$/, ""), transcript: (await file.text()).trim() };
  if (extension !== "docx") throw new ApiError(415, "仅支持 TXT、SRT 和 DOCX 转写文件");
  const validator = z.object({ title: z.string().max(180), text: z.string().max(500_000) }).strict();
  const extracted = await analyzeResumeFile({ bytes: await file.arrayBuffer(), filename: file.name }, "逐字提取这份面试转写文档的标题和全部正文。不得总结、改写或补充，保留发言顺序；若无标题则使用文件名。", { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" } } }, validator);
  return { title: String(extracted.title || file.name.replace(/\.[^.]+$/, "")), transcript: String(extracted.text || "").trim() };
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    let title = "飞书妙记导入"; let transcript = ""; let sourceUrl: string | null = null;
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new ApiError(400, "请选择转写文件"); const extracted = await transcriptFromFile(file); title = extracted.title; transcript = extracted.transcript;
    } else {
      const body = minutesPreviewSchema.parse(await request.json()); title = body.title?.trim() || title; transcript = body.text?.trim() || ""; sourceUrl = body.url || null;
      if (body.url) { const match = new URL(body.url).pathname.match(/(?:minutes|minute)\/([^/?#]+)/); if (!match) throw new ApiError(400, "无法识别妙记链接，请改用文本或导出文件导入"); const token = match[1]; const info = await feishuRequest<Record<string, unknown>>(userId, `/minutes/v1/minutes/${encodeURIComponent(token)}`); const detail = await feishuRequest<Record<string, unknown>>(userId, `/minutes/v1/minutes/${encodeURIComponent(token)}/transcript`); title = String(info.title ?? (info.minute && typeof info.minute === "object" ? (info.minute as Record<string, unknown>).title : "") ?? title); transcript = collectText(detail).join("\n").trim() || collectText(info).join("\n").trim(); }
    }
    if (!transcript) throw new ApiError(422, "没有可导入的转写文本");
    const id = crypto.randomUUID(); const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString(); const preview = { title, transcript, sourceUrl, importedAt: new Date().toISOString(), characterCount: transcript.length };
    await getDatabase().prepare("INSERT INTO integration_runs (id, owner_id, integration_id, run_type, status, preview, expires_at) VALUES (?, ?, ?, 'minutes_import', 'preview', ?, ?)").bind(id, userId, connection.id, JSON.stringify(preview), expiresAt).run();
    return Response.json({ run: { id, status: "preview", version: 1, expiresAt, preview } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
