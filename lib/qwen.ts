import { env } from "cloudflare:workers";
import { ApiError } from "@/lib/server-data";
import type { ZodType } from "zod";

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
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
    });
  } catch {
    throw new ApiError(502, "无法连接 AI 服务，请稍后重试", "NETWORK_ERROR", true);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = `AI 服务请求失败（${response.status}）`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message || parsed.message || message;
    } catch {}
    const retryable = response.status === 429 || response.status >= 500;
    throw new ApiError(response.status === 429 ? 429 : 502, message, `QWEN_${response.status}`, retryable);
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
  validator?: ZodType;
  maxTokens?: number;
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
    max_tokens: options.maxTokens || 2600,
    enable_thinking: Boolean(options.search),
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
  const parsed = parseJsonContent(choices[0].message.content);
  let data: Record<string, unknown>;
  try {
    data = options.validator ? options.validator.parse(parsed) as Record<string, unknown> : parsed;
  } catch {
    throw new ApiError(502, "AI 结果未通过结构校验，请重试", "SCHEMA_INVALID", false);
  }
  return { data, raw: response, usage: (response.usage || {}) as Record<string, unknown> };
}

export async function analyzeResumeFile(file: { bytes: ArrayBuffer; filename: string }, prompt: string, schema: JsonSchema, validator?: ZodType) {
  const form = new FormData();
  form.set("purpose", "file-extract");
  form.set("file", new File([file.bytes], file.filename));
  const uploaded = await qwenFetch("/files", { method: "POST", body: form });
  const fileId = String(uploaded.id || "");
  if (!fileId) throw new ApiError(502, "简历文档上传到分析服务失败");
  try {
    let status = "checking";
    for (let attempt = 0; attempt < 18 && ["checking", "processing", "pending", "uploaded"].includes(status); attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
      const detail = await qwenFetch(`/files/${encodeURIComponent(fileId)}`, { method: "GET" });
      status = String(detail.status || "available").toLowerCase();
      if (["error", "failed"].includes(status)) throw new ApiError(502, "简历文档解析失败");
    }
    if (["checking", "processing", "pending", "uploaded"].includes(status)) throw new ApiError(504, "简历解析超时，请稍后重试", "DOCUMENT_TIMEOUT", true);
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
    const parsed = parseJsonContent(choices?.[0]?.message?.content);
    try {
      return validator ? validator.parse(parsed) as Record<string, unknown> : parsed;
    } catch {
      throw new ApiError(502, "简历分析结果未通过结构校验，请重试", "SCHEMA_INVALID", false);
    }
  } finally {
    await qwenFetch(`/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch(() => undefined);
  }
}

export type SearchSource = { title: string; url: string; publishedAt: string | null; crawledAt: string };

export function extractSearchSources(raw: Record<string, unknown>): SearchSource[] {
  const found: SearchSource[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown, insideSearchInfo = false) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, insideSearchInfo)); return; }
    const object = value as Record<string, unknown>;
    const isSearch = insideSearchInfo || "search_info" in object;
    if (isSearch) {
      const urlValue = object.url ?? object.link;
      if (typeof urlValue === "string") {
        try {
          const url = new URL(urlValue);
          if ((url.protocol === "https:" || url.protocol === "http:") && !seen.has(url.href)) {
            seen.add(url.href);
            found.push({ title: String(object.title ?? object.name ?? url.hostname), url: url.href, publishedAt: object.publish_time ? String(object.publish_time) : object.published_at ? String(object.published_at) : null, crawledAt: new Date().toISOString() });
          }
        } catch {}
      }
    }
    Object.entries(object).forEach(([key, child]) => visit(child, insideSearchInfo || key === "search_info"));
  };
  visit(raw, false);
  return found;
}

export function aiErrorDetails(error: unknown) {
  if (error instanceof ApiError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "UNKNOWN_ERROR", message: error instanceof Error ? error.message : "未知错误", retryable: false };
}

export async function responsesSearch(options: { system: string; prompt: string; schemaName: string; schema: JsonSchema; validator?: ZodType }) {
  const response = await qwenFetch("/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.8-max",
      input: `${options.system}\n\n${options.prompt}\n只返回符合指定结构的 JSON。`,
      tools: [{ type: "web_search" }, { type: "web_extractor" }],
      enable_thinking: true,
      text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
    }),
  });
  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  const content = output.flatMap((item) => Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []).map((item) => item.text).filter((item): item is string => typeof item === "string").join("");
  const parsed = parseJsonContent(content || response.output_text);
  let data: Record<string, unknown>;
  try { data = options.validator ? options.validator.parse(parsed) as Record<string, unknown> : parsed; }
  catch { throw new ApiError(502, "联网背调结果未通过结构校验，请重试", "SCHEMA_INVALID", false); }
  const sources: SearchSource[] = [];
  const seen = new Set<string>();
  for (const item of output.filter((entry) => entry.type === "web_search_call")) {
    const action = item.action && typeof item.action === "object" ? item.action as Record<string, unknown> : {};
    for (const source of Array.isArray(action.sources) ? action.sources : []) {
      const rawUrl = typeof source === "string" ? source : source && typeof source === "object" ? String((source as Record<string, unknown>).url || "") : "";
      try {
        const url = new URL(rawUrl);
        if (!seen.has(url.href)) { seen.add(url.href); const object = typeof source === "object" && source ? source as Record<string, unknown> : {}; sources.push({ title: String(object.title || url.hostname), url: url.href, publishedAt: object.published_at ? String(object.published_at) : null, crawledAt: new Date().toISOString() }); }
      } catch {}
    }
  }
  return { data, sources, raw: response, usage: (response.usage || {}) as Record<string, unknown> };
}

export async function transcribeAudio(file: { bytes: ArrayBuffer; filename: string; mimeType: string }) {
  if (file.bytes.byteLength > 10 * 1024 * 1024) throw new ApiError(413, "单段音频需小于 10 MB；长录音请在录音时使用自动分段");
  const bytes = new Uint8Array(file.bytes);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const dataUrl = `data:${file.mimeType || "audio/webm"};base64,${btoa(binary)}`;
  const result = await qwenFetch("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "qwen3-asr-flash",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: dataUrl } }] }],
      stream: false,
      asr_options: { enable_itn: true },
    }),
  });
  const choices = result.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const text = String(choices?.[0]?.message?.content || "").trim();
  if (!text) throw new ApiError(502, "语音识别服务没有返回转写文本");
  return { text, raw: result };
}

function bufferDataUrl(bytes: ArrayBuffer, mimeType: string) {
  const view = new Uint8Array(bytes); let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function ocrImage(file: { bytes: ArrayBuffer; mimeType: string }) {
  if (file.bytes.byteLength > 10 * 1024 * 1024) throw new ApiError(413, "岗位截图不能超过 10 MB");
  const response = await qwenFetch("/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.5-ocr",
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: bufferDataUrl(file.bytes, file.mimeType) } },
        { type: "text", text: "逐字提取这张招聘岗位截图中的可见文字。不要补充图中不存在的内容。" },
      ] }],
      max_tokens: 6000,
    }),
  });
  const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const text = String(choices?.[0]?.message?.content || "").trim();
  if (!text) throw new ApiError(422, "截图中没有识别到可用的岗位文字");
  return { text, raw: response };
}
