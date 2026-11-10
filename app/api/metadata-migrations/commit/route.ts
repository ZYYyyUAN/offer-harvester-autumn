import { z } from "zod";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { atomicBatch, insertRecord, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";
import { applyMetadataSuggestions } from "@/lib/job-metadata";
import { applicationSaveStatements } from "@/lib/application-submission";

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(), input = z.object({ id: z.string().uuid(), selectedIds: z.array(z.string().uuid()).max(2000) }).strict().parse(await request.json());
    const preview = await ownedRecord(userId, input.id, "metadata_migrations");
    if (preview.data.status === "committed") return Response.json({ reused: true, migrated: preview.data.migrated });
    if (Date.parse(preview.data.expiresAt) < Date.now()) throw new ApiError(410, "迁移预览已过期，请重新生成");
    const statements = [versionGuard(userId, preview.id, preview.version)];
    for (const id of new Set(input.selectedIds)) {
      const entry = preview.data.entries.find((e: { id: string }) => e.id === id);
      if (!entry) throw new ApiError(422, "所选记录不在迁移预览中");
      const current = await ownedRecord(userId, id, entry.kind);
      if (current.version !== entry.version || current.data.jobMetadata) throw new ApiError(409, "预览后记录已变化，请重新生成");
      const metadata = applyMetadataSuggestions(entry.metadata, entry.suggestions, JSON.stringify([String(current.data.company || "").trim(), String(current.data.sourceUrl || "").trim()]));
      metadata.legacy.migratedAt = new Date().toISOString();
      const data = { ...current.data, jobMetadata: metadata };
      if (current.kind === "applications") statements.push(...await applicationSaveStatements(userId, id, data, current));
      else statements.push(versionGuard(userId, id, current.version), updateRecordStatement(userId, current, data));
      statements.push(insertRecord(userId, "activity_events", "迁移旧分类与渠道候选", { entityType: current.kind, entityId: id, action: "legacy_metadata_migrated", migrationId: preview.id }));
    }
    statements.push(updateRecordStatement(userId, preview, { ...preview.data, status: "committed", migrated: new Set(input.selectedIds).size }));
    await atomicBatch(statements);
    return Response.json({ migrated: new Set(input.selectedIds).size });
  } catch (error) { return apiError(error); }
}
