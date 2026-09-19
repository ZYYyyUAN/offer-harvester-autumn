declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    DASHSCOPE_API_KEY?: string;
    DASHSCOPE_BASE_URL?: string;
    FEISHU_APP_ID?: string;
    FEISHU_APP_SECRET?: string;
    FEISHU_TOKEN_ENCRYPTION_KEY?: string;
  }
}
