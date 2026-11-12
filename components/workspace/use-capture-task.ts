"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./shared";
import type { AIJob } from "./types";
import { capturePhaseLabels } from "@/lib/capture-contracts";

export function useCaptureTask(id: string, onResult: (job: AIJob) => Promise<void>) {
  const callback = useRef(onResult), delivered = useRef(""), retrying = useRef(false);
  const [job, setJob] = useState<AIJob | null>(null), [error, setError] = useState(""), [elapsed, setElapsed] = useState(0), [revision, setRevision] = useState(0);
  useEffect(() => { callback.current = onResult; }, [onResult]);
  useEffect(() => {
    setJob(null); setError(""); setElapsed(0);
    if (!id) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>, running = false;
    async function poll() {
      try {
        const response = await api<{ job: AIJob; serverNow: string }>(`/api/ai/jobs/${id}`);
        if (disposed) return;
        const current = response.job; setJob(current); setError("");
        const timestamp = (value: string) => new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
        setElapsed(Math.max(0, Math.floor((timestamp(current.finishedAt || response.serverNow) - timestamp(current.createdAt)) / 1000)));
        if (current.status === "succeeded" && delivered.current !== id) {
          await callback.current(current);
          delivered.current = id;
        }
        if (current.status === "queued" && !running) {
          running = true;
          void api(`/api/ai/jobs/${id}/run`, { method: "POST" }).catch((failure) => { if (!disposed) setError(failure.message); });
        }
        if ((["queued", "running"].includes(current.status) || retrying.current) && !disposed) timer = setTimeout(poll, 1500);
      } catch (failure) { if (!disposed) setError((failure as Error).message); }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [id, revision]);
  async function cancel() { try { await api(`/api/ai/jobs/${id}/cancel`, { method: "POST" }); setRevision((value) => value + 1); } catch (failure) { setError((failure as Error).message); } }
  function retry() {
    setError(""); delivered.current = ""; retrying.current = true;
    void api(`/api/ai/jobs/${id}/retry`, { method: "POST" }).then(() => { retrying.current = false; setRevision((value) => value + 1); }).catch((failure) => { retrying.current = false; setError(failure.message); setRevision((value) => value + 1); });
    setRevision((value) => value + 1);
  }
  return { job, error, elapsed, busy: Boolean(id && (!job || ["queued", "running"].includes(job.status))), phase: capturePhaseLabels[job?.phase || job?.status || "queued"] || job?.status || "已排队", cancel, retry, reload: () => setRevision((value) => value + 1) };
}
