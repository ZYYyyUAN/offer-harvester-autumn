import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  data: text("data").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull().default(""),
    data: text("data").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_records_owner_kind_active").on(
      table.ownerId,
      table.kind,
      table.deletedAt,
    ),
    index("idx_records_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const storedFiles = sqliteTable(
  "stored_files",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    recordId: text("record_id"),
    purpose: text("purpose").notNull(),
    filename: text("filename").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull().default(0),
    metadata: text("metadata").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_files_owner_purpose_active").on(
      table.ownerId,
      table.purpose,
      table.deletedAt,
    ),
  ],
);

export const aiJobs = sqliteTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    batchId: text("batch_id"),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    inputSnapshot: text("input_snapshot").notNull().default("{}"),
    sourceRefs: text("source_refs").notNull().default("[]"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    result: text("result"),
    resultRecordId: text("result_record_id"),
    confidence: text("confidence"),
    elapsedMs: integer("elapsed_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_ai_jobs_owner_status_updated").on(table.ownerId, table.status, table.updatedAt),
    index("idx_ai_jobs_owner_type_updated").on(table.ownerId, table.type, table.updatedAt),
    index("idx_ai_jobs_owner_batch").on(table.ownerId, table.batchId),
  ],
);

export const aiJobAttempts = sqliteTable(
  "ai_job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    ownerId: text("owner_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    tokenUsage: text("token_usage").notNull().default("{}"),
    responseSummary: text("response_summary"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("idx_ai_attempts_job_number").on(table.jobId, table.attemptNumber),
    index("idx_ai_attempts_owner_started").on(table.ownerId, table.startedAt),
  ],
);

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    externalUserId: text("external_user_id"),
    externalUserName: text("external_user_name"),
    externalTenantKey: text("external_tenant_key"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: text("token_expires_at"),
    scopes: text("scopes").notNull().default("[]"),
    config: text("config").notNull().default("{}"),
    lastError: text("last_error"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    disconnectedAt: text("disconnected_at"),
  },
  (table) => [
    uniqueIndex("uq_integrations_owner_provider").on(table.ownerId, table.provider),
  ],
);

export const integrationOauthStates = sqliteTable(
  "integration_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    provider: text("provider").notNull(),
    returnPath: text("return_path").notNull().default("/"),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_oauth_states_owner_expiry").on(table.ownerId, table.expiresAt)],
);

export const integrationMappings = sqliteTable(
  "integration_mappings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    integrationId: text("integration_id").notNull(),
    objectType: text("object_type").notNull(),
    localId: text("local_id"),
    remoteId: text("remote_id"),
    localVersion: integer("local_version"),
    localHash: text("local_hash"),
    remoteHash: text("remote_hash"),
    metadata: text("metadata").notNull().default("{}"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_integration_mappings_active_local").on(table.ownerId, table.integrationId, table.objectType, table.localId).where(sql`${table.deletedAt} IS NULL AND ${table.objectType} IN ('application','resume') AND ${table.localId} IS NOT NULL`),
    uniqueIndex("uq_integration_mappings_active_remote").on(table.ownerId, table.integrationId, table.objectType, table.remoteId).where(sql`${table.deletedAt} IS NULL AND ${table.objectType} IN ('application','resume') AND ${table.remoteId} IS NOT NULL`),
  ],
);

export const integrationRuns = sqliteTable(
  "integration_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    integrationId: text("integration_id").notNull(),
    runType: text("run_type").notNull(),
    status: text("status").notNull().default("preview"),
    preview: text("preview").notNull().default("{}"),
    decisions: text("decisions").notNull().default("[]"),
    result: text("result").notNull().default("{}"),
    error: text("error"),
    expiresAt: text("expires_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("idx_integration_runs_owner_created").on(table.ownerId, table.integrationId, table.createdAt),
    index("idx_integration_runs_status").on(table.ownerId, table.status),
  ],
);
