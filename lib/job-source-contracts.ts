import { z } from "zod";
import { JobCaptureDraftSchema } from "./workflow-contracts.ts";

export function publicAtsSource(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  const greenhouse = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\/jobs\/(\d+)\/?$/);
  if (["job-boards.greenhouse.io", "boards.greenhouse.io"].includes(url.hostname) && greenhouse) return { kind: "greenhouse" as const, detailUrl: `https://boards-api.greenhouse.io/v1/boards/${greenhouse[1]}/jobs/${greenhouse[2]}`, positionId: greenhouse[2], companyUrl: null };
  const position = url.pathname.match(/^\/[a-zA-Z0-9_-]+\/position\/(\d+)\/detail\/?$/);
  if (url.protocol !== "https:" || url.port || url.username || url.password || !/^[a-z0-9-]+\.jobs\.feishu\.cn$/.test(url.hostname) || !position) return null;
  return { kind: "feishu" as const, detailUrl: url.origin + "/api/v1/job/posts/" + position[1], companyUrl: url.origin + "/api/v1/tenant/info", positionId: position[1] };
}

export function greenhouseText(value: string) {
  const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const names: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const code = entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
  return decode(decode(decode(value)).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<\/(?:p|div|li|h[1-6]|ul|ol)>|<br\s*\/?>/gi, "\n").replace(/<\/?(?:p|div|span|h[1-6]|ul|ol|li|strong|em|b|i|u|a|table|thead|tbody|tr|td|th|section|article)\b[^>]*>/gi, "")).replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export const GreenhouseJobSchema = z.object({ id: z.number().int(), company_name: z.string().max(240).optional(), title: z.string().min(1).max(240), location: z.object({ name: z.string().max(240) }).optional(), content: z.string().min(1), application_deadline: z.string().nullable().optional() });

export const PublicAtsDetailSchema = z.object({ code: z.literal(0), data: z.object({ job_post_detail: z.object({
  id: z.string(), title: z.string().min(1).max(240), description: z.string().min(1).max(30000),
  city_list: z.array(z.object({ name: z.string().max(240) })).nullish(),
}) }) });

export function publicAtsDraft(companyData: unknown, detail: z.infer<typeof PublicAtsDetailSchema>, sourceUrl: string) {
  const info = z.object({ code: z.literal(0), data: z.object({ tenant_info: z.object({ tenant_name: z.string().max(240) }) }) }).safeParse(companyData);
  const company = info.success ? info.data.data.tenant_info.tenant_name : "";
  const job = detail.data.job_post_detail;
  const location = [...new Set((job.city_list || []).map((city) => city.name))].join("、");
  return JobCaptureDraftSchema.parse({ company, role: job.title, location, jd: job.description, sourceUrl,
    evidence: [{ field: "role", quote: job.title }, { field: "jd", quote: job.description.slice(0,1200) }, ...(company ? [{ field: "company", quote: company }] : []), ...(location ? [{ field: "location", quote: location }] : [])],
    warnings: ["已读取企业网申网页的公开岗位数据，请核对后保存。薪资及截止日期未在已读取字段中提供，保持为空。"],
  });
}
