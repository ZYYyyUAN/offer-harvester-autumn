import { consumeOAuthState, exchangeAuthorizationCode, getFeishuUser, saveConnection } from "@/lib/feishu";
import { ApiError, requireApiUser } from "@/lib/server-data";

const home = "https://offer-harvester-autumn.zyyuan0913.chatgpt.site/?view=feishu";

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser(); const url = new URL(request.url); const state = url.searchParams.get("state"); const code = url.searchParams.get("code");
    if (url.searchParams.get("error")) throw new ApiError(400, `飞书未完成授权：${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
    if (!state || !code) throw new ApiError(400, "飞书回调缺少授权参数");
    await consumeOAuthState(state, userId); const tokens = await exchangeAuthorizationCode(code); await saveConnection(userId, tokens); const account = await getFeishuUser(userId); await saveConnection(userId, tokens, account);
    return Response.redirect(`${home}&feishu=connected`, 302);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "飞书连接失败");
    return Response.redirect(`${home}&feishu=error&message=${message}`, 302);
  }
}
