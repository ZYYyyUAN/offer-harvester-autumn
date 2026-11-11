"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JobMetadataSchema, type JobMetadata } from "@/lib/job-metadata";
import { confirmMetadataReview, JobMetadataEditor } from "./job-metadata-editor";
import type { RecordItem } from "./types";

export function useSubmissionConfirmation() {
  const [pending, setPending] = useState<{ item: RecordItem; resolve: (metadata: JobMetadata | null) => void } | null>(null);
  const [metadata, setMetadata] = useState<JobMetadata>(() => JobMetadataSchema.parse({}));
  const [lastId, setLastId] = useState("");
  function ask(item: RecordItem) {
    if (lastId !== item.id) { setMetadata(JobMetadataSchema.parse(item.data.jobMetadata || {})); setLastId(item.id); }
    return new Promise<JobMetadata | null>((resolve) => setPending({ item, resolve }));
  }
  function close(confirmed: boolean) {
    if (!pending) return;
    pending.resolve(confirmed ? confirmMetadataReview(metadata, pending.item.data.company, pending.item.data.sourceUrl || "", true) : null); setPending(null);
  }
  const dialog = pending && <Dialog open onOpenChange={(open) => !open && close(false)}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>确认完成投递</DialogTitle><DialogDescription>{pending.item.data.company} · {pending.item.data.role}。请仅在已经真实提交后确认。实际渠道可以保持未知，不会沿用计划值。</DialogDescription></DialogHeader><JobMetadataEditor daily company={pending.item.data.company} sourceUrl={pending.item.data.sourceUrl || ""} value={metadata} onChange={setMetadata} submission /><DialogFooter><Button variant="outline" onClick={() => close(false)}>取消</Button><Button onClick={() => close(true)}>确认已完成投递</Button></DialogFooter></DialogContent></Dialog>;
  return { ask, dialog };
}
