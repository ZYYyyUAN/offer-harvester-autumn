CREATE UNIQUE INDEX `uq_metadata_conversion` ON `records` (`owner_id`, json_extract(`data`, '$.conversionKey')) WHERE `kind` = 'applications' AND `deleted_at` IS NULL AND json_extract(`data`, '$.conversionKey') IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_metadata_revision` ON `records` (`owner_id`, json_extract(`data`, '$.submissionId'), json_extract(`data`, '$.revision')) WHERE `kind` = 'submission_metadata_revisions';
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_company_registry` ON `records` (`owner_id`, json_extract(`data`, '$.registryId')) WHERE `kind` = 'company_profiles' AND `deleted_at` IS NULL AND json_extract(`data`, '$.registryId') <> '';
