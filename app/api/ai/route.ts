import { ApiError, apiError, getBindings, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";
import { analyzeResumeFile, structuredChat, transcribeAudio } from "@/lib/qwen";

const requirementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "requirements", "suggestions"],
  properties: {
    summary: { type: "string" },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "importance", "evidenceIds", "coverage", "reason"],
        properties: {
          label: { type: "string" },
          importance: { type: "string", enum: ["must", "important", "bonus"] },
          evidenceIds: { type: "array", items: { type: "string" } },
          coverage: { type: "string", enum: ["strong", "partial", "missing"] },
          reason: { type: "string" },
        },
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "suggestion", "evidenceIds", "risk"],
        properties: {
          issue: { type: "string" },
          suggestion: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          risk: { type: "string" },
        },
      },
    },
  },
};

const resumeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["facts", "suggestions", "warnings"],
  properties: {
    facts: { type: "array", items: { type: "object", additionalProperties: true } },
    suggestions: { type: "array", items: { type: "object", additionalProperties: true } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

async function saveAiRecord(userId: string, kind: string, title: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await getDatabase().prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, kind, title, JSON.stringify(data)).run();
  const row = await getDatabase().prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE id = ?")
    .bind(id).first<Record<string, unknown>>();
  return mapRecord(row!);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "healthCheck") {
      const healthModel = body.model === "qwen3.8-max" ? "qwen3.8-max" : "qwen3.8-flash";
      const result = await structuredChat({
        model: healthModel,
        system: "你是服务健康检查程序，只返回指定 JSON。",
        prompt: "返回可用状态。",
        schemaName: "ai_health",
        schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean", const: true } } },
      });
      return Response.json({ result: { ok: result.data.ok === true, model: healthModel, elapsedMs: Date.now() - startedAt } });
    }
    const { userId } = await requireApiUser();
    if (action === "jobAnalysis") {
      const jd = String(body.jd || "").trim();
      if (jd.length < 40) throw new ApiError(400, "请粘贴更完整的职位描述");
      const evidenceRows = await getDatabase().prepare("SELECT id, data FROM records WHERE owner_id = ? AND kind = 'evidence' AND deleted_at IS NULL")
        .bind(userId).all<Record<string, unknown>>();
      const evidence = (evidenceRows.results
        .map((row) => ({ id: String(row.id), ...safeJson<Record<string, unknown>>(String(row.data), {}) })) as Array<Record<string, unknown>>)
        .filter((item) => item.status === "confirmed");
      const result = await structuredChat({
        system: "你是证据优先的求职分析师。只能引用提供的已确认事实；没有证据必须标记 missing。不得虚构候选人经历、数字、教育和技能。",
        prompt: `职位描述：\n${jd}\n\n已确认事实：\n${JSON.stringify(evidence)}`,
        schemaName: "job_evidence_analysis",
        schema: requirementSchema,
      });
      const validIds = new Set(evidence.map((item) => String(item.id)));
      const requirements = Array.isArray(result.data.requirements) ? result.data.requirements as Array<Record<string, unknown>> : [];
      const cleanRequirements: Array<Record<string, unknown>> = requirements.map((item) => {
        const ids = Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String).filter((id) => validIds.has(id)) : [];
        const coverage = ids.length ? (item.coverage === "strong" ? "strong" : "partial") : "missing";
        return { ...item, evidenceIds: ids, coverage };
      });
      const weights: Record<string, number> = { must: 3, important: 2, bonus: 1 };
      const coverageScore: Record<string, number> = { strong: 1, partial: 0.55, missing: 0 };
      const totalWeight = cleanRequirements.reduce((sum, item) => sum + (weights[String(item.importance)] || 1), 0) || 1;
      const score = Math.round(cleanRequirements.reduce((sum, item) => sum + (weights[String(item.importance)] || 1) * coverageScore[String(item.coverage)], 0) / totalWeight * 100);
      const payload = { action, jd, summary: result.data.summary, requirements: cleanRequirements, suggestions: result.data.suggestions, score, model: "qwen3.8-max", promptVersion: "job-analysis-v1", elapsedMs: Date.now() - startedAt };
      const record = await saveAiRecord(userId, "analyses", String(body.jobTitle || "岗位证据分析"), payload);
      return Response.json({ result: payload, record });
    }

    if (action === "resumeSuggestions") {
      const fileId = String(body.fileId || "");
      const { db, bucket } = getBindings();
      const file = await db.prepare("SELECT object_key, filename FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL")
        .bind(fileId, userId).first<Record<string, unknown>>();
      if (!file) throw new ApiError(404, "未找到简历文件");
      const object = await bucket.get(String(file.object_key));
      if (!object) throw new ApiError(404, "简历文件内容不存在");
      const output = await analyzeResumeFile({ bytes: await object.arrayBuffer(), filename: String(file.filename) }, `目标岗位描述：${String(body.jd || "未提供")}。提取可验证事实，并给出原文位置、问题、建议表达、引用事实与风险提示。禁止改写成文档中不存在的事实。`, resumeSchema);
      return Response.json({ result: { ...output, model: "qwen-doc-turbo", elapsedMs: Date.now() - startedAt } });
    }

    if (action === "companyResearch") {
      const company = String(body.company || "").trim();
      if (!company) throw new ApiError(400, "请输入公司名称");
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["overview", "facts", "risks", "questions", "sources", "confidence"],
        properties: {
          overview: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          questions: { type: "array", items: { type: "string" } },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "publishedAt"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                publishedAt: { type: "string" },
              },
            },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      };
      const result = await structuredChat({ system: "你是谨慎的公司背调研究员。必须区分事实和推断，至少交叉核对两个独立来源；来源不足时置信度必须为 low，不得生成伪精确评分。", prompt: `请调查公司：${company}。关注业务、融资/经营、团队文化、岗位风险和面试需要确认的问题。`, schemaName: "company_research", schema, search: true });
      const sources = (Array.isArray(result.data.sources) ? result.data.sources : []).filter((source: unknown) => {
        if (!source || typeof source !== "object") return false;
        try {
          const url = new URL(String((source as Record<string, unknown>).url || ""));
          return url.protocol === "https:" || url.protocol === "http:";
        } catch { return false; }
      });
      const risks = Array.isArray(result.data.risks) ? [...result.data.risks] : [];
      if (sources.length < 2) risks.unshift("可核验来源少于两个，本报告仅作为线索，不应据此作出关键决策。");
      const payload = { ...result.data, sources, risks, confidence: sources.length < 2 ? "low" : result.data.confidence, company, model: "qwen3.8-max", generatedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt };
      const record = await saveAiRecord(userId, "research", company, payload);
      return Response.json({ result: payload, record });
    }

    if (action === "interviewReview") {
      const transcript = String(body.transcript || "").trim();
      if (transcript.length < 30) throw new ApiError(400, "复盘文本太短，无法形成有效点评");
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["summary", "strengths", "gaps", "star", "quotes", "actions"],
        properties: {
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          star: {
            type: "object",
            additionalProperties: false,
            required: ["situation", "task", "action", "result"],
            properties: {
              situation: { type: "string" },
              task: { type: "string" },
              action: { type: "string" },
              result: { type: "string" },
            },
          },
          quotes: { type: "array", items: { type: "string" } },
          actions: { type: "array", items: { type: "string" } },
        },
      };
      const result = await structuredChat({ system: "你是严格引用原话的面试复盘教练。只能基于提供的转写文本和上下文，不得补写候选人经历。", prompt: `岗位：${String(body.role || "未指定")}\nJD：${String(body.jd || "未提供")}\n转写：${transcript}`, schemaName: "interview_review", schema });
      return Response.json({ result: { ...result.data, model: "qwen3.8-max", elapsedMs: Date.now() - startedAt } });
    }

    if (action === "transcribeAudio") {
      const fileId = String(body.fileId || "");
      const { db, bucket } = getBindings();
      const file = await db.prepare("SELECT object_key, filename, mime_type FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'audio' AND deleted_at IS NULL")
        .bind(fileId, userId).first<Record<string, unknown>>();
      if (!file) throw new ApiError(404, "录音文件不存在");
      const object = await bucket.get(String(file.object_key));
      if (!object) throw new ApiError(404, "录音内容不存在");
      const result = await transcribeAudio({ bytes: await object.arrayBuffer(), filename: String(file.filename), mimeType: String(file.mime_type) });
      return Response.json({ result: { text: result.text, model: "qwen3-asr-flash", elapsedMs: Date.now() - startedAt } });
    }

    throw new ApiError(400, "不支持的 AI 任务");
  } catch (error) {
    return apiError(error);
  }
}
