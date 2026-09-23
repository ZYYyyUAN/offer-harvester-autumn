import { env } from "cloudflare:workers";
import { ApiError, getDatabase, safeJson } from "@/lib/server-data";
import { FEISHU_API_ORIGIN, FEISHU_CALLBACK_URL, FEISHU_PROVIDER, feishuOAuthScopeValue, type FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

type ConnectionRow = Record<string, unknown>;
type TokenPayload = { accessToken: string; refreshToken: string; expiresAt: string; scope: string[]; userId?: string; name?: string };

function envValues() {
  return env as unknown as Record<string, string | undefined>;
}

export function feishuConfigured() {
  const values = envValues();
  return Boolean(values.FEISHU_APP_ID && values.FEISHU_APP_SECRET && values.FEISHU_TOKEN_ENCRYPTION_KEY);
}

export function feishuMissingConfiguration() {
  const values = envValues();
  return ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_TOKEN_ENCRYPTION_KEY"].filter((key) => !values[key]);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = envValues().FEISHU_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new ApiError(503, "飞书令牌加密密钥尚未配置", "FEISHU_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string) {
  const [version, ivValue, cipherValue] = value.split(".");
  if (version !== "v1" || !ivValue || !cipherValue) throw new ApiError(500, "飞书令牌格式无效", "TOKEN_DECRYPT_FAILED");
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivValue) }, await encryptionKey(), base64ToBytes(cipherValue));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new ApiError(500, "飞书令牌无法解密，请重新连接", "TOKEN_DECRYPT_FAILED");
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableHash(value: unknown) {
  function sort(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
    return input;
  }
  return sha256(JSON.stringify(sort(value)));
}

export async function getFeishuConnection(ownerId: string) {
  return getDatabase().prepare("SELECT * FROM integrations WHERE owner_id = ? AND provider = ? ORDER BY created_at DESC LIMIT 1").bind(ownerId, FEISHU_PROVIDER).first<ConnectionRow>();
}

export function publicConnection(row: ConnectionRow | null | undefined) {
  if (!row) return null;
  const config = safeJson<FeishuWorkspaceConfig>(String(row.config ?? "{}"), {});
  return {
    id: String(row.id), status: String(row.status), externalUserId: row.external_user_id ? String(row.external_user_id) : null,
    externalUserName: row.external_user_name ? String(row.external_user_name) : null,
    tenantFingerprint: row.external_tenant_key ? String(row.external_tenant_key).slice(0, 4) + "••••" + String(row.external_tenant_key).slice(-4) : null,
    scopes: safeJson<string[]>(String(row.scopes ?? "[]"), []), config, lastError: row.last_error ? String(row.last_error) : null,
    version: Number(row.version ?? 1), updatedAt: String(row.updated_at), disconnectedAt: row.disconnected_at ? String(row.disconnected_at) : null,
  };
}

export async function createOAuthState(ownerId: string) {
  if (!feishuConfigured()) throw new ApiError(503, "请先配置飞书应用凭据", "FEISHU_NOT_CONFIGURED");
  const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const hash = await sha256(state);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await getDatabase().prepare("INSERT INTO integration_oauth_states (state_hash, owner_id, provider, return_path, expires_at) VALUES (?, ?, ?, '/', ?)").bind(hash, ownerId, FEISHU_PROVIDER, expiresAt).run();
  return state;
}

export async function consumeOAuthState(state: string, ownerId: string) {
  const hash = await sha256(state);
  const db = getDatabase();
  const row = await db.prepare("SELECT state_hash, owner_id, expires_at, used_at FROM integration_oauth_states WHERE state_hash = ? AND provider = ?").bind(hash, FEISHU_PROVIDER).first<ConnectionRow>();
  if (!row || String(row.owner_id) !== ownerId || row.used_at || Date.parse(String(row.expires_at)) <= Date.now()) throw new ApiError(400, "飞书授权请求已失效，请重新连接", "OAUTH_STATE_INVALID");
  const updated = await db.prepare("UPDATE integration_oauth_states SET used_at = CURRENT_TIMESTAMP WHERE state_hash = ? AND used_at IS NULL").bind(hash).run();
  if (!updated.meta.changes) throw new ApiError(400, "飞书授权请求已被使用", "OAUTH_STATE_USED");
}

export function authorizationUrl(state: string) {
  const appId = envValues().FEISHU_APP_ID;
  if (!appId) throw new ApiError(503, "飞书 App ID 尚未配置", "FEISHU_NOT_CONFIGURED");
  // The v2 token endpoint only returns a refresh token when offline access is
  // requested during authorization. The integration stores refresh tokens so
  // that an expired user token can be renewed without losing sync state.
  const query = new URLSearchParams({ app_id: appId, redirect_uri: FEISHU_CALLBACK_URL, state, scope: feishuOAuthScopeValue() });
  return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${query.toString()}`;
}

function oauthData(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : payload;
  if (Number(payload.code ?? 0) !== 0 || payload.error) throw new ApiError(502, String(payload.error_description ?? payload.msg ?? payload.error ?? "飞书授权失败"), "FEISHU_OAUTH_FAILED");
  return data;
}

async function exchange(body: Record<string, unknown>) {
  const values = envValues();
  if (!values.FEISHU_APP_ID || !values.FEISHU_APP_SECRET) throw new ApiError(503, "飞书应用凭据尚未配置", "FEISHU_NOT_CONFIGURED");
  const response = await fetch(`${FEISHU_API_ORIGIN}/authen/v2/oauth/token`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ client_id: values.FEISHU_APP_ID, client_secret: values.FEISHU_APP_SECRET, ...body }) });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, String(payload.error_description ?? payload.msg ?? "飞书授权服务暂不可用"), "FEISHU_OAUTH_FAILED", response.status === 429 || response.status >= 500);
  return oauthData(payload);
}

function parseToken(data: Record<string, unknown>): TokenPayload {
  const accessToken = String(data.access_token ?? data.user_access_token ?? "");
  const refreshToken = String(data.refresh_token ?? "");
  if (!accessToken) throw new ApiError(502, "飞书未返回访问令牌，请重新授权", "FEISHU_OAUTH_FAILED");
  if (!refreshToken) throw new ApiError(502, "飞书未返回刷新令牌，请确认应用已允许 offline_access 后重新授权", "FEISHU_OAUTH_FAILED");
  const expiresIn = Math.max(60, Number(data.expires_in ?? data.expires ?? 7200));
  return { accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), scope: String(data.scope ?? "").split(/[ ,]/).filter(Boolean) };
}

export async function exchangeAuthorizationCode(code: string) {
  return parseToken(await exchange({ grant_type: "authorization_code", code, redirect_uri: FEISHU_CALLBACK_URL }));
}

async function refreshToken(refreshToken: string) {
  return parseToken(await exchange({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function verifyFeishuRefreshToken(ownerId: string) {
  const connection = await getFeishuConnection(ownerId);
  if (!connection?.refresh_token_encrypted) {
    throw new ApiError(409, "飞书连接没有可用的刷新令牌，请重新授权", "FEISHU_REAUTH_REQUIRED");
  }
  try {
    const refreshed = await refreshToken(await decryptSecret(String(connection.refresh_token_encrypted)));
    await saveConnection(ownerId, refreshed);
    return { expiresAt: refreshed.expiresAt, scopes: refreshed.scope };
  } catch (error) {
    await getDatabase().prepare("UPDATE integrations SET status = 'needs_reauth', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
      .bind(error instanceof Error ? error.message : "令牌刷新失败", connection.id, ownerId).run();
    throw new ApiError(401, "飞书刷新令牌验证失败，请重新连接", "FEISHU_REAUTH_REQUIRED");
  }
}

export async function saveConnection(ownerId: string, tokens: TokenPayload, user?: { id?: string; name?: string; tenantKey?: string }) {
  const db = getDatabase();
  const existing = await getFeishuConnection(ownerId);
  const accessEncrypted = await encryptSecret(tokens.accessToken);
  const refreshEncrypted = await encryptSecret(tokens.refreshToken);
  if (existing) {
    const tenantChanged = Boolean(user?.tenantKey && existing.external_tenant_key && user.tenantKey !== existing.external_tenant_key);
    await db.batch([
      db.prepare("UPDATE integrations SET status = 'connected', external_user_id = ?, external_user_name = ?, external_tenant_key = ?, access_token_encrypted = ?, refresh_token_encrypted = ?, token_expires_at = ?, scopes = ?, config = CASE WHEN ? THEN '{}' ELSE config END, last_error = NULL, disconnected_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(user?.id ?? existing.external_user_id ?? null, user?.name ?? existing.external_user_name ?? null, user?.tenantKey ?? existing.external_tenant_key ?? null, accessEncrypted, refreshEncrypted, tokens.expiresAt, JSON.stringify(tokens.scope), tenantChanged ? 1 : 0, existing.id, ownerId),
      db.prepare("UPDATE integration_mappings SET deleted_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE deleted_at END, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND integration_id = ? AND deleted_at IS NULL").bind(tenantChanged ? 1 : 0, ownerId, existing.id),
    ]);
    return String(existing.id);
  }
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO integrations (id, owner_id, provider, status, external_user_id, external_user_name, external_tenant_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes) VALUES (?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, ownerId, FEISHU_PROVIDER, user?.id ?? null, user?.name ?? null, user?.tenantKey ?? null, accessEncrypted, refreshEncrypted, tokens.expiresAt, JSON.stringify(tokens.scope)).run();
  return id;
}

export async function feishuRequest<T = Record<string, unknown>>(ownerId: string, path: string, init: RequestInit = {}): Promise<T> {
  const row = await getFeishuConnection(ownerId);
  if (!row || String(row.status) !== "connected" || !row.access_token_encrypted || !row.refresh_token_encrypted) throw new ApiError(409, "请先连接飞书", "FEISHU_NOT_CONNECTED");
  let accessToken = await decryptSecret(String(row.access_token_encrypted));
  if (Date.parse(String(row.token_expires_at ?? 0)) < Date.now() + 90_000) {
    try {
      const refreshed = await refreshToken(await decryptSecret(String(row.refresh_token_encrypted)));
      await saveConnection(ownerId, refreshed);
      accessToken = refreshed.accessToken;
    } catch (error) {
      await getDatabase().prepare("UPDATE integrations SET status = 'needs_reauth', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(error instanceof Error ? error.message : "令牌刷新失败", row.id, ownerId).run();
      throw new ApiError(401, "飞书授权已失效，请重新连接", "FEISHU_REAUTH_REQUIRED");
    }
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", headers.get("content-type") || "application/json; charset=utf-8");
  const response = await fetch(`${FEISHU_API_ORIGIN}${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text ? safeJson<Record<string, unknown>>(text, { msg: text }) : {};
  const code = Number(payload.code ?? 0);
  if (!response.ok || code !== 0) {
    const message = String(payload.msg ?? payload.message ?? "飞书接口调用失败");
    if (response.status === 401 || response.status === 403 || [99991663, 99991668, 99991672].includes(code)) {
      await getDatabase().prepare("UPDATE integrations SET status = 'needs_reauth', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(message, row.id, ownerId).run();
    }
    throw new ApiError(response.status === 429 ? 429 : response.status >= 400 ? response.status : 502, message, `FEISHU_${code || response.status}`, response.status === 429 || response.status >= 500);
  }
  return (payload.data ?? payload) as T;
}

export async function getFeishuUser(ownerId: string) {
  const data = await feishuRequest<Record<string, unknown>>(ownerId, "/authen/v1/user_info");
  return { id: String(data.open_id ?? data.union_id ?? data.user_id ?? ""), name: String(data.name ?? data.en_name ?? "飞书用户"), tenantKey: String(data.tenant_key ?? data.tenantKey ?? "") || undefined };
}

export async function updateWorkspaceConfig(ownerId: string, integrationId: string, config: FeishuWorkspaceConfig) {
  await getDatabase().prepare("UPDATE integrations SET config = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify(config), integrationId, ownerId).run();
}

export async function disconnectFeishu(ownerId: string) {
  await getDatabase().prepare("UPDATE integrations SET status = 'disconnected', access_token_encrypted = NULL, refresh_token_encrypted = NULL, token_expires_at = NULL, disconnected_at = CURRENT_TIMESTAMP, last_error = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND provider = ?").bind(ownerId, FEISHU_PROVIDER).run();
}
