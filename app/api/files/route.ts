import { ApiError, apiError, getBindings, mapFile, requireApiUser } from "@/lib/server-data";

const limits: Record<string, number> = { resume: 20 * 1024 * 1024, avatar: 5 * 1024 * 1024, audio: 10 * 1024 * 1024, job_screenshot: 10 * 1024 * 1024 };
const allowed: Record<string, string[]> = {
  resume: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"],
  avatar: ["image/jpeg", "image/png", "image/webp"],
  job_screenshot: ["image/jpeg", "image/png", "image/webp"],
  audio: ["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "video/webm", "video/mp4"],
};

function validMagic(bytes: Uint8Array, mime: string) {
  if (mime === "application/pdf") return String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  if (mime.includes("wordprocessingml")) return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (mime === "application/msword") return bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (mime === "image/png") return bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG";
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  return false;
}

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const purpose = new URL(request.url).searchParams.get("purpose") || "resume";
    const result = await getBindings().db
      .prepare("SELECT id, record_id, purpose, filename, mime_type, size, metadata, version, created_at, updated_at, deleted_at FROM stored_files WHERE owner_id = ? AND purpose = ? AND deleted_at IS NULL ORDER BY updated_at DESC")
      .bind(userId, purpose)
      .all<Record<string, unknown>>();
    return Response.json({ files: result.results.map(mapFile) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    const purpose = url.searchParams.get("purpose") || "resume";
    const filename = decodeURIComponent(request.headers.get("x-file-name") || "未命名文件").slice(0, 240);
    const mime = (request.headers.get("content-type") || "application/octet-stream").split(";")[0];
    const size = Number(request.headers.get("content-length") || 0);
    if (!limits[purpose] || !allowed[purpose]?.includes(mime)) throw new ApiError(415, "不支持的文件类型");
    if (!size || size > limits[purpose]) throw new ApiError(413, "文件大小超出限制");
    const body = await request.arrayBuffer();
    const bytes = new Uint8Array(body.slice(0, 12));
    if (!validMagic(bytes, mime)) throw new ApiError(415, "文件内容与类型不匹配");
    const id = crypto.randomUUID();
    const objectKey = `${userId}/${purpose}/${id}`;
    const metadata = {
      displayName: url.searchParams.get("displayName") || filename,
      target: url.searchParams.get("target") || "",
      note: url.searchParams.get("note") || "",
      tags: (url.searchParams.get("tags") || "").split(/[,，]/).map((value) => value.trim()).filter(Boolean),
      sourceModifiedAt: url.searchParams.get("sourceModifiedAt") || null,
      interviewId: url.searchParams.get("interviewId") || null,
      sequence: Number(url.searchParams.get("sequence") || 0),
      duration: Number(url.searchParams.get("duration") || 0),
    };
    const { db, bucket } = getBindings();
    await bucket.put(objectKey, body, { httpMetadata: { contentType: mime } });
    await db.prepare("INSERT INTO stored_files (id, owner_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, userId, purpose, filename, objectKey, mime, body.byteLength, JSON.stringify(metadata)).run();
    const row = await db.prepare("SELECT id, record_id, purpose, filename, mime_type, size, metadata, version, created_at, updated_at, deleted_at FROM stored_files WHERE id = ? AND owner_id = ?")
      .bind(id, userId).first<Record<string, unknown>>();
    return Response.json({ file: mapFile(row!) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const body = (await request.json()) as { id?: string; metadata?: Record<string, unknown>; version?: number; restore?: boolean };
    if (!body.id) throw new ApiError(400, "缺少文件 ID");
    const { db } = getBindings();
    const current = await db.prepare("SELECT metadata, version FROM stored_files WHERE id = ? AND owner_id = ?").bind(body.id, userId).first<Record<string, unknown>>();
    if (!current) throw new ApiError(404, "文件不存在");
    if (body.version && body.version !== Number(current.version)) throw new ApiError(409, "文件信息已被更新");
    const metadata = { ...JSON.parse(String(current.metadata)), ...(body.metadata ?? {}) };
    await db.prepare("UPDATE stored_files SET metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, deleted_at = ? WHERE id = ? AND owner_id = ?")
      .bind(JSON.stringify(metadata), body.restore ? null : null, body.id, userId).run();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const permanent = url.searchParams.get("permanent") === "true";
    if (!id) throw new ApiError(400, "缺少文件 ID");
    const { db, bucket } = getBindings();
    const row = await db.prepare("SELECT object_key FROM stored_files WHERE id = ? AND owner_id = ?").bind(id, userId).first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "文件不存在");
    if (permanent) {
      await bucket.delete(String(row.object_key));
      await db.prepare("DELETE FROM stored_files WHERE id = ? AND owner_id = ?").bind(id, userId).run();
    } else {
      await db.prepare("UPDATE stored_files SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ?").bind(id, userId).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
