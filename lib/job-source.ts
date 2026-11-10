import { ApiError } from "./server-data";
import { publicAtsDraft, PublicAtsDetailSchema, GreenhouseJobSchema, greenhouseText, type publicAtsSource } from "./job-source-contracts";

export async function readPublicAtsJob(source: NonNullable<ReturnType<typeof publicAtsSource>>, originalUrl: string) {
  async function read(url: string) {
    let response: Response;
    try { response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000) }); }
    catch { throw new ApiError(502, "网申页面暂时无法连接，请稍后重试或使用截图。", "NETWORK_ERROR", true); }
    if (response.status === 429 || response.status >= 500) throw new ApiError(502, "网申网站暂时繁忙，请稍后重试。", "JOB_SOURCE_" + response.status, true);
    if (!response.ok) throw new ApiError(422, "网申网站未返回公开岗位正文（HTTP " + response.status + "），可能已下线或限制访问。请上传截图或粘贴 JD。", "PAGE_CONTENT_UNAVAILABLE");
    return response;
  }
  // These requests have independent contents; company metadata must not serialize the JD fetch.
  const reads = await Promise.allSettled([read(source.detailUrl), source.kind === "feishu" ? read(source.companyUrl).then((r) => r.json()) : Promise.resolve(null)]);
  if (reads[0].status === "rejected") throw reads[0].reason;
  const response = reads[0].value as Response;
  const companyData = reads[1].status === "fulfilled" ? reads[1].value : null;
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError(422, "网申接口没有返回岗位数据，请使用截图或粘贴 JD。", "PAGE_CONTENT_UNAVAILABLE");
  const raw = await response.json();
  if (source.kind === "greenhouse") {
    const parsed = GreenhouseJobSchema.safeParse(raw);
    if (!parsed.success || String(parsed.data.id) !== source.positionId) throw new ApiError(422, "公开岗位未返回有效正文，请粘贴 JD 或上传截图", "PAGE_CONTENT_UNAVAILABLE");
    const job = parsed.data, jd = greenhouseText(job.content);
    if (!jd || jd.length > 30000) throw new ApiError(422, "岗位正文为空或超过 30000 字符，请手动选择需要的内容", "PAGE_CONTENT_UNAVAILABLE");
    return { company: job.company_name || "", role: job.title, location: job.location?.name || "", salary: "", deadline: job.application_deadline?.slice(0, 10) || "", jd, sourceUrl: originalUrl, evidence: [{ field: "jd", quote: jd.slice(0, 1200) }, { field: "role", quote: job.title }], warnings: ["直接读取 Greenhouse 公开岗位数据；未提供的字段保持未知，请核对后保存。"], classificationClues: [], captureMethod: "public_ats_api", retrievedAt: new Date().toISOString(), sources: [{ title: "Greenhouse 官方公开职位接口", url: source.detailUrl, crawledAt: new Date().toISOString(), publishedAt: null }] };
  }
  const parsed = PublicAtsDetailSchema.safeParse(raw);
  if (!parsed.success || parsed.data.data.job_post_detail.id !== source.positionId) throw new ApiError(422, "该岗位未返回有效公开数据，可能已下线；未改用其他职位。", "PAGE_CONTENT_UNAVAILABLE");
  return { ...publicAtsDraft(companyData, parsed.data, originalUrl), captureMethod: "public_ats_api", retrievedAt: new Date().toISOString(),
    sources: [{ title: "企业网申岗位公开数据", url: source.detailUrl, publishedAt: null, crawledAt: new Date().toISOString() }, ...(companyData ? [{ title: "网申网站公司主体", url: source.companyUrl, publishedAt: null, crawledAt: new Date().toISOString() }] : [])] };
}
