CREATE TABLE `ai_job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`token_usage` text DEFAULT '{}' NOT NULL,
	`response_summary` text,
	`error_code` text,
	`error_message` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_ai_attempts_job_number` ON `ai_job_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_ai_attempts_owner_started` ON `ai_job_attempts` (`owner_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`batch_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`input_snapshot` text DEFAULT '{}' NOT NULL,
	`source_refs` text DEFAULT '[]' NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`result` text,
	`result_record_id` text,
	`confidence` text,
	`elapsed_ms` integer,
	`error_code` text,
	`error_message` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_owner_status_updated` ON `ai_jobs` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_owner_type_updated` ON `ai_jobs` (`owner_id`,`type`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_owner_batch` ON `ai_jobs` (`owner_id`,`batch_id`);