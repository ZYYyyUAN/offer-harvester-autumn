import { ApiError, apiError, getBindings, requireApiUser } from "@/lib/server-data";

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const download = url.searchParams.get("download") === "true";
    if (!id) throw new ApiError(400, "缺少文件 ID");
    const { db, bucket } = getBindings();
    const row = await db.prepare("SELECT object_key, filename, mime_type FROM stored_files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
      .bind(id, userId).first<Record<string, unknown>>();
    if (!row) throw new ApiError(404, "文件不存在");
    const object = await bucket.get(String(row.object_key));
    if (!object) throw new ApiError(404, "文件内容不存在");
    const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(String(row.filename))}`;
    return new Response(object.body, { headers: { "content-type": String(row.mime_type), "content-length": String(object.size), "content-disposition": disposition, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    return apiError(error);
  }
}
