import { atomicBatch, versionGuard } from "@/lib/jd-store";
import { validateDefaultSubmissionResume, submissionProfileVersionGuard } from "@/lib/submission-defaults";
import { ApiError, apiError, getDatabase, safeJson, requireApiUser } from "@/lib/server-data";
import { ProfileDataSchema } from "@/lib/data-contracts";

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
    if (current && !Number.isInteger(body.version)) throw new ApiError(400, "修改个人资料必须提供版本号", "VERSION_REQUIRED");
    if (current && Number(current.version) !== body.version) {
      throw new ApiError(409, "个人资料已在其他设备更新，请刷新后重试", "VERSION_CONFLICT", false, { currentVersion: Number(current.version) });
    }
    const existing = current ? safeJson<Record<string, unknown>>(String(current.data), {}) : {};
    const { version: _version, ...updates } = body;
    const data = ProfileDataSchema.parse({ ...existing, ...updates, email: String(updates.email || existing.email || user.email) });
    const defaultChanged = "defaultSubmissionResume" in updates && JSON.stringify(data.defaultSubmissionResume) !== JSON.stringify(existing.defaultSubmissionResume);
    if (defaultChanged) await validateDefaultSubmissionResume(user.userId,data.defaultSubmissionResume || null);
    const selected=defaultChanged?data.defaultSubmissionResume:null;
    await atomicBatch([submissionProfileVersionGuard(user.userId,current?Number(current.version):0),...(selected?[versionGuard(user.userId,selected.fileId,selected.version,"stored_files")]:[]),current?getDatabase().prepare("UPDATE profiles SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND version = ?").bind(JSON.stringify(data),user.userId,body.version):getDatabase().prepare("INSERT INTO profiles(owner_id,data,version) VALUES(?,?,1)").bind(user.userId,JSON.stringify(data))]);
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
      db.prepare("DELETE FROM ai_job_attempts WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM ai_jobs WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM stored_files WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM records WHERE owner_id = ?").bind(userId),
      db.prepare("DELETE FROM profiles WHERE owner_id = ?").bind(userId),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
