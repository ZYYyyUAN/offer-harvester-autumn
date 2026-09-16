import { createRecord, deleteRecord, listRecords, updateRecord } from "@/lib/record-api";

export const GET = listRecords;
export const POST = createRecord;
export const PATCH = updateRecord;
export const DELETE = deleteRecord;
