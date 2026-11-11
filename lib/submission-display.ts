// Both paged cards and bookmarked details must show the archived file, not today's comparison draft.
const historicalMetadataSql = `coalesce((SELECT json_extract(revision.data,'$.metadata') FROM records revision WHERE revision.owner_id = sub.owner_id AND revision.kind = 'submission_metadata_revisions' AND revision.deleted_at IS NULL AND json_extract(revision.data,'$.submissionId') = sub.id ORDER BY json_extract(revision.data,'$.revision') DESC LIMIT 1),json_extract(sub.data,'$.metadataSnapshot'))`;
export const submissionDisplaySql = `SELECT json_object(
  'appliedAt',json_extract(snap.data,'$.appliedAt'),
  'resumeDisplayName',json_extract(snap.data,'$.resumeDisplayName'),
  'resumeFileVersion',json_extract(snap.data,'$.resumeFileVersion'),
  'resumeFileId',json_extract(snap.data,'$.resumeFileId'),
  'resumeReferenceStatus',json_extract(snap.data,'$.resumeReferenceStatus'),
  'actualChannel',coalesce(json_extract(${historicalMetadataSql},'$.actualSubmission.channel'),'unknown'),
  'actualChannelCustom',coalesce(json_extract(${historicalMetadataSql},'$.actualSubmission.customLabel'),''))
  FROM records sub JOIN records snap ON snap.id = json_extract(sub.data,'$.snapshotId') AND snap.owner_id = sub.owner_id AND snap.kind = 'jd_snapshots' AND snap.deleted_at IS NULL
  WHERE sub.owner_id = application.owner_id AND sub.kind = 'job_submissions' AND sub.deleted_at IS NULL AND json_extract(sub.data,'$.applicationId') = application.id LIMIT 1`;
