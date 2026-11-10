"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./shared";
import { JobMetadataSchema } from "@/lib/job-metadata";

export function useCaptureDraft(open: boolean, values: Record<string, any>, jobId: string, onLoad: (values: Record<string, any>, jobId: string) => void) {
  const record = useRef<{ id: string; version: number } | null>(null), latest = useRef({ values, jobId }), lastSaved = useRef(""), queue = useRef<Promise<any>>(Promise.resolve());
  const failedSignature = useRef("");
  const load = useRef(onLoad);
  useEffect(() => { load.current = onLoad; latest.current = { values, jobId }; }, [values, jobId, onLoad]);
  const [status, setStatus] = useState(""), [ready, setReady] = useState(false);
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("captureDraft");
    if (!id) { setReady(true); return; }
    api<any>(`/api/job-capture-drafts?id=${encodeURIComponent(id)}`).then(({ record: saved }) => {
      if (saved.data.confirmedSavedJobId) { setStatus("该草稿已收藏"); setReady(true); return; }
      record.current = saved; load.current({ ...saved.data.values, jobMetadata: saved.data.metadata }, saved.data.extractionJobId); setReady(true);
    }).catch((error) => { setStatus(`草稿恢复失败：${error.message}`); });
  }, []);
  const flush = useCallback(() => {
    const operation = queue.current.catch(() => undefined).then(async () => {
      const current = latest.current, { jobMetadata, ...fields } = current.values;
      const data = { values: fields, metadata: jobMetadata || JobMetadataSchema.parse({}), extractionJobId: current.jobId, confirmedSavedJobId: null };
      const signature = JSON.stringify(data);
      if (signature === lastSaved.current && record.current) return record.current;
      failedSignature.current = signature;
      setStatus("正在保存草稿…");
      const response = await api<any>("/api/job-capture-drafts", { method: record.current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record.current ? { id: record.current.id, version: record.current.version, data } : data) }).catch((error) => { failedSignature.current = signature; throw error; });
      record.current = { id: response.record.id, version: response.record.version }; lastSaved.current = signature;
      failedSignature.current = "";
      const url = new URL(window.location.href); url.searchParams.set("captureDraft", response.record.id); window.history.replaceState(null, "", url);
      setStatus("草稿已保存到云端"); return record.current;
    });
    queue.current = operation; return operation;
  }, []);
  useEffect(() => {
    if (!open || !ready) return;
    const { jobMetadata, ...fields } = values;
    const signature = JSON.stringify({ values: fields, metadata: jobMetadata || JobMetadataSchema.parse({}), extractionJobId: jobId, confirmedSavedJobId: null });
    if (signature === lastSaved.current || signature === failedSignature.current) return;
    setStatus("草稿有未保存修改…");
    const timer = setTimeout(() => { flush().catch((error) => setStatus(`草稿未保存：${error.message}`)); }, 700);
    return () => clearTimeout(timer);
  }, [open, values, jobId, ready, flush]);
  function clear() { record.current = null; lastSaved.current = ""; failedSignature.current = ""; const url = new URL(window.location.href); url.searchParams.delete("captureDraft"); window.history.replaceState(null, "", url); setStatus(""); }
  async function retry(asCopy = false) { if (asCopy) { record.current = null; lastSaved.current = ""; } failedSignature.current = ""; try { await flush(); } catch (error) { setStatus(`草稿未保存：${(error as Error).message}`); } }
  return { flush, clear, retry, status, ready };
}
