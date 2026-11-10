ALTER TABLE `ai_job_attempts` ADD `telemetry` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `capture_key` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `phase` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_capture_active` ON `ai_jobs` (`owner_id`,`capture_key`) WHERE "ai_jobs"."capture_key" IS NOT NULL AND "ai_jobs"."status" IN ('queued','running');