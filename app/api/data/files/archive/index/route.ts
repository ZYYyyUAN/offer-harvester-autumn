import { apiError, requireApiUser } from "@/lib/server-data";
import { BACKUP_PART_BYTES, buildBackupFileEntries } from "@/lib/backup";

export async function GET() {
  try {
    const { userId } = await requireApiUser(); const files = await buildBackupFileEntries(userId);
    const partCount = files.length ? Math.max(...files.map((file) => file.part)) + 1 : 0;
    return Response.json({ schemaVersion: 3, partCount, maxPartBytes: BACKUP_PART_BYTES, files: files.map(({ id, filename, size, sha256, archivePath, part }) => ({ id, filename, size, sha256, archivePath, part })) });
  } catch (error) { return apiError(error); }
}
