CREATE TABLE `integration_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`object_type` text NOT NULL,
	`local_id` text,
	`remote_id` text,
	`local_version` integer,
	`local_hash` text,
	`remote_hash` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`last_synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_integration_mappings_local` ON `integration_mappings` (`owner_id`,`integration_id`,`object_type`,`local_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_mappings_remote` ON `integration_mappings` (`owner_id`,`integration_id`,`object_type`,`remote_id`);--> statement-breakpoint
CREATE TABLE `integration_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`return_path` text DEFAULT '/' NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_owner_expiry` ON `integration_oauth_states` (`owner_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `integration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`run_type` text NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`preview` text DEFAULT '{}' NOT NULL,
	`decisions` text DEFAULT '[]' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`error` text,
	`expires_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_integration_runs_owner_created` ON `integration_runs` (`owner_id`,`integration_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_integration_runs_status` ON `integration_runs` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`external_user_id` text,
	`external_user_name` text,
	`access_token_encrypted` text,
	`refresh_token_encrypted` text,
	`token_expires_at` text,
	`scopes` text DEFAULT '[]' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`last_error` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`disconnected_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_integrations_owner_provider` ON `integrations` (`owner_id`,`provider`);