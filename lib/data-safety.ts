export function safeArchiveName(row: Record<string, unknown>) {
  const original = String(row.filename || "file");
  const match = original.match(/(\.[a-z0-9]{1,10})$/i);
  const purpose = String(row.purpose || "files").replace(/[^a-z0-9_-]/gi, "_");
  return `${purpose}/${String(row.id).replace(/[^a-z0-9_-]/gi, "_")}${match?.[1]?.toLowerCase() || ""}`;
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function trashRetention(deletedAt: string | null, now = new Date()) {
  const deleted = deletedAt ? new Date(deletedAt) : null;
  const expiresAt = deleted && !Number.isNaN(deleted.getTime()) ? new Date(deleted.getTime() + 30 * 86400000) : null;
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)) : 0;
  return { expiresAt: expiresAt?.toISOString() || null, daysRemaining };
}
