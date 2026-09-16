import { ApiError, apiError, getDatabase, safeJson, requireApiUser } from "@/lib/server-data";

export async function GET() {
  try {
    const user = await requireApiUser();
    const row = await getDatabase()
      .prepare("SELECT data, version, created_at, updated_at FROM profiles WHERE owner_id = ?")
      .bind(user.userId)
      .first<Record<string, unknown>>();
    return Response.json({
      profile: row
        ? { ...safeJson(String(row.data), {}), version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at }
        : { name: "", email: user.email, version: 0 },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown> & { version?: number };
    const current = await getDatabase()
      .prepare("SELECT data, version FROM profiles WHERE owner_id = ?")
      .bind(user.userId)
      .first<Record<string, unknown>>();
    if (current && body.version && Number(current.version) !== body.version) {
      throw new ApiError(409, "个人资料已在其他设备更新，请刷新后重试");
    }
    const existing = current ? safeJson<Record<string, unknown>>(String(current.data), {}) : {};
    const { version: _version, ...updates } = body;
    const data = { ...existing, ...updates, email: String(updates.email || existing.email || user.email) };
    if (current) {
      await getDatabase()
        .prepare("UPDATE profiles SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?")
        .bind(JSON.stringify(data), user.userId)
        .run();
    } else {
      await getDatabase()
        .prepare("INSERT INTO profiles (owner_id, data, version) VALUES (?, ?, 1)")
        .bind(user.userId, JSON.stringify(data))
        .run();
    }
    const saved = await getDatabase()
      .prepare("SELECT data, version, created_at, updated_at FROM profiles WHERE owner_id = ?")
      .bind(user.userId)
      .first<Record<string, unknown>>();
    return Response.json({ profile: { ...safeJson(String(saved!.data), {}), version: Number(saved!.version), createdAt: saved!.created_at, updatedAt: saved!.updated_at } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    if (url.searchParams.get("confirm") !== "DELETE") throw new ApiError(400, "需要明确确认永久删除");
    const db = getDatabase();
    const files = await db.prepare("SELECT object_key FROM stored_files WHERE owner_id = ?").bind(userId).all<Record<string, unknown>>();
    const { bucket } = (await import("@/lib/server-data")).getBindings();
    for (const file of files.results) await bucket.delete(String(file.object_key));
    await db.batch([
      db.prepare("DELETE FROM stored_files WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM records WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM profiles WHERE owner_id = ?").bind(userId),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
