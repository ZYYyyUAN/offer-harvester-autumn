import { ApiError, apiError, getBindings, requireApiUser } from "@/lib/server-data";
import { metadataRuleVersion } from "@/lib/job-metadata";
export async function GET() {
  try {
    await requireApiUser(); const { db, bucket } = getBindings();
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('uq_metadata_conversion','uq_metadata_revision','uq_company_registry','uq_ai_capture_active')").all<{ name: string }>();
    if (indexes.results.length !== 4) throw new ApiError(503, "分类、渠道或提取任务数据库迁移尚未完成", "METADATA_MIGRATION_REQUIRED");
    await db.prepare("SELECT telemetry FROM ai_job_attempts LIMIT 0").all();
    await bucket.head("health-check/metadata-" + crypto.randomUUID());
    return Response.json({ authenticated: true, database: "ready", privateFiles: "ready", ruleVersion: metadataRuleVersion, captureTaskVersion: 1, closureVersion: 1, backupWriterVersion: 6, backupReaderVersions: [3, 4, 5, 6], serverNow: new Date().toISOString() });
  } catch (error) { return apiError(error); }
}
