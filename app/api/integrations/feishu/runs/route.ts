import { apiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser(); const url = new URL(request.url); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));
    const result = await getDatabase().prepare("SELECT id, integration_id, run_type, status, preview, decisions, result, error, expires_at, version, created_at, updated_at, finished_at FROM integration_runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?").bind(userId, limit).all<Record<string, unknown>>();
    return Response.json({ runs: result.results.map((row) => ({ id: row.id, integrationId: row.integration_id, runType: row.run_type, status: row.status, preview: safeJson(String(row.preview), {}), decisions: safeJson(String(row.decisions), []), result: safeJson(String(row.result), {}), error: row.error, expiresAt: row.expires_at, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at })) });
  } catch (error) { return apiError(error); }
}
