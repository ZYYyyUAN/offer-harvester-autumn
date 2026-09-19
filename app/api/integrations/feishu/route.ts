import { feishuConfigured, feishuMissingConfiguration, getFeishuConnection, publicConnection } from "@/lib/feishu";
import { apiError, getDatabase, requireApiUser } from "@/lib/server-data";

export async function GET() {
  try {
    const { userId } = await requireApiUser();
    const connection = await getFeishuConnection(userId);
    const counts = connection ? await getDatabase().prepare("SELECT COUNT(*) AS count FROM integration_runs WHERE owner_id = ? AND integration_id = ?").bind(userId, connection.id).first<Record<string, unknown>>() : null;
    return Response.json({
      configured: feishuConfigured(), missing: feishuMissingConfiguration(), connection: publicConnection(connection), runCount: Number(counts?.count ?? 0),
      callbackUrl: "https://offer-harvester-autumn.zyyuan0913.chatgpt.site/api/integrations/feishu/callback",
      requiredCapabilities: ["用户身份", "云空间文件", "云文档及文档块", "多维表格", "妙记读取（可选）"],
    });
  } catch (error) { return apiError(error); }
}
