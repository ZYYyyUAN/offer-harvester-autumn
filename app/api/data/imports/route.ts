import { ApiError, apiError, getDatabase, mapRecord, requireApiUser } from "@/lib/server-data";

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) { const char = text[index]; if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(cell); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell); if (row.some(Boolean)) rows.push(row); const headers = (rows.shift() || []).map((value) => value.replace(/^\uFEFF/, ""));
  return rows.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] || ""])));
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const body = await request.json() as { filename?: string; format?: string; content?: string }; const content = String(body.content || ""); if (!content || content.length > 8_000_000) throw new ApiError(413, "导入文件为空或超过 8 MB");
    let profile: Record<string, unknown> | null = null; let incoming: Array<Record<string, unknown>> = [];
    if (body.format === "csv" || body.filename?.toLowerCase().endsWith(".csv")) incoming = parseCsv(content).map((row) => ({ id: row.id || crypto.randomUUID(), kind: row.kind, title: row.title, data: JSON.parse(String(row.dataJson || "{}")), version: Number(row.version || 1), createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt || null }));
    else { const parsed = JSON.parse(content) as Record<string, unknown>; if (Number(parsed.schemaVersion || 0) < 1 || !Array.isArray(parsed.records)) throw new ApiError(422, "不是有效的 OFFER 收割机备份"); profile = parsed.profile && typeof parsed.profile === "object" ? ((parsed.profile as Record<string, unknown>).data as Record<string, unknown>) : null; incoming = parsed.records as Array<Record<string, unknown>>; }
    const validKinds = new Set(["applications", "saved_jobs", "evidence", "interviews", "offers", "reminders", "analyses", "research", "tasks", "activity_events", "application_events"]); incoming = incoming.filter((item) => item.id && validKinds.has(String(item.kind)) && item.data && typeof item.data === "object").slice(0, 2000);
    const currentRows = await getDatabase().prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ?").bind(userId).all<Record<string, unknown>>(); const current = new Map(currentRows.results.map(mapRecord).map((item) => [item.id, item]));
    const additions = incoming.filter((item) => !current.has(String(item.id))); const unchanged = incoming.filter((item) => { const found = current.get(String(item.id)); return found && JSON.stringify(found.data) === JSON.stringify(item.data); }); const conflicts = incoming.filter((item) => { const found = current.get(String(item.id)); return found && JSON.stringify(found.data) !== JSON.stringify(item.data); }).map((item) => ({ id: String(item.id), kind: item.kind, title: item.title, currentUpdatedAt: current.get(String(item.id))?.updatedAt, backupUpdatedAt: item.updatedAt }));
    const id = crypto.randomUUID(); const preview = { filename: String(body.filename || "备份文件"), profile, incoming, summary: { additions: additions.length, unchanged: unchanged.length, conflicts: conflicts.length }, conflicts, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    await getDatabase().prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'data_imports', ?, ?)").bind(id, userId, String(body.filename || "数据导入预览"), JSON.stringify(preview)).run();
    return Response.json({ importId: id, preview: { summary: preview.summary, conflicts, profileIncluded: Boolean(profile), expiresAt: preview.expiresAt } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
