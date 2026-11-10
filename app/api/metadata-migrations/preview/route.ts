import { apiError, requireApiUser } from "@/lib/server-data";
import { insertRecord, atomicBatch, listKind } from "@/lib/jd-store";
import { legacyMetadata } from "@/lib/job-metadata";

export async function POST() {
  try {
    const { userId } = await requireApiUser(), now = new Date().toISOString();
    const records = [...await listKind(userId, "applications"), ...await listKind(userId, "saved_jobs")].filter((r) => !r.data.jobMetadata && (r.data.companyType || r.data.channel));
    const entries = records.map((r) => ({ id: r.id, kind: r.kind, title: r.title, version: r.version, ...legacyMetadata(r.data, String(r.data.company || ""), String(r.data.sourceUrl || ""), now), warning: "旧值仅为待核对候选。国企银行、外企、外包均不推定工商性质或岗位用工形式；迁移不会改写历史 JD 或确认实际渠道。" }));
    const id = crypto.randomUUID(); await atomicBatch([insertRecord(userId, "metadata_migrations", "旧公司分类与渠道迁移预览", { entries, status: "preview", expiresAt: new Date(Date.now() + 86400000).toISOString() }, id)]);
    return Response.json({ id, entries }, { status: 201 });
  } catch (error) { return apiError(error); }
}
