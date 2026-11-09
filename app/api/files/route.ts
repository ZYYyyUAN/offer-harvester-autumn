import { ApiError, apiError, getBindings, mapFile, requireApiUser } from "@/lib/server-data";
import { sha256Hex } from "@/lib/data-safety";

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
  if (mime === "audio/mpeg") return bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (["audio/webm", "video/webm"].includes(mime)) return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (["audio/mp4", "video/mp4"].includes(mime)) return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (["audio/wav", "audio/x-wav"].includes(mime)) return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  if (mime === "audio/ogg") return String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (mime === "audio/flac") return String.fromCharCode(...bytes.slice(0, 4)) === "fLaC";
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
      sha256: await sha256Hex(body),
      displayName: url.searchParams.get("displayName") || filename,
      target: url.searchParams.get("target") || "",
      note: url.searchParams.get("note") || "",
      tags: (url.searchParams.get("tags") || "").split(/[,，]/).map((value) => value.trim()).filter(Boolean),
      sourceModifiedAt: url.searchParams.get("sourceModifiedAt") || null,
      interviewId: url.searchParams.get("interviewId") || null,
      sequence: Number(url.searchParams.get("sequence") || 0),
      duration: Number(url.searchParams.get("duration") || 0),
      libraryType: url.searchParams.get("libraryType") || (purpose === "resume" ? "completed" : ""),
      applicationId: url.searchParams.get("applicationId") || null,
      applicationCompany: url.searchParams.get("applicationCompany") || "",
      applicationRole: url.searchParams.get("applicationRole") || "",
      sourceResumeId: url.searchParams.get("sourceResumeId") || null,
      parentFileId: url.searchParams.get("parentFileId") || null,
      optimizationRevision: Number(url.searchParams.get("optimizationRevision") || 0),
      optimizationStatus: url.searchParams.get("optimizationStatus") || "",
    };
    const { db, bucket } = getBindings();
    if (purpose === "resume" && metadata.applicationId) {
      const application = await db.prepare("SELECT id FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL").bind(metadata.applicationId, userId).first();
      if (!application) throw new ApiError(404, "关联岗位不存在");
    }
    for (const relatedFileId of [metadata.sourceResumeId, metadata.parentFileId].filter(Boolean)) {
      const related = await db.prepare("SELECT id FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(relatedFileId, userId).first();
      if (!related) throw new ApiError(404, "关联的简历版本不存在");
    }
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
    const current = await db.prepare("SELECT metadata, version, deleted_at FROM stored_files WHERE id = ? AND owner_id = ?").bind(body.id, userId).first<Record<string, unknown>>();
    if (!current) throw new ApiError(404, "文件不存在");
    if (!Number.isInteger(body.version)) throw new ApiError(400, "修改文件必须提供版本号", "VERSION_REQUIRED");
    if (body.version !== Number(current.version)) throw new ApiError(409, "文件信息已被更新", "VERSION_CONFLICT", false, { currentVersion: Number(current.version) });
    if (current.deleted_at && !body.restore) throw new ApiError(409, "文件已在回收站，请先恢复", "FILE_DELETED");
    const metadata = { ...JSON.parse(String(current.metadata)), ...(body.metadata ?? {}) };
    await db.prepare("UPDATE stored_files SET metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, deleted_at = ? WHERE id = ? AND owner_id = ? AND version = ?")
      .bind(JSON.stringify(metadata), body.restore ? null : current.deleted_at, body.id, userId, body.version).run();
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
    const version = Number(url.searchParams.get("version"));
    if (!id) throw new ApiError(400, "缺少文件 ID");
    if (!Number.isInteger(version)) throw new ApiError(400, "删除文件必须提供版本号", "VERSION_REQUIRED");
    const { db, bucket } = getBindings();
    const row = await db.prepare("SELECT object_key, version, deleted_at FROM stored_files WHERE id = ? AND owner_id = ?").bind(id, userId).first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "文件不存在");
    if (Number(row.version) !== version) throw new ApiError(409, "文件信息已被更新", "VERSION_CONFLICT", false, { currentVersion: Number(row.version) });
    if (permanent && !row.deleted_at) throw new ApiError(409, "请先将文件移入回收站", "NOT_IN_TRASH");
    if (permanent) {
      await bucket.delete(String(row.object_key));
      await db.prepare("DELETE FROM stored_files WHERE id = ? AND owner_id = ?").bind(id, userId).run();
    } else {
      await db.prepare("UPDATE stored_files SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ?").bind(id, userId, version).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
