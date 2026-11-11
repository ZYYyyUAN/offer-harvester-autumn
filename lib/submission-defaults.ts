import { ApiError, getDatabase, safeJson } from "./server-data";
import { resumeIdentity } from "./application-submission";
import type { z } from "zod";
import type { SubmissionResumeIdentitySchema } from "./submission-intake-contracts";

export async function validateDefaultSubmissionResume(ownerId: string, selected: z.infer<typeof SubmissionResumeIdentitySchema> | null) {
  if (!selected) return;
  const actual = await resumeIdentity(ownerId, selected.fileId, { completedOnly: true });
  if (actual.resumeFileVersion !== selected.version || actual.resumeSha256 !== selected.sha256.toLowerCase()) throw new ApiError(409, "简历版本或内容已变化，请刷新后重新设置默认", "RESUME_IDENTITY_CONFLICT");
}
export function submissionProfileVersionGuard(ownerId: string, version: number) {
  const db = getDatabase();
  return version ? db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM profiles WHERE owner_id = ? AND version = ?) THEN 1 ELSE abs(-9223372036854775808) END").bind(ownerId,version) : db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM profiles WHERE owner_id = ?) THEN 1 ELSE abs(-9223372036854775808) END").bind(ownerId);
}
export function clearDefaultSubmissionResumeStatement(ownerId: string, fileId: string) {
  return getDatabase().prepare("UPDATE profiles SET data = json_set(data, '$.defaultSubmissionResume', json('null')), version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND json_extract(data, '$.defaultSubmissionResume.fileId') = ?").bind(ownerId, fileId);
}
export async function readSubmissionDefaults(ownerId: string) {
  const db = getDatabase(), profile = await db.prepare("SELECT data, version FROM profiles WHERE owner_id = ?").bind(ownerId).first<{ data: string; version: number }>();
  const selected = profile ? safeJson<Record<string, any>>(profile.data, {}).defaultSubmissionResume || null : null;
  if (!selected) return { version: profile?.version || 0, defaultSubmissionResume: null, resolvedResume: null, status: "unset" };
  const row = await db.prepare("SELECT id, filename, metadata, version FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(selected.fileId, ownerId).first<{ id: string; filename: string; metadata: string; version: number }>();
  if (!row) return { version: profile!.version, defaultSubmissionResume: selected, resolvedResume: null, status: "unavailable" };
  const metadata = safeJson<Record<string, any>>(row.metadata, {});
  if (metadata.libraryType === "optimization" || metadata.sha256 !== selected.sha256) return { version: profile!.version, defaultSubmissionResume: selected, resolvedResume: null, status: "needs_review" };
  return { version: profile!.version, defaultSubmissionResume: selected, resolvedResume: { fileId: row.id, version: row.version, sha256: selected.sha256, displayName: metadata.displayName || row.filename }, status: "available" };
}
