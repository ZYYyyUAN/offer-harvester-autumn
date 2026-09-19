DROP INDEX `idx_integration_mappings_local`;--> statement-breakpoint
DROP INDEX `idx_integration_mappings_remote`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_mappings_local` ON `integration_mappings` (`owner_id`,`integration_id`,`object_type`,`local_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_mappings_remote` ON `integration_mappings` (`owner_id`,`integration_id`,`object_type`,`remote_id`);--> statement-breakpoint
DROP INDEX `idx_integrations_owner_provider`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integrations_owner_provider` ON `integrations` (`owner_id`,`provider`);