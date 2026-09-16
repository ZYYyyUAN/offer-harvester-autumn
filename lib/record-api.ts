import {
  ApiError,
  apiError,
  getDatabase,
  mapRecord,
  normalizeKind,
  recordTitle,
  requireApiUser,
} from "@/lib/server-data";

export async function listRecords(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    const kind = normalizeKind(url.searchParams.get("kind"));
    const deleted = url.searchParams.get("deleted") === "true";
    const result = await getDatabase()
      .prepare(
        `SELECT id, kind, title, data, version, created_at, updated_at, deleted_at
         FROM records WHERE owner_id = ? AND kind = ? AND ${deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"}
         ORDER BY updated_at DESC LIMIT 500`,
      )
      .bind(userId, kind)
      .all();
    return Response.json({ records: result.results.map((row) => mapRecord(row)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function createRecord(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const body = (await request.json()) as {
      kind?: string;
      title?: string;
      data?: Record<string, unknown>;
    };
    const kind = normalizeKind(body.kind ?? null);
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const id = crypto.randomUUID();
    const title = (body.title?.trim() || recordTitle(kind, data)).slice(0, 180);
    await getDatabase()
      .prepare(
        `INSERT INTO records (id, owner_id, kind, title, data, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(id, userId, kind, title, JSON.stringify(data))
      .run();
    const row = await getDatabase()
      .prepare(
        `SELECT id, kind, title, data, version, created_at, updated_at, deleted_at
         FROM records WHERE id = ? AND owner_id = ?`,
      )
      .bind(id, userId)
      .first();
    return Response.json({ record: mapRecord(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function updateRecord(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const body = (await request.json()) as {
      id?: string;
      kind?: string;
      version?: number;
      title?: string;
      data?: Record<string, unknown>;
      restore?: boolean;
    };
    if (!body.id) throw new ApiError(400, "缺少记录 ID");
    const existing = await getDatabase()
      .prepare("SELECT * FROM records WHERE id = ? AND owner_id = ?")
      .bind(body.id, userId)
      .first<Record<string, unknown>>();
    if (!existing) throw new ApiError(404, "记录不存在");
    if (body.version && Number(existing.version) !== body.version) {
      throw new ApiError(409, "记录已在其他设备更新，请刷新后重试");
    }
    const kind = normalizeKind(String(existing.kind));
    const current = JSON.parse(String(existing.data ?? "{}")) as Record<string, unknown>;
    const data = { ...current, ...(body.data ?? {}) };
    const title = (body.title?.trim() || recordTitle(kind, data)).slice(0, 180);
    await getDatabase()
      .prepare(
        `UPDATE records SET title = ?, data = ?, version = version + 1,
         updated_at = CURRENT_TIMESTAMP, deleted_at = ? WHERE id = ? AND owner_id = ?`,
      )
      .bind(title, JSON.stringify(data), body.restore ? null : existing.deleted_at, body.id, userId)
      .run();
    const row = await getDatabase()
      .prepare(
        `SELECT id, kind, title, data, version, created_at, updated_at, deleted_at
         FROM records WHERE id = ? AND owner_id = ?`,
      )
      .bind(body.id, userId)
      .first<Record<string, unknown>>();
    return Response.json({ record: mapRecord(row!) });
  } catch (error) {
    return apiError(error);
  }
}

export async function deleteRecord(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const permanent = url.searchParams.get("permanent") === "true";
    if (!id) throw new ApiError(400, "缺少记录 ID");
    if (permanent) {
      await getDatabase().prepare("DELETE FROM records WHERE id = ? AND owner_id = ?").bind(id, userId).run();
    } else {
      await getDatabase()
        .prepare("UPDATE records SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ?")
        .bind(id, userId)
        .run();
    }
    return Response.json({ ok: true, permanent });
  } catch (error) {
    return apiError(error);
  }
}
