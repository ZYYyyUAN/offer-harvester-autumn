import { requireChatGPTUser } from "./chatgpt-auth";
import { OfferWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <OfferWorkspace user={{ email: user.email, displayName: user.displayName }} />;
}
