import { apiError, getBindings, requireApiUser } from "@/lib/server-data";

function writeText(target: Uint8Array, offset: number, length: number, value: string) {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  writeText(target, offset, length, Math.max(0, value).toString(8).padStart(length - 1, "0") + "\0");
}

function tarHeader(name: string, size: number, modifiedAt: string) {
  const header = new Uint8Array(512);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(new Date(modifiedAt).getTime() / 1000));
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeText(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");
  return header;
}

function archiveName(row: Record<string, unknown>) {
  const original = String(row.filename || "file");
  const match = original.match(/(\.[a-z0-9]{1,10})$/i);
  const purpose = String(row.purpose || "files").replace(/[^a-z0-9_-]/gi, "_");
  return `${purpose}/${String(row.id).replace(/[^a-z0-9_-]/gi, "_")}${match?.[1]?.toLowerCase() || ""}`;
}

export async function GET() {
  try {
    const { userId } = await requireApiUser();
    const { db, bucket } = getBindings();
    const rows = await db.prepare("SELECT id, purpose, filename, object_key, size, updated_at FROM stored_files WHERE owner_id = ? AND deleted_at IS NULL ORDER BY purpose, created_at")
      .bind(userId).all<Record<string, unknown>>();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const row of rows.results) {
            const object = await bucket.get(String(row.object_key));
            if (!object) continue;
            controller.enqueue(tarHeader(archiveName(row), object.size, String(row.updated_at)));
            const reader = object.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            const padding = (512 - (object.size % 512)) % 512;
            if (padding) controller.enqueue(new Uint8Array(padding));
          }
          controller.enqueue(new Uint8Array(1024));
          controller.close();
        } catch (error) { controller.error(error); }
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(stream, { headers: { "content-type": "application/x-tar", "content-disposition": `attachment; filename="offer-harvester-files-${day}.tar"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
