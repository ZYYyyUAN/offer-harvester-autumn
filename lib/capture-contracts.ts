import { z } from "zod";
export const captureProfiles = ["capture-max-v1", "capture-flash-v1"] as const;
export const CaptureProfileSchema = z.enum(captureProfiles).default("capture-max-v1");
export const capturePhaseLabels: Record<string, string> = { queued: "已排队", reading_page: "正在读取公开岗位", reading_image: "正在识别截图", extracting: "正在提取岗位字段", validating: "正在校验结果", saving_result: "正在保存结果", completed: "读取完成", failed: "读取失败", cancelled: "已取消（结果不再采用）" };
export function captureIdentity(input: { sourceUrl?: string; screenshotSha256?: string }, profile: string) {
  if (input.screenshotSha256) return JSON.stringify(["image", input.screenshotSha256, profile]);
  const url = new URL(input.sourceUrl!); url.hash = "";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) url.searchParams.delete(key);
  return JSON.stringify(["url", url.href, profile]);
}
export type CaptureTelemetry = { profile: string; route: string; phases: Array<{ phase: string; startedAt: string; finishedAt: string; elapsedMs: number }>; usage: Record<string, unknown> };
export type CaptureTrace = { telemetry: CaptureTelemetry; measure: <T>(phase: string, action: () => Promise<T>) => Promise<T> };
