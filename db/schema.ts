import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
