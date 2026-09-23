import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const { id, stage, version } = (await request.json()) as { id?: string; stage?: string; version?: number };
    const allowed = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"];
    if (!id || !stage || !allowed.includes(stage)) throw new ApiError(400, "无效的投递阶段");
    if (!Number.isInteger(version)) throw new ApiError(400, "阶段变更必须提供版本号", "VERSION_REQUIRED");
    const db = getDatabase();
    const row = await db
      .prepare("SELECT data, title, version FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL")
      .bind(id, userId)
      .first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "投递记录不存在");
    if (Number(row.version) !== version) throw new ApiError(409, "投递记录已在其他设备更新", "VERSION_CONFLICT", false, { currentVersion: Number(row.version) });
    const data = JSON.parse(String(row.data)) as Record<string, unknown>;
    const from = String(data.stage ?? "待投递");
    data.stage = stage;
    const eventId = crypto.randomUUID();
    await db.batch([
      db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?")
        .bind(JSON.stringify(data), id, userId, version),
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'application_events', ?, ?)")
        .bind(eventId, userId, `阶段变更：${from} → ${stage}`, JSON.stringify({ entityType: "applications", entityId: id, applicationId: id, action: "stage_changed", from, to: stage })),
    ]);
    return Response.json({ ok: true, stage });
  } catch (error) {
    return apiError(error);
  }
}
