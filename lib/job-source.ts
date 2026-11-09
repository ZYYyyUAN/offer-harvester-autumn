import { ApiError } from "./server-data";
import { publicAtsDraft, PublicAtsDetailSchema } from "./job-source-contracts";

export async function readPublicAtsJob(source: { detailUrl: string; companyUrl: string; positionId: string }, originalUrl: string) {
  async function read(url: string) {
    let response: Response;
    try { response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000) }); }
    catch { throw new ApiError(502, "网申页面暂时无法连接，请稍后重试或使用截图。", "NETWORK_ERROR", true); }
    if (response.status === 429 || response.status >= 500) throw new ApiError(502, "网申网站暂时繁忙，请稍后重试。", "JOB_SOURCE_" + response.status, true);
    if (!response.ok) throw new ApiError(422, "网申网站未返回公开岗位正文（HTTP " + response.status + "），可能已下线或限制访问。请上传截图或粘贴 JD。", "PAGE_CONTENT_UNAVAILABLE");
    return response;
  }
  const response = await read(source.detailUrl);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError(422, "网申接口没有返回岗位数据，请使用截图或粘贴 JD。", "PAGE_CONTENT_UNAVAILABLE");
  const parsed = PublicAtsDetailSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.data.job_post_detail.id !== source.positionId) throw new ApiError(422, "该岗位未返回有效公开数据，可能已下线；未改用其他职位。", "PAGE_CONTENT_UNAVAILABLE");
  const companyData = await (await read(source.companyUrl)).json();
  return { ...publicAtsDraft(companyData, parsed.data, originalUrl), captureMethod: "public_ats_api", retrievedAt: new Date().toISOString(),
    sources: [{ title: "企业网申岗位公开数据", url: source.detailUrl, publishedAt: null, crawledAt: new Date().toISOString() }, { title: "网申网站公司主体", url: source.companyUrl, publishedAt: null, crawledAt: new Date().toISOString() }] };
}
