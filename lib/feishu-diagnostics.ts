export type FeishuCapability = {
  id: "identity" | "offline" | "drive" | "docx" | "bitable" | "minutes";
  label: string; required: boolean; granted: boolean; matchedScopes: string[]; hint: string;
};

const definitions: Array<Omit<FeishuCapability, "granted" | "matchedScopes"> & { matches: (scope: string) => boolean }> = [
  { id: "identity", label: "用户身份", required: true, hint: "开通 auth:user.id:read", matches: (s) => s === "auth:user.id:read" || s.startsWith("contact:user.base") },
  { id: "offline", label: "离线刷新", required: true, hint: "授权时允许 offline_access", matches: (s) => s === "offline_access" },
  { id: "drive", label: "云空间文件读写", required: true, hint: "开通云空间文件读取、上传、下载和管理权限", matches: (s) => /^(drive|space):/.test(s) && /(write|manage|file|drive)/.test(s) },
  { id: "docx", label: "云文档及文档块读写", required: true, hint: "开通 docx 文档与文档块读写权限", matches: (s) => /^docx:/.test(s) && /(write|document|block)/.test(s) },
  { id: "bitable", label: "多维表格读写", required: true, hint: "开通 bitable 应用、数据表、字段与记录读写权限", matches: (s) => /^bitable:/.test(s) && /(write|app|table|record|field)/.test(s) },
  { id: "minutes", label: "妙记读取", required: false, hint: "可选：开通 minutes 读取；否则使用文件或文本导入", matches: (s) => /^minutes:/.test(s) },
];

export function buildFeishuCapabilities(scopes: string[]) {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
  return definitions.map(({ matches, ...definition }) => { const matchedScopes = normalized.filter(matches); return { ...definition, granted: matchedScopes.length > 0, matchedScopes }; });
}
export function requiredCapabilitiesReady(scopes: string[]) { return buildFeishuCapabilities(scopes).every((item) => !item.required || item.granted); }
export function validateResumeMagic(bytes: Uint8Array, extension: string) {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (ext === "docx") return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ext === "doc") return [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((value, index) => bytes[index] === value);
  return false;
}
