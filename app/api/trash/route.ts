import { z } from "zod";
import { apiError, getBindings, mapFile, mapRecord, requireApiUser } from "@/lib/server-data";
import { permanentlyDeleteTrash, restoreTrash, trashRetention } from "@/lib/trash";

const TargetSchema = z.object({ type: z.enum(["record", "file"]), id: z.string().min(1).max(160), version: z.number().int().min(1) }).strict();
const BodySchema = z.object({ items: z.array(TargetSchema).min(1).max(500) }).strict();

export async function GET() {
  try {
    const { userId } = await requireApiUser(); const { db } = getBindings();
    const [records, files] = await Promise.all([
      db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500").bind(userId).all<Record<string, unknown>>(),
      db.prepare("SELECT id, record_id, purpose, filename, mime_type, size, metadata, version, created_at, updated_at, deleted_at FROM stored_files WHERE owner_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500").bind(userId).all<Record<string, unknown>>(),
    ]);
    return Response.json({
      items: [
        ...records.results.map((row) => { const item = mapRecord(row); return { type: "record", ...item, ...trashRetention(item.deletedAt) }; }),
        ...files.results.map((row) => { const item = mapFile(row); return { type: "file", title: item.filename, ...item, ...trashRetention(item.deletedAt) }; }),
      ],
      retentionDays: 30,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { const { userId } = await requireApiUser(); const body = BodySchema.parse(await request.json()); return Response.json({ ok: true, ...(await restoreTrash(userId, body.items)) }); }
  catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { const { userId } = await requireApiUser(); const body = BodySchema.parse(await request.json()); const result = await permanentlyDeleteTrash(userId, body.items); return Response.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 207 : 200 }); }
  catch (error) { return apiError(error); }
}
