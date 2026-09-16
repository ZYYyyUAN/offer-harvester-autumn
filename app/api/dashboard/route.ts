import { apiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";

export async function GET() {
  try {
    const { userId } = await requireApiUser();
    const result = await getDatabase()
      .prepare("SELECT kind, data, created_at, updated_at FROM records WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC")
      .bind(userId)
      .all<Record<string, unknown>>();
    const records = result.results.map((row) => ({ kind: String(row.kind), data: safeJson<Record<string, unknown>>(String(row.data), {}), createdAt: row.created_at, updatedAt: row.updated_at }));
    const applications = records.filter((item) => item.kind === "applications");
    const reminders = records.filter((item) => item.kind === "reminders");
    const stageCounts = Object.fromEntries(["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"].map((stage) => [stage, applications.filter((item) => item.data.stage === stage).length]));
    const interviewCount = applications.filter((item) => item.data.stage === "面试中" || item.data.stage === "OFFER").length;
    const offerCount = applications.filter((item) => item.data.stage === "OFFER").length;
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 86400000);
    const upcoming = reminders.filter((item) => {
      const due = new Date(String(item.data.dueAt || item.data.date || ""));
      return Number.isFinite(due.getTime()) && due >= now && due <= inSevenDays;
    }).slice(0, 8);
    return Response.json({
      dashboard: {
        totalApplications: applications.length,
        interviewCount,
        offerCount,
        invitationRate: applications.length ? Math.round((interviewCount / applications.length) * 100) : 0,
        stageCounts,
        upcoming,
        recentApplications: applications.slice(0, 6),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
