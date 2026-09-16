import { env } from "cloudflare:workers";
import { ApiError } from "@/lib/server-data";

type JsonSchema = Record<string, unknown>;

function config() {
  const values = env as unknown as Record<string, string | undefined>;
  const apiKey = values.DASHSCOPE_API_KEY;
  const baseUrl = (values.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  if (!apiKey) throw new ApiError(503, "AI 服务尚未配置，请先设置百炼 API Key");
  return { apiKey, baseUrl };
}

async function qwenFetch(path: string, init: RequestInit) {
  const { apiKey, baseUrl } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `AI 服务请求失败（${response.status}）`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message || parsed.message || message;
    } catch {}
    throw new ApiError(response.status === 429 ? 429 : 502, message);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApiError(502, "AI 服务返回了无法解析的结果");
  }
}

function parseJsonContent(content: unknown) {
  const text = Array.isArray(content)
    ? content.map((item) => (item && typeof item === "object" && "text" in item ? String((item as { text: unknown }).text) : "")).join("")
    : String(content ?? "");
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new ApiError(502, "AI 结果未通过结构化校验，请重试");
  }
}

export async function structuredChat(options: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  model?: string;
  search?: boolean;
}) {
  const payload: Record<string, unknown> = {
    model: options.model || "qwen3.8-max",
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: options.schemaName, strict: true, schema: options.schema },
    },
    temperature: 0.15,
  };
  if (options.search) {
    payload.enable_search = true;
    payload.enable_source = true;
    payload.forced_search = true;
    payload.search_options = { search_strategy: "max" };
  }
  let response: Record<string, unknown>;
  try {
    response = await qwenFetch("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!(error instanceof ApiError) || !String(error.message).toLowerCase().includes("response_format")) throw error;
    delete payload.response_format;
    (payload.messages as Array<Record<string, unknown>>)[0].content += "\n必须只返回符合用户指定结构的 JSON，不要添加 Markdown。";
    response = await qwenFetch("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
  if (!choices?.[0]?.message) throw new ApiError(502, "AI 服务没有返回有效结果");
  return { data: parseJsonContent(choices[0].message.content), raw: response };
}

export async function analyzeResumeFile(file: { bytes: ArrayBuffer; filename: string }, prompt: string, schema: JsonSchema) {
  const form = new FormData();
  form.set("purpose", "file-extract");
  form.set("file", new File([file.bytes], file.filename));
  const uploaded = await qwenFetch("/files", { method: "POST", body: form });
  const fileId = String(uploaded.id || "");
  if (!fileId) throw new ApiError(502, "简历文档上传到分析服务失败");
  try {
    let status = "processing";
    for (let attempt = 0; attempt < 12 && status === "processing"; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
      const detail = await qwenFetch(`/files/${encodeURIComponent(fileId)}`, { method: "GET" });
      status = String(detail.status || "processed");
      if (["error", "failed"].includes(status)) throw new ApiError(502, "简历文档解析失败");
    }
    if (status === "processing") throw new ApiError(504, "简历解析超时，请稍后重试");
    const response = await qwenFetch("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "qwen-doc-turbo",
        messages: [
          { role: "system", content: "你是严格事实模式的中文简历分析器。禁止补写文档中不存在的经历、数字或能力。" },
          { role: "system", content: `fileid://${fileId}` },
          { role: "user", content: `${prompt}\n只返回 JSON，不要添加 Markdown。JSON Schema：${JSON.stringify(schema)}` },
        ],
        temperature: 0.1,
      }),
    });
    const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
    return parseJsonContent(choices?.[0]?.message?.content);
  } finally {
    await qwenFetch(`/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch(() => undefined);
  }
}

export async function transcribeAudio(file: { bytes: ArrayBuffer; filename: string; mimeType: string }) {
  if (file.bytes.byteLength > 10 * 1024 * 1024) throw new ApiError(413, "单段音频需小于 10 MB；长录音请在录音时使用自动分段");
  const form = new FormData();
  form.set("model", "qwen3-asr-flash");
  form.set("file", new File([file.bytes], file.filename, { type: file.mimeType }));
  const result = await qwenFetch("/audio/transcriptions", { method: "POST", body: form });
  return { text: String(result.text || ""), raw: result };
}
