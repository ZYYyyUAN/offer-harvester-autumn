import { z } from "zod";
import { applicationSaveStatements } from "@/lib/application-submission";
import { atomicBatch, insertRecord, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";
import { ActionTaskSchema } from "@/lib/workflow-contracts";
import { ApiError, apiError, getDatabase, mapRecord, requireApiUser } from "@/lib/server-data";

export async function GET(request: Request) {
  try { const { userId } = await requireApiUser(); const status = new URL(request.url).searchParams.get("status"); const rows = await getDatabase().prepare(`SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ? AND kind = 'tasks' AND deleted_at IS NULL ORDER BY json_extract(data, '$.dueAt') = '', json_extract(data, '$.dueAt'), updated_at DESC`).bind(userId).all<Record<string, unknown>>(); const tasks = rows.results.map(mapRecord).filter((item) => !status || item.data.status === status); return Response.json({ tasks }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { const { userId } = await requireApiUser(); const data = ActionTaskSchema.parse(await request.json()); if (data.createdBy === "ai" && (!data.aiJobId || !data.sourceRefs.length)) throw new ApiError(400, "AI 行动项必须包含任务和来源引用"); const id = crypto.randomUUID(); await getDatabase().prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'tasks', ?, ?)").bind(id, userId, data.title, JSON.stringify(data)).run(); const row = await getDatabase().prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE id = ? AND owner_id = ?").bind(id, userId).first<Record<string, unknown>>(); return Response.json({ task: mapRecord(row!) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const input = z.object({ id: z.string().min(1), version: z.number().int().positive(), data: z.record(z.unknown()) }).strict().parse(await request.json());
    const task = await ownedRecord(userId, input.id, "tasks");
    if (task.version !== input.version) throw new ApiError(409, "任务已更新", "VERSION_CONFLICT", false, { currentVersion: task.version });
    const edits = { ...input.data };
    if (task.data.sourceSuggestionId) {
      for (const key of Object.keys(edits)) if (!["title", "status", "priority", "dueAt", "notes"].includes(key)) throw new ApiError(400, "来源关联不能通过任务编辑覆盖");
    }
    const data = ActionTaskSchema.parse({ ...task.data, ...edits });
    const statements = [versionGuard(userId, task.id, input.version), updateRecordStatement(userId, task, data),
      insertRecord(userId, "activity_events", "任务状态更新", { entityType: "tasks", entityId: task.id, applicationId: data.applicationId, action: "task_updated", status: data.status })];
    if (data.status === "done" && data.applicationId && data.checklistKey) {
      const app = await ownedRecord(userId, data.applicationId, "applications");
      const appData: Record<string, any> = { ...app.data, checklist: { ...app.data.checklist, [data.checklistKey]: { done: true, at: new Date().toISOString() } } };
      if (data.checklistKey === "submitted" && appData.stage === "待投递") appData.stage = "已投递";
      statements.push(...await applicationSaveStatements(userId, app.id, appData, app));
    }
    await atomicBatch(statements);
    return Response.json({ task: await ownedRecord(userId, task.id) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { const { userId } = await requireApiUser(); const url = new URL(request.url); const id = url.searchParams.get("id"); const version = Number(url.searchParams.get("version")); if (!id) throw new ApiError(400, "缺少任务 ID"); if (!Number.isInteger(version)) throw new ApiError(400, "删除任务必须提供版本号", "VERSION_REQUIRED"); const row = await getDatabase().prepare("SELECT version FROM records WHERE id = ? AND owner_id = ? AND kind = 'tasks' AND deleted_at IS NULL").bind(id, userId).first<Record<string, unknown>>(); if (!row) throw new ApiError(404, "任务不存在"); if (Number(row.version) !== version) throw new ApiError(409, "任务已在其他设备更新", "VERSION_CONFLICT", false, { currentVersion: Number(row.version) }); await getDatabase().prepare("UPDATE records SET deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND kind = 'tasks' AND version = ?").bind(id, userId, version).run(); return Response.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
