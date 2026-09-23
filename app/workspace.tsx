"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  Bookmark,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Columns3,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Globe2,
  ImageIcon,
  LayoutDashboard,
  List,
  Menu,
  MessagesSquare,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Sparkles,
  Square,
  Timer,
  ListChecks,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultJobSearchSettings, jobDeadlineStatus } from "@/lib/workflow-contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type View = "dashboard" | "today" | "profile" | "resumes" | "savedJobs" | "applications" | "tasks" | "evidence" | "analysis" | "company" | "interviews" | "foreignPrep" | "offers" | "calendar" | "resources" | "knowledge" | "aiCenter" | "feishu" | "trash";
type Kind = "applications" | "saved_jobs" | "tasks" | "evidence" | "interviews" | "offers" | "reminders" | "analyses" | "research";
type RecordItem = { id: string; kind: Kind; title: string; data: Record<string, any>; version: number; createdAt: string; updatedAt: string; deletedAt: string | null };
type StoredFile = { id: string; filename: string; mimeType: string; size: number; metadata: Record<string, any>; version: number; createdAt: string; deletedAt?: string | null };
type PhaseCountdown = { key: string; label: string; date: string; hint: string; daysRemaining: number | null; status: "unset" | "ended" | "today" | "active" };
type Dashboard = { totalApplications: number; savedCount: number; interviewCount: number; offerCount: number; invitationRate: number; stageCounts: Record<string, number>; funnel: Record<string, number>; upcoming: Array<{ data: Record<string, any> }>; risks: Array<{ item: Record<string, any>; risk: { level: string; reason: string } }>; openTasks: Array<Record<string, any>>; pendingEvidence: number; recentApplications: Array<{ data: Record<string, any>; updatedAt: string }>; segments: Record<string, any[]>; settings: Record<string, any>; serverNow?: string; phaseCountdowns?: PhaseCountdown[] };
type AIJob = { id: string; batchId?: string | null; type: string; status: string; inputSnapshot: Record<string, any>; sourceRefs: any[]; model: string; promptVersion: string; result: Record<string, any> | null; resultRecordId?: string | null; confidence?: string | null; elapsedMs?: number | null; errorCode?: string | null; errorMessage?: string | null; createdAt: string; startedAt?: string | null; finishedAt?: string | null };
type ResearchDraft = { company: string; researchStage: string; companyType: string; targetRole: string; businessLine: string; personalFindings: string; offerDetails: string };

const emptyDashboard: Dashboard = { totalApplications: 0, savedCount: 0, interviewCount: 0, offerCount: 0, invitationRate: 0, stageCounts: {}, funnel: {}, upcoming: [], risks: [], openTasks: [], pendingEvidence: 0, recentApplications: [], segments: {}, settings: {} };
const stageOrder = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"];
const stageLabel = (stage: string) => stage === "待投递" ? "准备中" : stage === "已投递" ? "已投简历" : stage;

const nav = [
  { id: "dashboard" as View, label: "数据总览", icon: LayoutDashboard },
  { id: "today" as View, label: "今日行动", icon: Timer },
  { id: "profile" as View, label: "个人资料", icon: UserRound },
  { id: "feishu" as View, label: "飞书同步", icon: RefreshCw },
  { id: "resumes" as View, label: "简历库", icon: FileText },
  { id: "savedJobs" as View, label: "收藏岗位", icon: Bookmark },
  { id: "applications" as View, label: "投递看板", icon: BriefcaseBusiness },
  { id: "tasks" as View, label: "行动清单", icon: ListChecks },
  { id: "evidence" as View, label: "事实库", icon: Database },
  { id: "analysis" as View, label: "岗位分析", icon: Sparkles },
  { id: "aiCenter" as View, label: "AI 任务中心", icon: ListChecks },
  { id: "company" as View, label: "公司背调", icon: Building2 },
  { id: "interviews" as View, label: "面试复盘", icon: MessagesSquare },
  { id: "foreignPrep" as View, label: "外企准备", icon: Globe2 },
  { id: "offers" as View, label: "OFFER 决策", icon: Scale },
  { id: "calendar" as View, label: "日程提醒", icon: CalendarDays },
  { id: "knowledge" as View, label: "求职知识库", icon: BookOpen },
  { id: "resources" as View, label: "寻找岗位", icon: Search },
  { id: "trash" as View, label: "回收站", icon: Trash2 },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload as T;
}

function formatDate(value: unknown, withTime = false) {
  if (!value) return "未设置";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: any; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span><Icon /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function StatusPill({ children, tone = "blue" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function useConfirmDialog() {
  const [request, setRequest] = useState<{ title: string; description: string; destructive?: boolean; resolve: (value: boolean) => void } | null>(null);
  const ask = useCallback((title: string, description: string, destructive = false) => new Promise<boolean>((resolve) => setRequest({ title, description, destructive, resolve })), []);
  const close = (value: boolean) => { request?.resolve(value); setRequest(null); };
  const dialog = request ? <Dialog open onOpenChange={(open) => !open && close(false)}><DialogContent><DialogHeader><DialogTitle>{request.title}</DialogTitle><DialogDescription>{request.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => close(false)}>取消</Button><Button variant={request.destructive ? "destructive" : "default"} onClick={() => close(true)}>{request.destructive ? <Trash2 /> : <CheckCircle2 />}确认</Button></DialogFooter></DialogContent></Dialog> : null;
  return { ask, dialog };
}

export function OfferWorkspace({ user }: { user: { email: string; displayName: string } }) {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, any>>({ email: user.email, name: "" });
  const [saveState, setSaveState] = useState("已保存");
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [records, setRecords] = useState<Record<Kind, RecordItem[]>>({ applications: [], saved_jobs: [], tasks: [], evidence: [], interviews: [], offers: [], reminders: [], analyses: [], research: [] });
  const [resumes, setResumes] = useState<StoredFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<StoredFile[]>([]);
  const [jobScreenshots, setJobScreenshots] = useState<StoredFile[]>([]);
  const [editor, setEditor] = useState<{ kind: Kind; item?: RecordItem } | null>(null);
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const [resumeViewRequest, setResumeViewRequest] = useState<{ tab: "completed" | "optimization"; applicationId?: string }>({ tab: "completed" });
  const [analysisInput, setAnalysisInput] = useState({ title: "", jd: "" });
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, any> | null>(null);
  const [researchDraft, setResearchDraft] = useState({ company: "", researchStage: "screening", companyType: "unknown", targetRole: "", businessLine: "", personalFindings: "", offerDetails: "" });
  const [researchBusy, setResearchBusy] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weights, setWeights] = useState({ salary: 30, growth: 25, platform: 18, balance: 15, outlook: 12 });
  const [migrationItems, setMigrationItems] = useState<{ applications: any[]; evidence: any[] } | null>(null);
  const [aiJobs, setAiJobs] = useState<AIJob[]>([]);
  const [legacyAI, setLegacyAI] = useState<any[]>([]);
  const [activeAIJobId, setActiveAIJobId] = useState<string | null>(null);
  const [aiAttempts, setAiAttempts] = useState<any[]>([]);
  const [evaluation, setEvaluation] = useState<Record<string, any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingWanted = useRef(false);
  const segmentIndex = useRef(0);
  const segmentStartedAt = useRef(0);
  const recordedSegments = useRef<Array<Record<string, any>>>([]);
  const [routeReady, setRouteReady] = useState(false);
  const confirmation = useConfirmDialog();
  const [resumeUpload, setResumeUpload] = useState<{ file: File; displayName: string; note: string; target: string } | null>(null);
  const [resumeAnalysis, setResumeAnalysis] = useState<{ file: StoredFile; jd: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const kinds: Kind[] = ["applications", "saved_jobs", "tasks", "evidence", "interviews", "offers", "reminders", "analyses", "research"];
      const [profileResult, dashboardResult, resumeResult, audioResult, screenshotResult, ...recordResults] = await Promise.all([
        api<{ profile: Record<string, any> }>("/api/profile"),
        api<{ dashboard: Dashboard }>("/api/dashboard"),
        api<{ files: StoredFile[] }>("/api/files?purpose=resume"),
        api<{ files: StoredFile[] }>("/api/files?purpose=audio"),
        api<{ files: StoredFile[] }>("/api/files?purpose=job_screenshot"),
        ...kinds.map((kind) => api<{ records: RecordItem[] }>(`/api/records?kind=${kind}`)),
      ]);
      setProfile(profileResult.profile);
      setDashboard(dashboardResult.dashboard);
      setResumes(resumeResult.files);
      setAudioFiles(audioResult.files);
      setJobScreenshots(screenshotResult.files);
      setRecords(Object.fromEntries(kinds.map((kind, index) => [kind, recordResults[index].records])) as Record<Kind, RecordItem[]>);
      const aiResult = await api<{ jobs: AIJob[]; legacy: any[] }>("/api/ai/jobs?pageSize=20");
      setAiJobs(aiResult.jobs); setLegacyAI(aiResult.legacy || []);
      setActiveAIJobId((current) => current || aiResult.jobs.find((item) => ["queued", "running"].includes(item.status))?.id || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (nav.some((item) => item.id === requested)) setView(requested as View);
    const status = new URLSearchParams(window.location.search).get("feishu");
    if (status === "connected") toast.success("飞书授权已完成，请初始化专用空间");
    if (status === "error") toast.error(new URLSearchParams(window.location.search).get("message") || "飞书连接失败");
    setRouteReady(true);
  }, []);

  useEffect(() => {
    if (!routeReady) return;
    const url = new URL(window.location.href); url.searchParams.set("view", view); window.history.replaceState({}, "", url);
  }, [view, routeReady]);

  useEffect(() => {
    const onPopState = () => { const requested = new URLSearchParams(window.location.search).get("view"); if (nav.some((item) => item.id === requested)) setView(requested as View); };
    window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10); const key = "offer-trash-purge-day"; if (localStorage.getItem(key) === day) return;
    api("/api/trash/purge", { method: "POST" }).then(() => localStorage.setItem(key, day)).catch(() => undefined);
  }, []);

  const refreshAIJobs = useCallback(async () => {
    try {
      const result = await api<{ jobs: AIJob[]; legacy: any[] }>("/api/ai/jobs?pageSize=50");
      setAiJobs(result.jobs); setLegacyAI(result.legacy || []);
    } catch (error) { toast.error((error as Error).message); }
  }, []);

  useEffect(() => { if (view === "aiCenter") refreshAIJobs(); }, [view, refreshAIJobs]);

  async function createAndRunAI(type: string, input: Record<string, any>) {
    const created = await api<{ job: AIJob }>("/api/ai/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, input }) });
    setActiveAIJobId(created.job.id);
    setAiJobs((items) => [created.job, ...items.filter((item) => item.id !== created.job.id)]);
    const completed = await api<{ job: AIJob; attempts: any[] }>(`/api/ai/jobs/${created.job.id}/run`, { method: "POST" });
    setAiAttempts(completed.attempts);
    setAiJobs((items) => [completed.job, ...items.filter((item) => item.id !== completed.job.id)]);
    return completed.job;
  }

  async function openAIJob(id: string) {
    setActiveAIJobId(id);
    try { const detail = await api<{ job: AIJob; attempts: any[] }>(`/api/ai/jobs/${id}`); setAiAttempts(detail.attempts); }
    catch (error) { toast.error((error as Error).message); }
  }

  async function retryAIJob(id: string) {
    const toastId = toast.loading("正在重试 AI 任务…");
    try { const result = await api<{ job: AIJob; attempts: any[] }>(`/api/ai/jobs/${id}/retry`, { method: "POST" }); setAiAttempts(result.attempts); await refreshAIJobs(); toast.success("任务重试成功", { id: toastId }); }
    catch (error) { toast.error((error as Error).message, { id: toastId }); await refreshAIJobs(); }
  }

  async function cancelAIJob(id: string) {
    try { await api(`/api/ai/jobs/${id}/cancel`, { method: "POST" }); await refreshAIJobs(); toast.success("任务已取消"); }
    catch (error) { toast.error((error as Error).message); }
  }

  async function runEvaluation() {
    const toastId = toast.loading("已创建 20 组合成回归，正在逐组真实调用千问…");
    try {
      const created = await api<{ evaluation: Record<string, any>; jobs: AIJob[] }>("/api/ai/evaluations", { method: "POST" });
      setEvaluation({ ...created.evaluation, completed: 0, total: created.jobs.length }); setAiJobs((items) => [...created.jobs, ...items]);
      for (let index = 0; index < created.jobs.length; index++) {
        try { await api(`/api/ai/jobs/${created.jobs[index].id}/run`, { method: "POST" }); } catch {}
        const progress = await api<{ evaluation: Record<string, any> }>(`/api/ai/evaluations/${created.evaluation.id}`);
        setEvaluation(progress.evaluation);
        toast.loading(`合成回归 ${index + 1}/${created.jobs.length}：F1 ${Math.round((progress.evaluation.f1 || 0) * 100)}%`, { id: toastId });
      }
      const report = await api<{ evaluation: Record<string, any> }>(`/api/ai/evaluations/${created.evaluation.id}`);
      setEvaluation(report.evaluation); await refreshAIJobs();
      if (report.evaluation.passed) toast.success("20 组合成回归达到发布门槛", { id: toastId }); else toast.error("回归未达到门槛，结果已保留供排查", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  useEffect(() => {
    try {
      const oldApplications = JSON.parse(localStorage.getItem("offer-applications") || "[]").filter((item: any) => Number(item.id) > 1000);
      const oldEvidence = JSON.parse(localStorage.getItem("offer-evidence") || "[]").filter((item: any) => Number(item.id) > 1000);
      if (oldApplications.length || oldEvidence.length) setMigrationItems({ applications: oldApplications, evidence: oldEvidence });
    } catch {}
  }, []);

  const refresh = useCallback(async (kind?: Kind) => {
    try {
      if (kind) {
        const result = await api<{ records: RecordItem[] }>(`/api/records?kind=${kind}`);
        setRecords((current) => ({ ...current, [kind]: result.records }));
      }
      const result = await api<{ dashboard: Dashboard }>("/api/dashboard");
      setDashboard(result.dashboard);
    } catch (error) { toast.error((error as Error).message); }
  }, []);

  async function saveProfile(next: Record<string, any>) {
    setSaveState("保存中…");
    try {
      const result = await api<{ profile: Record<string, any> }>("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      setProfile(result.profile);
      await refresh();
      setSaveState("已自动保存");
    } catch (error) {
      setSaveState("保存失败");
      toast.error((error as Error).message);
    }
  }

  function updateProfile(key: string, value: any) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    setSaveState("有未保存修改");
    if (profileTimer.current) clearTimeout(profileTimer.current);
    profileTimer.current = setTimeout(() => saveProfile(next), 900);
  }

  async function deleteRecord(kind: Kind, id: string) {
    if (!await confirmation.ask("移入回收站？", "记录将在回收站保留30天，期间可以恢复。")) return;
    try {
      const item = records[kind].find((record) => record.id === id); if (!item) throw new Error("记录不存在或已刷新");
      await api(`/api/records?id=${encodeURIComponent(id)}&version=${item.version}`, { method: "DELETE" });
      toast.success("已移入回收站", {
        duration: 10000,
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ type: "record", id, version: item.version + 1 }] }) });
              await refresh(kind);
              toast.success("记录已恢复");
            } catch (error) { toast.error((error as Error).message); }
          },
        },
      });
      refresh(kind);
    } catch (error) { toast.error((error as Error).message); }
  }

  async function deleteFile(id: string) {
    if (!await confirmation.ask("移入回收站？", "原文件将在私有存储中保留30天，期间可以恢复。")) return;
    try {
      const file = [...resumes, ...audioFiles, ...jobScreenshots].find((entry) => entry.id === id); if (!file) throw new Error("文件不存在或已刷新");
      await api(`/api/files?id=${encodeURIComponent(id)}&version=${file.version}`, { method: "DELETE" });
      setResumes((items) => items.filter((item) => item.id !== id));
      toast.success("简历已移入回收站", {
        duration: 10000,
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ type: "file", id, version: file.version + 1 }] }) });
              const result = await api<{ files: StoredFile[] }>("/api/files?purpose=resume");
              setResumes(result.files);
              toast.success("简历已恢复");
            } catch (error) { toast.error((error as Error).message); }
          },
        },
      });
    } catch (error) { toast.error((error as Error).message); }
  }

  async function moveApplication(item: RecordItem, stage: string) {
    if (item.data.stage === stage) return;
    try {
      await api("/api/applications/stage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, stage, version: item.version }) });
      toast.success(`已移动到「${stage}」`);
      refresh("applications");
    } catch (error) { toast.error((error as Error).message); }
  }

  async function toggleChecklist(item: RecordItem, key: string, done: boolean) {
    try { await api("/api/applications/checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, key, done, version: item.version }) }); await Promise.all([refresh("applications"), refresh("tasks")]); }
    catch (error) { toast.error((error as Error).message); }
  }

  async function uploadFile(file: File, purpose: "resume" | "avatar" | "audio" | "job_screenshot", metadata: Record<string, string> = {}) {
    const params = new URLSearchParams({ purpose, sourceModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "", ...metadata });
    const response = await api<{ file: StoredFile }>(`/api/files?${params}`, { method: "POST", headers: { "content-type": file.type, "content-length": String(file.size), "x-file-name": encodeURIComponent(file.name) }, body: file });
    return response.file;
  }

  async function uploadResume(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeUpload({ file, displayName: file.name.replace(/\.[^.]+$/, ""), note: "", target: "" }); event.target.value = "";
  }

  async function confirmResumeUpload() {
    if (!resumeUpload || !resumeUpload.displayName.trim()) return;
    const { file, displayName, note, target } = resumeUpload;
    const toastId = toast.loading("正在上传简历…");
    try {
      const saved = await uploadFile(file, "resume", { displayName, note, target, libraryType: "completed" });
      setResumes((items) => [saved, ...items]);
      setResumeUpload(null);
      toast.success("简历版本已保存", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function saveJob(data: Record<string, any>, screenshot?: File) {
    const toastId = toast.loading("正在保存岗位…");
    try {
      let screenshotFileId = data.screenshotFileId || "";
      if (screenshot) {
        const saved = await uploadFile(screenshot, "job_screenshot", { displayName: `${data.company || "岗位"} JD 截图` });
        screenshotFileId = saved.id;
        setJobScreenshots((items) => [saved, ...items]);
      }
      await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "saved_jobs", data: { ...data, screenshotFileId, savedAt: new Date().toISOString() } }) });
      await refresh("saved_jobs");
      toast.success("岗位已收藏", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); throw error; }
  }

  async function extractJob(sourceUrl?: string, screenshot?: File) {
    let screenshotFileId = "";
    if (screenshot) { const saved = await uploadFile(screenshot, "job_screenshot", { displayName: "待识别 JD 截图" }); screenshotFileId = saved.id; setJobScreenshots((items) => [saved, ...items]); }
    const result = await api<{ job: AIJob }>("/api/job-captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(screenshotFileId ? { screenshotFileId } : { sourceUrl }) });
    await refreshAIJobs(); return { job: result.job, screenshotFileId };
  }

  async function confirmCapturedJob(jobId: string, data: Record<string, any>, allowDuplicate = false) {
    const result = await api<{ record?: RecordItem; duplicate?: RecordItem; requiresConfirmation?: boolean }>(`/api/job-captures/${jobId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, allowDuplicate }) });
    await refresh("saved_jobs"); return result;
  }

  async function convertSavedJob(item: RecordItem) {
    const toastId = toast.loading("正在建立投递记录…");
    try {
      const response = await api<{ record: RecordItem }>("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "applications", data: { company: item.data.company, role: item.data.role, sourceUrl: item.data.sourceUrl, jd: item.data.jd, location: item.data.location, salary: item.data.salary, deadline: item.data.deadline, recruitmentMode: item.data.recruitmentMode || "自动判断", priority: item.data.priority || "普通", stage: "待投递", notes: item.data.notes || "", savedJobId: item.id, checklist: {} } }) });
      await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, version: item.version, data: { convertedApplicationId: response.record.id, convertedAt: new Date().toISOString() } }) });
      await Promise.all([refresh("saved_jobs"), refresh("applications")]);
      setView("applications");
      toast.success("已转为待投递记录", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function importOldData() {
    if (!migrationItems) return;
    const toastId = toast.loading("正在迁移本机记录…");
    try {
      for (const item of migrationItems.applications) {
        await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "applications", data: { company: item.company, role: item.role, location: item.location, stage: item.stage, deadline: item.deadline, priority: item.priority, match: item.match, notes: "从旧版迁移" } }) });
      }
      for (const item of migrationItems.evidence) {
        await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "evidence", data: { title: item.title, source: item.source, context: item.context, action: item.action, result: item.result, skills: item.skills, status: item.status === "已确认" ? "confirmed" : "draft" } }) });
      }
      localStorage.removeItem("offer-applications");
      localStorage.removeItem("offer-evidence");
      setMigrationItems(null);
      await load();
      toast.success("旧版记录已迁移到云端", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function runAnalysis() {
    setAnalysisBusy(true);
    try {
      const job = await createAndRunAI("job_analysis", { jobTitle: analysisInput.title, jd: analysisInput.jd });
      setAnalysisResult({ ...(job.result || {}), aiJobId: job.id });
      refresh("analyses");
      toast.success("证据矩阵已生成");
    } catch (error) { toast.error((error as Error).message); }
    finally { setAnalysisBusy(false); }
  }

  async function reloadResumes() {
    const result = await api<{ files: StoredFile[] }>("/api/files?purpose=resume");
    setResumes(result.files);
  }

  async function analyzeResume(file: StoredFile, application?: RecordItem) {
    if (!application) { setResumeAnalysis({ file, jd: analysisInput.jd }); return; }
    await runResumeAnalysis(file, application, application.data.jd || "");
  }

  async function runResumeAnalysis(file: StoredFile, application: RecordItem | undefined, jd: string) {
    if (application && String(jd || "").trim().length < 20) return toast.error("该岗位的 JD 过短，请先在投递记录中补充完整 JD");
    const toastId = toast.loading("正在读取并分析简历，完成后会删除供应商临时文件…");
    try {
      const job = await createAndRunAI("resume_suggestions", { fileId: file.id, jd });
      const review = { ...(job.result || {}), aiJobId: job.id, jobId: application?.id || null, jobTitle: application ? `${application.data.company} · ${application.data.role}` : "通用检查" };
      await api("/api/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: file.id, version: file.version, metadata: { review, reviewedAt: new Date().toISOString(), optimizationStatus: application ? "已评审" : file.metadata.optimizationStatus } }) });
      await reloadResumes();
      setAnalysisResult({ ...review, sourceResume: file.metadata.displayName || file.filename });
      if (!application) setView("analysis");
      toast.success(application ? "岗位定向评审已保存到简历优化库" : "简历建议已生成", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function createOptimizationResume(applicationId: string, sourceFileId: string) {
    const toastId = toast.loading("正在创建岗位专用优化副本…");
    try {
      const application = records.applications.find((item) => item.id === applicationId);
      const source = resumes.find((item) => item.id === sourceFileId);
      if (!application || !source) throw new Error("岗位或源简历不存在，请刷新后重试");
      await api("/api/resume-optimizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId, applicationVersion: application.version, sourceFileId, sourceFileVersion: source.version }) });
      await Promise.all([reloadResumes(), refresh("applications")]);
      toast.success("优化副本已创建，并已关联待投递岗位", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function uploadOptimizationRevision(file: File, application: RecordItem, parent: StoredFile) {
    const revision = Math.max(1, ...resumes.filter((item) => item.metadata.applicationId === application.id).map((item) => Number(item.metadata.optimizationRevision || 0))) + 1;
    const toastId = toast.loading("正在保存手动修改稿…");
    try {
      const saved = await uploadFile(file, "resume", {
        displayName: `${file.name.replace(/\.[^.]+$/, "")} · ${application.data.company} ${application.data.role} · 优化稿 ${revision}`,
        target: `${application.data.company} · ${application.data.role}`,
        note: "根据 AI 建议手动修改",
        libraryType: "optimization",
        applicationId: application.id,
        applicationCompany: String(application.data.company || ""),
        applicationRole: String(application.data.role || ""),
        sourceResumeId: String(parent.metadata.sourceResumeId || parent.id),
        parentFileId: parent.id,
        optimizationRevision: String(revision),
        optimizationStatus: "待评审",
      });
      await api("/api/applications/resume-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: application.id, applicationVersion: application.version, fileId: saved.id, fileVersion: saved.version }) });
      await Promise.all([reloadResumes(), refresh("applications")]);
      toast.success("修改稿已保存并设为当前预投递简历", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function linkApplicationResume(applicationId: string, fileId: string | null) {
    try {
      const application = records.applications.find((item) => item.id === applicationId);
      const file = resumes.find((item) => item.id === fileId);
      const previous = resumes.find((item) => item.id === application?.data.resumeId);
      if (!application) throw new Error("投递记录不存在或已刷新");
      await api("/api/applications/resume-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId, applicationVersion: application.version, fileId, fileVersion: file?.version ?? null, previousFileVersion: previous?.version ?? null }) });
      await Promise.all([reloadResumes(), refresh("applications")]);
      toast.success(fileId ? "简历关联已更新" : "已取消简历关联");
    } catch (error) { toast.error((error as Error).message); }
  }

  async function finalizeApplicationResume(applicationId: string, fileId: string, appliedAt: string) {
    const toastId = toast.loading("正在确认最终投递版本…");
    try {
      const application = records.applications.find((item) => item.id === applicationId);
      if (!application) throw new Error("投递记录不存在或已刷新");
      const affectedFiles = resumes.filter((item) => item.id === fileId || item.metadata.applicationId === applicationId);
      const fileVersions = Object.fromEntries(affectedFiles.map((item) => [item.id, item.version]));
      await api("/api/applications/finalize-resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId, applicationVersion: application.version, fileId, fileVersions, appliedAt: new Date(appliedAt).toISOString() }) });
      await Promise.all([reloadResumes(), refresh("applications"), refresh("tasks")]);
      toast.success("已完成投递：岗位状态、投递时间和简历关联已同步", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function runResearch() {
    if (!researchDraft.company.trim()) return;
    setResearchBusy(true);
    try {
      await createAndRunAI("company_research", researchDraft);
      await refresh("research");
      toast.success("背调报告已生成并保存");
    } catch (error) { toast.error((error as Error).message); }
    finally { setResearchBusy(false); }
  }

  async function updateResearchFindings(report: RecordItem, personalFindings: string) {
    try {
      await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: report.id, version: report.version, data: { personalFindings } }) });
      await refresh("research");
      toast.success("个人发现已保存");
    } catch (error) { toast.error((error as Error).message); }
  }

  async function createAIAction(task: Record<string, any>) {
    try { await api("/api/tasks/from-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(task) }); await refresh("tasks"); toast.success("已加入行动清单"); }
    catch (error) { toast.error((error as Error).message); }
  }

  const activeInterview = records.interviews.find((item) => item.id === selectedInterview) || records.interviews[0];

  async function updateInterview(data: Record<string, any>) {
    if (!activeInterview) return;
    try {
      await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: activeInterview.id, version: activeInterview.version, data }) });
      await refresh("interviews");
      toast.success("面试记录已保存");
    } catch (error) { toast.error((error as Error).message); }
  }

  async function syncInterviewState(data: Record<string, any>) {
    if (!activeInterview) return;
    await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: activeInterview.id, version: activeInterview.version, data }) });
    await refresh("interviews");
  }

  async function getAudioDuration(file: File) {
    return await new Promise<number>((resolve) => { const audio = document.createElement("audio"); const url = URL.createObjectURL(file); audio.preload = "metadata"; audio.onloadedmetadata = () => { const duration = Number.isFinite(audio.duration) ? audio.duration : 0; URL.revokeObjectURL(url); resolve(duration); }; audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); }; audio.src = url; });
  }

  async function uploadInterviewAudio(file: File, segment?: { sequence: number; duration: number }) {
    if (!activeInterview) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("单个音频文件不能超过 10 MB，请先分割后上传");
    const duration = segment?.duration || await getAudioDuration(file);
    if (!segment && duration > 300) return toast.error("单个上传音频不能超过 5 分钟，请先分割后上传");
    const toastId = toast.loading("正在保存录音…");
    try {
      const sequence = segment?.sequence ?? 0;
      const saved = await uploadFile(file, "audio", { displayName: `${activeInterview.data.company || "面试"}录音${sequence ? ` · 第${sequence}段` : ""}`, interviewId: activeInterview.id, sequence: String(sequence), duration: String(Math.round(duration)) });
      setAudioFiles((items) => [saved, ...items]);
      if (segment) {
        recordedSegments.current = [...recordedSegments.current.filter((item) => item.sequence !== sequence), { fileId: saved.id, sequence, duration: Math.round(duration), size: file.size, status: "saved", text: "" }].sort((a, b) => a.sequence - b.sequence);
        await syncInterviewState({ audioSegments: recordedSegments.current, audioFileId: saved.id });
      } else await syncInterviewState({ audioSegments: [{ fileId: saved.id, sequence: 1, duration: Math.round(duration), size: file.size, status: "saved", text: "" }], audioFileId: saved.id });
      toast.success("录音已保存", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function startRecording() {
    if (!activeInterview) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; recordingWanted.current = true; segmentIndex.current = 0; recordedSegments.current = activeInterview.data.audioSegments || [];
      const beginSegment = () => {
        segmentIndex.current += 1; segmentStartedAt.current = Date.now(); chunks.current = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined, audioBitsPerSecond: 64000 });
        mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
        mediaRecorder.onstop = async () => {
          const duration = (Date.now() - segmentStartedAt.current) / 1000;
          const blob = new Blob(chunks.current, { type: "audio/webm" });
          if (blob.size) await uploadInterviewAudio(new File([blob], `interview-${activeInterview.id}-${segmentIndex.current}.webm`, { type: "audio/webm" }), { sequence: segmentIndex.current, duration });
          if (recordingWanted.current) beginSegment(); else { stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
        };
        mediaRecorder.start(1000); recorder.current = mediaRecorder;
        recordingTimer.current = setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 4 * 60 * 1000);
      };
      beginSegment();
      setRecording(true);
    } catch { toast.error("无法使用麦克风，请检查浏览器权限"); }
  }

  function stopRecording() {
    recordingWanted.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    setRecording(false);
  }

  async function transcribeInterview() {
    if (!activeInterview?.data.audioFileId && !activeInterview?.data.audioSegments?.length) return toast.error("请先录音或上传音频");
    const toastId = toast.loading("正在转写录音…");
    try {
      const segments = (activeInterview.data.audioSegments?.length ? activeInterview.data.audioSegments : [{ fileId: activeInterview.data.audioFileId, sequence: 1, text: "" }]).sort((a: any, b: any) => a.sequence - b.sequence);
      for (const segment of segments) {
        if (segment.status === "succeeded" && segment.text) continue;
        try { const job = await createAndRunAI("transcription", { fileId: segment.fileId, segmentIndex: segment.sequence, interviewId: activeInterview.id }); segment.text = job.result?.text || ""; segment.status = "succeeded"; segment.jobId = job.id; }
        catch (error) { segment.status = "failed"; segment.error = (error as Error).message; }
        await syncInterviewState({ audioSegments: segments });
      }
      const transcript = segments.filter((item: any) => item.status === "succeeded").map((item: any) => item.text).join("\n");
      await syncInterviewState({ transcript, audioSegments: segments });
      if (segments.some((item: any) => item.status === "failed")) throw new Error("部分录音分段转写失败，可再次点击仅重试失败分段");
      toast.success("录音已转写", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function reviewInterview(transcriptOverride?: string) {
    if (!activeInterview) return;
    const toastId = toast.loading("正在生成面试复盘…");
    try {
      const transcript = transcriptOverride ?? activeInterview.data.transcript ?? "";
      const job = await createAndRunAI("interview_review", { role: activeInterview.data.role, jd: activeInterview.data.jd, transcript, interviewId: activeInterview.id });
      await syncInterviewState({ transcript, review: { ...(job.result || {}), aiJobId: job.id } });
      toast.success("复盘报告已生成", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function saveForeignPrep(data: Record<string, any>) {
    const result = await api<{ profile: Record<string, any> }>("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: profile.version, foreignPrep: data }) });
    setProfile(result.profile);
    return result.profile;
  }

  async function reviewForeignAnswer(question: string, answer: string, role: string, jd: string) {
    return createAndRunAI("foreign_interview_review", { question, answer, role, jd });
  }

  function exportIcs() {
    const sourceEvents = [
      ...records.reminders.map((item) => ({ id: item.id, data: item.data })),
      ...records.applications.filter((item) => item.data.deadline).map((item) => ({ id: `application-${item.id}`, data: { dueAt: item.data.deadline, title: `${item.data.company} · ${item.data.role}`, notes: "投递截止" } })),
      ...records.interviews.filter((item) => item.data.scheduledAt).map((item) => ({ id: `interview-${item.id}`, data: { dueAt: item.data.scheduledAt, title: `${item.data.company} · ${item.data.round || "面试"}`, notes: "面试" } })),
      ...records.offers.filter((item) => item.data.deadline).map((item) => ({ id: `offer-${item.id}`, data: { dueAt: item.data.deadline, title: `${item.data.company} · OFFER 截止`, notes: "OFFER 截止" } })),
      ...records.tasks.filter((item) => item.data.dueAt && !["done", "dismissed"].includes(item.data.status)).map((item) => ({ id: `task-${item.id}`, data: { dueAt: item.data.dueAt, title: item.data.title, notes: item.data.notes || "行动任务" } })),
    ];
    const events = sourceEvents.map((item) => {
      const date = new Date(item.data.dueAt || (item.data as Record<string, any>).date);
      if (!Number.isFinite(date.getTime())) return "";
      const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const end = new Date(date.getTime() + Number(item.data.durationMinutes || 60) * 60_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      return `BEGIN:VEVENT\r\nUID:${item.id}@offer-harvester\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\r\nDTSTART:${stamp}\r\nDTEND:${end}\r\nSUMMARY:${String(item.data.title || "求职提醒").replace(/[,;]/g, " ")}\r\nDESCRIPTION:${String(item.data.notes || "").replace(/\n/g, "\\n")}\r\nEND:VEVENT`;
    }).filter(Boolean).join("\r\n");
    const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OFFER Harvester//CN\r\n${events}\r\nEND:VCALENDAR`], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "offer-harvester-calendar.ics"; link.click(); URL.revokeObjectURL(link.href);
  }

  if (loading) return <div className="boot-screen"><div className="brand-mark">O</div><p>正在安全加载你的求职工作台…</p></div>;

  return (
    <div className="app-shell">
      <Toaster position="top-center" richColors />
      <header className="topbar">
        <button className="mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu /></button>
        <button className="brand" onClick={() => setView("dashboard")}><span className="brand-mark">O</span><b>OFFER 收割机</b></button>
        <div className="topbar-status"><span className="privacy-dot" /> 私人云端工作台</div>
        <button className="user-chip" onClick={() => setView("profile")}><span>{(profile.name || user.displayName || "我").slice(0, 1)}</span><div><b>{profile.name || "完善个人资料"}</b><small>{saveState}</small></div></button>
      </header>

      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-head"><span>求职全流程</span><button onClick={() => setMobileNav(false)} aria-label="关闭导航"><X /></button></div>
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { if (id === "resumes") setResumeViewRequest({ tab: "completed" }); setView(id); setMobileNav(false); }}><Icon /><span>{label}</span>{id === "applications" && dashboard.totalApplications > 0 ? <em>{dashboard.totalApplications}</em> : null}</button>)}</nav>
        <div className="sidebar-foot"><b>数据归你所有</b><p>文件私有保存，AI 仅在你主动分析时读取。</p></div>
      </aside>
      {mobileNav && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}

      <main className="workspace">
        {migrationItems && <div className="migration-banner"><div><b>发现旧版保存在本机的记录</b><p>{migrationItems.applications.length} 条投递、{migrationItems.evidence.length} 条事实可迁移到云端。</p></div><div><Button variant="outline" onClick={() => setMigrationItems(null)}>忽略</Button><Button onClick={importOldData}>迁移记录</Button></div></div>}
        {activeAIJobId && view !== "aiCenter" && aiJobs.find((item) => item.id === activeAIJobId) && <button className="ai-task-strip" onClick={() => setView("aiCenter")}><ListChecks /><span><b>最近 AI 任务</b>{aiJobs.find((item) => item.id === activeAIJobId)?.status === "succeeded" ? "已完成，可查看完整追溯记录" : aiJobs.find((item) => item.id === activeAIJobId)?.status === "failed" ? "执行失败，输入已保留，可重试" : "正在处理或等待执行"}</span><ExternalLink /></button>}
        {view === "dashboard" && <DashboardView dashboard={dashboard} profile={profile} records={records} onNavigate={setView} onAdd={() => setEditor({ kind: "applications" })} />}
        {view === "today" && <TodayView dashboard={dashboard} records={records} onNavigate={setView} />}
        {view === "profile" && <ProfileView profile={profile} saveState={saveState} onChange={updateProfile} onSave={() => saveProfile(profile)} onAvatar={async (file) => { const saved = await uploadFile(file, "avatar"); updateProfile("avatarFileId", saved.id); }} />}
        {view === "resumes" && <ResumeView resumes={resumes} applications={records.applications} initialTab={resumeViewRequest.tab} initialApplicationId={resumeViewRequest.applicationId} onUpload={uploadResume} onPreview={setPreview} onDelete={deleteFile} onAnalyze={analyzeResume} onCreateOptimization={createOptimizationResume} onUploadRevision={uploadOptimizationRevision} onLink={linkApplicationResume} onFinalize={finalizeApplicationResume} />}
        {view === "savedJobs" && <SavedJobsView items={records.saved_jobs} screenshots={jobScreenshots} settings={dashboard.settings} serverNow={dashboard.serverNow} onSave={saveJob} onExtract={extractJob} onConfirm={confirmCapturedJob} onConvert={convertSavedJob} onDelete={(id) => deleteRecord("saved_jobs", id)} />}
        {view === "applications" && <ApplicationsView items={records.applications} resumes={resumes} settings={dashboard.settings} serverNow={dashboard.serverNow} onAdd={() => setEditor({ kind: "applications" })} onEdit={(item) => setEditor({ kind: "applications", item })} onDelete={(id) => deleteRecord("applications", id)} onMove={moveApplication} onChecklist={toggleChecklist} onUnlink={(item) => linkApplicationResume(item.id, null)} onOptimize={(item) => { setResumeViewRequest({ tab: "optimization", applicationId: item.id }); setView("resumes"); }} />}
        {view === "tasks" && <TasksView items={records.tasks} applications={records.applications} onChanged={() => refresh("tasks")} />}
        {view === "evidence" && <EvidenceView items={records.evidence} onAdd={() => setEditor({ kind: "evidence" })} onEdit={(item) => setEditor({ kind: "evidence", item })} onDelete={(id) => deleteRecord("evidence", id)} />}
        {view === "analysis" && <AnalysisView input={analysisInput} setInput={setAnalysisInput} busy={analysisBusy} result={analysisResult || records.analyses[0]?.data || null} onRun={runAnalysis} onEvidence={() => setView("evidence")} onCreateTask={createAIAction} />}
        {view === "aiCenter" && <AICenterView jobs={aiJobs} legacy={legacyAI} activeId={activeAIJobId} attempts={aiAttempts} evaluation={evaluation} onSelect={openAIJob} onRetry={retryAIJob} onCancel={cancelAIJob} onRefresh={refreshAIJobs} onRunEvaluation={runEvaluation} onNavigate={setView} />}
        {view === "company" && <ResearchView draft={researchDraft} setDraft={setResearchDraft} busy={researchBusy} reports={records.research} onRun={runResearch} onSaveFindings={updateResearchFindings} onDelete={(id) => deleteRecord("research", id)} />}
        {view === "interviews" && <InterviewView items={records.interviews} active={activeInterview} audioFiles={audioFiles} recording={recording} onSelect={setSelectedInterview} onAdd={() => setEditor({ kind: "interviews" })} onEdit={(item) => setEditor({ kind: "interviews", item })} onDelete={(id) => deleteRecord("interviews", id)} onSave={updateInterview} onRecord={recording ? stopRecording : startRecording} onAudio={uploadInterviewAudio} onTranscribe={transcribeInterview} onReview={reviewInterview} onCreateTask={createAIAction} />}
        {view === "foreignPrep" && <ForeignPrepView saved={profile.foreignPrep || {}} onSave={saveForeignPrep} onReview={reviewForeignAnswer} onOpenAI={() => setView("aiCenter")} />}
        {view === "offers" && <OffersView items={records.offers} weights={weights} setWeights={setWeights} onAdd={() => setEditor({ kind: "offers" })} onEdit={(item) => setEditor({ kind: "offers", item })} onDelete={(id) => deleteRecord("offers", id)} />}
        {view === "calendar" && <CalendarView items={records.reminders} applications={records.applications} interviews={records.interviews} offers={records.offers} tasks={records.tasks} onAdd={() => setEditor({ kind: "reminders" })} onEdit={(item) => setEditor({ kind: "reminders", item })} onDelete={(id) => deleteRecord("reminders", id)} onExport={exportIcs} />}
        {view === "knowledge" && <KnowledgeView onNavigate={setView} />}
        {view === "feishu" && <FeishuView resumes={resumes} records={records} onDataChanged={load} />}
        {view === "resources" && <JobResourcesView />}
        {view === "trash" && <TrashView onChanged={load} />}
      </main>

      <RecordEditor editor={editor} resumes={resumes} onClose={() => setEditor(null)} onSaved={async (kind) => { setEditor(null); await refresh(kind); toast.success("记录已保存"); }} />
      <FilePreview file={preview} onClose={() => setPreview(null)} />
      {resumeUpload && <Dialog open onOpenChange={(open) => !open && setResumeUpload(null)}><DialogContent><DialogHeader><DialogTitle>保存简历版本</DialogTitle><DialogDescription>原文件会作为私有副本保存，版本信息以后可以继续修改。</DialogDescription></DialogHeader><div className="form-stack"><Field label="版本名称"><Input value={resumeUpload.displayName} onChange={(event) => setResumeUpload({ ...resumeUpload, displayName: event.target.value })} autoFocus /></Field><Field label="目标岗位方向"><Input value={resumeUpload.target} placeholder="Java 后端开发" onChange={(event) => setResumeUpload({ ...resumeUpload, target: event.target.value })} /></Field><Field label="备注"><Textarea value={resumeUpload.note} onChange={(event) => setResumeUpload({ ...resumeUpload, note: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setResumeUpload(null)}>取消</Button><Button disabled={!resumeUpload.displayName.trim()} onClick={confirmResumeUpload}><Upload />上传并保存</Button></DialogFooter></DialogContent></Dialog>}
      {resumeAnalysis && <Dialog open onOpenChange={(open) => !open && setResumeAnalysis(null)}><DialogContent><DialogHeader><DialogTitle>通用简历检查</DialogTitle><DialogDescription>可选填目标岗位JD；留空时只检查事实完整性、表达和可解析性。</DialogDescription></DialogHeader><Field label="目标岗位 JD（可选）"><Textarea rows={10} value={resumeAnalysis.jd} onChange={(event) => setResumeAnalysis({ ...resumeAnalysis, jd: event.target.value })} /></Field><DialogFooter><Button variant="outline" onClick={() => setResumeAnalysis(null)}>取消</Button><Button onClick={async () => { const current = resumeAnalysis; setResumeAnalysis(null); await runResumeAnalysis(current.file, undefined, current.jd); }}><Sparkles />开始检查</Button></DialogFooter></DialogContent></Dialog>}
      {confirmation.dialog}
    </div>
  );
}

function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardView({ dashboard, profile, records, onNavigate, onAdd }: { dashboard: Dashboard; profile: Record<string, any>; records: Record<Kind, RecordItem[]>; onNavigate: (view: View) => void; onAdd: () => void }) {
  const applications = records.applications;
  const saved = dashboard.savedCount || records.saved_jobs.length;
  const discovered = saved + applications.filter((item) => !item.data.savedJobId).length;
  const reached = (stage: string) => applications.filter((item) => stageOrder.indexOf(item.data.stage || "待投递") >= stageOrder.indexOf(stage) && item.data.stage !== "已结束").length;
  const funnel = [
    { label: "收藏岗位", count: dashboard.funnel.saved ?? discovered },
    { label: "已投简历", count: dashboard.funnel.applied ?? reached("已投递") },
    { label: "笔试阶段", count: dashboard.funnel.written ?? reached("笔试中") },
    { label: "面试阶段", count: dashboard.funnel.interview ?? reached("面试中") },
    { label: "拿到 OFFER", count: dashboard.funnel.offer ?? reached("OFFER") },
  ];
  const phaseCountdowns = dashboard.phaseCountdowns || [];
  const hasData = discovered > 0;
  const metrics = [
    ["收藏岗位", saved, "待判断是否值得投递", "savedJobs" as View],
    ["已投简历", reached("已投递"), "进入正式流程", "applications" as View],
    ["笔试阶段", reached("笔试中"), "当前或已通过笔试", "applications" as View],
    ["面试阶段", reached("面试中"), `邀约率 ${dashboard.invitationRate}%`, "interviews" as View],
    ["拿到 OFFER", dashboard.offerCount, "等待比较与决策", "offers" as View],
    ["公司背调", records.research.length, "带来源的已保存报告", "company" as View],
  ] as const;
  return <>
    <PageHead eyebrow="真实数据总览" title={`${profile.name ? `${profile.name}，` : ""}今天推进哪一个机会？`} description="收藏、投递、笔试、面试与 OFFER 均由你的真实记录计算。" action={<div className="head-actions"><Button variant="outline" onClick={() => onNavigate("savedJobs")}><Bookmark />收藏岗位</Button><Button onClick={onAdd}><Plus />新增投递</Button></div>} />
    <section className="metric-grid metric-grid-six">{metrics.map(([label, value, text, target]) => <button key={label} onClick={() => onNavigate(target)}><span>{label}</span><strong>{value}</strong><small>{text}</small></button>)}</section>
    {!hasData && <section className="onboarding panel"><div><span>从第一条真实机会开始</span><h2>先收藏，再决定是否投递</h2><p>保存岗位链接、JD 截图和关键信息，确认匹配后再转成投递记录。</p></div><ol><li><button onClick={() => onNavigate("profile")}><b>01</b><span>完善个人资料<small>用于分析与面试上下文</small></span></button></li><li><button onClick={() => onNavigate("resumes")}><b>02</b><span>上传简历版本<small>保存原文件与投递关联</small></span></button></li><li><button onClick={() => onNavigate("savedJobs")}><b>03</b><span>收藏第一个岗位<small>保存链接、JD 与截止时间</small></span></button></li></ol></section>}
    <div className="dashboard-grid dashboard-grid-main">
      <section className="panel funnel-panel"><div className="panel-title"><div><h2>岗位转化漏斗</h2><p>从发现机会到 OFFER 的真实转化</p></div><button onClick={() => onNavigate("applications")}>查看明细</button></div><div className="funnel">{funnel.map((item, index) => { const previous = index ? funnel[index - 1].count : item.count; const rate = index && previous ? Math.min(100, Math.round(item.count / previous * 100)) : null; const width = Math.max(34, 100 - index * 12); return <div key={item.label}><small>{rate == null ? "起点" : `${rate}%`}</small><button style={{ width: `${width}%` }} onClick={() => onNavigate(index === 0 ? "savedJobs" : "applications")}><span>{item.label}</span><strong>{item.count}</strong></button>{index < funnel.length - 1 && <ArrowDown />}</div>; })}</div></section>
      <div className="dashboard-side">
        {dashboard.settings.phaseCountdownConfirmed !== false ? <section className="panel autumn-countdown"><div className="autumn-countdown-head"><div><span>秋招阶段提醒</span><small>按服务端北京时间计算 · 日期可自定义</small></div><button onClick={() => onNavigate("profile")}>调整日期</button></div><div className="phase-countdown-list">{phaseCountdowns.map((phase, index) => <article className={`phase-countdown phase-${phase.key}`} key={phase.key}><span className="phase-index">{index + 1}</span><div><b>{phase.label}</b><p>{phase.hint}</p><small>{phase.date ? formatDate(phase.date) : "日期未设置"}</small></div><strong>{phase.status === "ended" ? "该阶段已结束" : phase.status === "today" ? "今天结束" : phase.status === "unset" ? "待设置" : <><em>{phase.daysRemaining}</em> 天</>}</strong></article>)}</div></section> : <section className="panel setup-countdown"><Timer /><div><b>秋招阶段提醒暂未显示</b><p>可在个人资料中确认三个冲刺节点并随时修改。</p></div><Button variant="outline" onClick={() => onNavigate("profile")}>设置节点</Button></section>}
        <section className="panel"><div className="panel-title"><div><h2>七日内日程</h2><p>关键节点别错过</p></div><button onClick={() => onNavigate("calendar")}>查看全部</button></div><div className="agenda-list">{dashboard.upcoming.length ? dashboard.upcoming.map((item, index) => <article key={index}><time>{formatDate(item.data.dueAt, true)}</time><div><b>{item.data.title}</b><p>{item.data.type || "提醒"}</p></div></article>) : <p className="muted">未来七天没有安排</p>}</div></section>
        <section className="panel risk-panel"><div className="panel-title"><div><h2>需要处理</h2><p>截止风险与停滞机会</p></div><button onClick={() => onNavigate("tasks")}>行动清单</button></div>{dashboard.risks.length ? dashboard.risks.slice(0, 5).map((entry, index) => <article key={index}><AlertTriangle /><span><b>{entry.item.data.company || entry.item.data.title || "求职事项"}</b><small>{entry.risk.reason}</small></span></article>) : <p className="muted">当前没有风险提醒</p>}</section>
      </div>
    </div>
    <section className="panel segment-panel"><div className="panel-title"><div><h2>转化效果对比</h2><p>按渠道、简历版本和岗位方向查看历史到达情况；样本不足 {dashboard.settings.minimumSample || 5} 条时只展示数量。</p></div></div><div className="segment-grid">{Object.entries({ channel: "投递渠道", resume: "简历版本", direction: "岗位方向" }).map(([key, title]) => <div key={key}><h3>{title}</h3>{(dashboard.segments?.[key] || []).length ? (dashboard.segments[key] as any[]).map((item) => <article key={item.label}><div><b>{item.label}</b><small>{item.count} 条记录</small></div>{item.ratesVisible ? <span>面试 {Math.round(item.interviewCount / item.count * 100)}% · OFFER {Math.round(item.offerCount / item.count * 100)}%</span> : <span>面试 {item.interviewCount} · OFFER {item.offerCount}</span>}</article>) : <p className="muted">暂无可比较记录</p>}</div>)}</div></section>
    <div className="dashboard-grid dashboard-followups"><section className="panel"><div className="panel-title"><div><h2>本周行动</h2><p>待办与进行中的下一步</p></div><button onClick={() => onNavigate("tasks")}>查看全部</button></div><div className="agenda-list">{dashboard.openTasks.length ? dashboard.openTasks.slice(0, 6).map((task, index) => <article key={task.id || index}><time>{task.dueAt ? formatDate(task.dueAt) : "待安排"}</time><div><b>{task.title}</b><p>{task.type || "自定义"} · {task.status === "doing" ? "进行中" : "待办"}</p></div></article>) : <p className="muted">当前没有待办行动</p>}</div></section><section className="panel"><div className="panel-title"><div><h2>待补事实</h2><p>未经确认的经历不会被 AI 当作正式证据</p></div><button onClick={() => onNavigate("evidence")}>前往核对</button></div><div className="pending-evidence"><strong>{dashboard.pendingEvidence}</strong><span>条事实等待确认或补充</span></div></section></div>
  </>;
}

function TodayView({ dashboard, records, onNavigate }: { dashboard: Dashboard; records: Record<Kind, RecordItem[]>; onNavigate: (view: View) => void }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayInterviews = records.interviews.filter((item) => String(item.data.scheduledAt || "").startsWith(today));
  const dueTasks = records.tasks.filter((item) => !["done", "dismissed"].includes(item.data.status) && String(item.data.dueAt || "").slice(0, 10) <= today).slice(0, 12);
  return <><PageHead eyebrow="每日执行工作台" title="今天只处理最重要的下一步" description="到期任务、面试、截止风险和停滞机会集中在一个页面。" action={<Button onClick={() => onNavigate("tasks")}><ListChecks />行动清单</Button>} />
    <div className="today-grid"><section className="panel"><div className="panel-title"><div><h2>今日到期</h2><p>逾期任务同样会保留在这里</p></div></div><div className="agenda-list">{dueTasks.length ? dueTasks.map((item) => <article key={item.id}><time>{item.data.dueAt ? formatDate(item.data.dueAt, true) : "待安排"}</time><div><b>{item.data.title}</b><p>{item.data.notes || "待执行"}</p></div></article>) : <p className="muted">今天没有到期任务</p>}</div></section>
      <section className="panel"><div className="panel-title"><div><h2>今日面试</h2><p>面试前确认JD、简历和准备重点</p></div><button onClick={() => onNavigate("interviews")}>面试复盘</button></div><div className="agenda-list">{todayInterviews.length ? todayInterviews.map((item) => <article key={item.id}><time>{formatDate(item.data.scheduledAt, true)}</time><div><b>{item.data.company} · {item.data.role}</b><p>{item.data.round || "面试"}</p></div></article>) : <p className="muted">今天没有面试安排</p>}</div></section>
      <section className="panel risk-panel"><div className="panel-title"><div><h2>优先风险</h2><p>截止临近或长时间没有推进</p></div><button onClick={() => onNavigate("applications")}>查看投递</button></div>{dashboard.risks.length ? dashboard.risks.slice(0, 10).map((entry, index) => <article key={index}><AlertTriangle /><span><b>{entry.item.data.company || entry.item.data.title || "求职事项"}</b><small>{entry.risk.reason}</small></span></article>) : <p className="muted">当前没有风险提醒</p>}</section>
      <section className="panel"><div className="panel-title"><div><h2>未来七天</h2><p>所有带日期的求职事项</p></div><button onClick={() => onNavigate("calendar")}>打开日历</button></div><div className="agenda-list">{dashboard.upcoming.length ? dashboard.upcoming.map((item, index) => <article key={index}><time>{formatDate(item.data.dueAt, true)}</time><div><b>{item.data.title}</b><p>{item.data.type || "提醒"}</p></div></article>) : <p className="muted">未来七天暂无安排</p>}</div></section></div></>;
}

type TrashItem = { type: "record" | "file"; id: string; title: string; kind?: string; purpose?: string; filename?: string; version: number; deletedAt: string; expiresAt: string; daysRemaining: number };
function TrashView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<TrashItem[]>([]); const [selected, setSelected] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const confirmation = useConfirmDialog();
  const loadTrash = useCallback(async () => { const result = await api<{ items: TrashItem[] }>("/api/trash"); setItems(result.items); setSelected(new Set()); }, []);
  useEffect(() => { loadTrash().catch((error) => toast.error((error as Error).message)); }, [loadTrash]);
  const targets = () => items.filter((item) => selected.has(`${item.type}:${item.id}`)).map(({ type, id, version }) => ({ type, id, version }));
  async function act(action: "restore" | "delete") { const chosen = targets(); if (!chosen.length) return toast.error("请先选择项目"); if (action === "delete" && !await confirmation.ask("永久删除所选项目？", `将永久删除 ${chosen.length} 个项目，附件原文件也会被清除，此操作无法撤销。`, true)) return; setBusy(true); try { await api("/api/trash", { method: action === "restore" ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: chosen }) }); await Promise.all([loadTrash(), onChanged()]); toast.success(action === "restore" ? "已恢复所选项目" : "已永久删除所选项目"); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function purge() { setBusy(true); try { const result = await api<{ filesPurged: number; recordsPurged: number; failed: any[] }>("/api/trash/purge", { method: "POST" }); await loadTrash(); toast.success(`已清理 ${result.recordsPurged + result.filesPurged} 个过期项目`); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <><PageHead eyebrow="30天误删保护" title="回收站" description="记录和附件分别保存30天；永久删除附件时会同步删除私有文件。" action={<Button variant="outline" onClick={purge} disabled={busy}><RefreshCw />清理到期项目</Button>} />
    <section className="panel trash-panel"><div className="trash-toolbar"><label><input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => `${item.type}:${item.id}`)) : new Set())} />全选</label><span>已选择 {selected.size} 项</span><Button variant="outline" disabled={busy || !selected.size} onClick={() => act("restore")}>恢复</Button><Button variant="destructive" disabled={busy || !selected.size} onClick={() => act("delete")}><Trash2 />永久删除</Button></div>{items.length ? <div className="trash-list">{items.map((item) => { const key = `${item.type}:${item.id}`; return <label key={key}><input type="checkbox" checked={selected.has(key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /><span><b>{item.title || item.filename || "未命名项目"}</b><small>{item.type === "file" ? `附件 · ${item.purpose}` : `记录 · ${item.kind}`} · 删除于 {formatDate(item.deletedAt, true)}</small></span><strong>{item.daysRemaining} 天后清理</strong></label>; })}</div> : <EmptyState icon={Trash2} title="回收站为空" text="删除的记录与附件会在这里保留30天。" />}</section>{confirmation.dialog}</>;
}

function ProfileView({ profile, saveState, onChange, onSave, onAvatar }: { profile: Record<string, any>; saveState: string; onChange: (key: string, value: any) => void; onSave: () => void; onAvatar: (file: File) => void }) {
  const settings = { ...defaultJobSearchSettings, ...(profile.jobSearchSettings || {}) };
  const updateSetting = (key: string, value: any) => onChange("jobSearchSettings", { ...settings, [key]: value });
  return <><PageHead eyebrow="个人中心" title="你的求职底稿" description="所有字段都可以修改，更新会自动保存并用于后续分析。" action={<div className="save-state"><CheckCircle2 />{saveState}<Button variant="outline" onClick={onSave}><Save />立即保存</Button></div>} />
    <div className="profile-layout"><section className="panel profile-card"><div className="profile-avatar">{profile.avatarFileId ? <Image unoptimized width={120} height={120} src={`/api/files/content?id=${profile.avatarFileId}`} alt="个人头像" /> : <span>{(profile.name || "我").slice(0, 1)}</span>}<label><Upload />更换头像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && onAvatar(event.target.files[0])} /></label></div><h2>{profile.name || "尚未填写姓名"}</h2><p>{profile.targetRoles || "填写目标岗位后，AI 会更懂你的方向"}</p><StatusPill tone={profile.jobStatus ? "green" : "orange"}>{profile.jobStatus || "资料待完善"}</StatusPill></section>
      <section className="panel form-panel"><h2>基本信息</h2><div className="form-grid"><Field label="姓名"><Input value={profile.name || ""} onChange={(e) => onChange("name", e.target.value)} /></Field><Field label="手机"><Input value={profile.phone || ""} onChange={(e) => onChange("phone", e.target.value)} /></Field><Field label="邮箱"><Input type="email" value={profile.email || ""} onChange={(e) => onChange("email", e.target.value)} /></Field><Field label="当前城市"><Input value={profile.city || ""} onChange={(e) => onChange("city", e.target.value)} /></Field><Field label="求职状态"><select value={profile.jobStatus || ""} onChange={(e) => onChange("jobStatus", e.target.value)}><option value="">请选择</option><option>准备中</option><option>积极投递</option><option>面试中</option><option>已有 OFFER</option><option>暂缓求职</option></select></Field><Field label="到岗时间"><Input type="date" value={profile.availableDate || ""} onChange={(e) => onChange("availableDate", e.target.value)} /></Field></div><h2>目标与偏好</h2><div className="form-grid"><Field label="目标岗位"><Input value={profile.targetRoles || ""} placeholder="Java 后端开发、服务端研发" onChange={(e) => onChange("targetRoles", e.target.value)} /></Field><Field label="目标行业"><Input value={profile.targetIndustries || ""} placeholder="互联网、金融科技、工业软件" onChange={(e) => onChange("targetIndustries", e.target.value)} /></Field><Field label="目标城市"><Input value={profile.targetCities || ""} placeholder="杭州、上海、苏州" onChange={(e) => onChange("targetCities", e.target.value)} /></Field><Field label="期望薪资"><Input value={profile.expectedSalary || ""} placeholder="例如 20K–25K × 14" onChange={(e) => onChange("expectedSalary", e.target.value)} /></Field></div><h2>秋招阶段提醒</h2><div className="form-grid"><Field label="正式批黄金投递窗口结束"><Input type="date" value={settings.goldenWindowEnd} onChange={(e) => updateSetting("goldenWindowEnd", e.target.value)} /></Field><Field label="Offer 集中决策窗口结束"><Input type="date" value={settings.offerDecisionEnd} onChange={(e) => updateSetting("offerDecisionEnd", e.target.value)} /></Field><Field label="秋招补录收尾"><Input type="date" value={settings.autumnWrapUpEnd} onChange={(e) => updateSetting("autumnWrapUpEnd", e.target.value)} /></Field><Field label="仪表盘显示"><select value={settings.phaseCountdownConfirmed ? "confirmed" : "hidden"} onChange={(e) => updateSetting("phaseCountdownConfirmed", e.target.value === "confirmed")}><option value="confirmed">显示三阶段提醒</option><option value="hidden">暂不显示</option></select></Field><Field label="岗位橙色预警天数"><Input type="number" min={1} max={30} value={settings.jobDeadlineWarningDays} onChange={(e) => updateSetting("jobDeadlineWarningDays", Number(e.target.value))} /></Field><Field label="岗位红色告警天数"><Input type="number" min={1} max={14} value={settings.jobDeadlineCriticalDays} onChange={(e) => updateSetting("jobDeadlineCriticalDays", Number(e.target.value))} /></Field></div><div className="autumn-help"><b>使用建议</b><ol><li>互联网岗位优先投递，不要把页面标注的最晚截止日当作安全投递时间。</li><li>国企、银行等固定截止岗位务必按官方公告倒计时，超时通常无法补交。</li><li>尽量在 10 月 15 日前完成绝大多数目标岗位投递，10 月中下旬重点处理笔试和面试。</li></ol></div><h2>风险规则</h2><div className="form-grid"><Field label="其他截止风险提前天数"><Input type="number" min={1} max={30} value={settings.deadlineRiskDays} onChange={(e) => updateSetting("deadlineRiskDays", Number(e.target.value))} /></Field><Field label="收藏停滞天数"><Input type="number" min={1} max={90} value={settings.savedStaleDays} onChange={(e) => updateSetting("savedStaleDays", Number(e.target.value))} /></Field><Field label="待投递停滞天数"><Input type="number" min={1} max={90} value={settings.pendingStaleDays} onChange={(e) => updateSetting("pendingStaleDays", Number(e.target.value))} /></Field><Field label="已投递停滞天数"><Input type="number" min={1} max={90} value={settings.appliedStaleDays} onChange={(e) => updateSetting("appliedStaleDays", Number(e.target.value))} /></Field><Field label="笔面试停滞天数"><Input type="number" min={1} max={90} value={settings.processStaleDays} onChange={(e) => updateSetting("processStaleDays", Number(e.target.value))} /></Field></div><h2>经历与能力</h2><div className="form-stack"><Field label="教育经历"><Textarea value={profile.education || ""} placeholder="学校、软件工程专业、时间、核心课程或奖项" onChange={(e) => onChange("education", e.target.value)} /></Field><Field label="实习 / 工作经历"><Textarea value={profile.experience || ""} placeholder="后端开发职责、技术栈和可验证成果" onChange={(e) => onChange("experience", e.target.value)} /></Field><Field label="项目经历"><Textarea value={profile.projects || ""} placeholder="Java / Spring Boot 项目、问题、方案与量化结果" onChange={(e) => onChange("projects", e.target.value)} /></Field><Field label="技能标签"><Input value={profile.skills || ""} placeholder="Java，Spring Boot，MySQL，Redis，RocketMQ" onChange={(e) => onChange("skills", e.target.value)} /></Field><Field label="个人简介"><Textarea value={profile.bio || ""} onChange={(e) => onChange("bio", e.target.value)} /></Field></div><DataManagement /></section></div></>;
}

function DataManagement() {
  const [preview, setPreview] = useState<any>(null); const [decisions, setDecisions] = useState<Record<string, "current" | "backup">>({}); const [busy, setBusy] = useState(false); const [useProfile, setUseProfile] = useState(true); const [archiveIndex, setArchiveIndex] = useState<any>(null);
  async function choose(file?: File) { if (!file) return; setBusy(true); try { const content = await file.text(); const result = await api<any>("/api/data/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json", content }) }); setPreview(result); setDecisions(Object.fromEntries((result.preview.conflicts || []).map((item: any) => [item.id, "current"]))); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function uploadArchive(file?: File) { if (!file || !preview) return; setBusy(true); try { const result = await api<any>(`/api/data/imports/${preview.importId}/files`, { method: "POST", headers: { "content-type": "application/x-tar", "content-length": String(file.size) }, body: file }); setPreview((current: any) => ({ ...current, preview: { ...current.preview, uploadedFiles: result.uploadedFiles } })); toast.success(`已校验 ${result.accepted} 个附件`); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function prepareArchive() { setBusy(true); try { setArchiveIndex(await api("/api/data/files/archive/index")); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function commit() { if (!preview) return; if ((preview.preview.uploadedFiles || 0) < (preview.preview.requiredFiles || 0)) return toast.error("请先上传全部附件 TAR 分包"); setBusy(true); try { await api(`/api/data/imports/${preview.importId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisions, useProfile }) }); toast.success("备份已完整恢复，请刷新页面查看"); setPreview(null); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <section className="data-management"><h2>数据备份与恢复</h2><p>JSON 保存全部结构化数据和附件哈希；附件 TAR 分包包含简历、录音、头像和岗位截图。恢复会先校验所有附件，再一次性提交数据库。</p><div className="card-actions"><Button variant="outline" asChild><a href="/api/data/export?format=json"><Download />导出完整 JSON</a></Button><Button variant="outline" asChild><a href="/api/data/export?format=csv"><Download />导出 CSV</a></Button><Button variant="outline" onClick={prepareArchive} disabled={busy}><Archive />准备附件分包</Button><label className="upload-button secondary"><Upload />{busy ? "处理中…" : "导入 JSON / CSV"}<input type="file" accept=".json,.csv,application/json,text/csv" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} /></label></div>{archiveIndex && <div className="archive-parts"><b>附件共 {archiveIndex.partCount} 个分包</b>{archiveIndex.partCount ? Array.from({ length: archiveIndex.partCount }, (_, index) => <Button variant="outline" asChild key={index}><a href={`/api/data/files/archive?part=${index}`}><Download />下载第 {index + 1} 包</a></Button>) : <span className="muted">当前没有附件</span>}</div>}{preview && <div className="import-preview"><b>导入预览 · 格式 v{preview.preview.schemaVersion || 1}</b><p>新增 {preview.preview.summary.additions} 条，相同 {preview.preview.summary.unchanged} 条，冲突 {preview.preview.summary.conflicts} 条；附件 {preview.preview.uploadedFiles || 0}/{preview.preview.requiredFiles || 0}。</p>{preview.preview.profileIncluded && <label><span>个人资料</span><input type="checkbox" checked={useProfile} onChange={(event) => setUseProfile(event.target.checked)} /></label>}{preview.preview.requiredFiles > 0 && <label className="upload-button secondary"><Upload />上传附件 TAR 分包<input type="file" accept=".tar,application/x-tar" disabled={busy} onChange={(event) => { uploadArchive(event.target.files?.[0]); event.target.value = ""; }} /></label>}{preview.preview.conflicts.map((item: any) => <label key={item.id}><span>{item.kind} · {item.title || item.id.slice(0, 8)}</span><select value={decisions[item.id] || "current"} onChange={(e) => setDecisions({ ...decisions, [item.id]: e.target.value as any })}><option value="current">保留当前</option><option value="backup">使用备份</option></select></label>)}<div className="card-actions"><Button variant="outline" onClick={() => setPreview(null)}>取消</Button><Button onClick={commit} disabled={busy || (preview.preview.uploadedFiles || 0) < (preview.preview.requiredFiles || 0)}>确认完整恢复</Button></div></div>}</section>;
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ResumeView({ resumes, applications, initialTab, initialApplicationId, onUpload, onPreview, onDelete, onAnalyze, onCreateOptimization, onUploadRevision, onLink, onFinalize }: { resumes: StoredFile[]; applications: RecordItem[]; initialTab: "completed" | "optimization"; initialApplicationId?: string; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPreview: (file: StoredFile) => void; onDelete: (id: string) => void; onAnalyze: (file: StoredFile, application?: RecordItem) => Promise<void>; onCreateOptimization: (applicationId: string, sourceFileId: string) => Promise<void>; onUploadRevision: (file: File, application: RecordItem, parent: StoredFile) => Promise<void>; onLink: (applicationId: string, fileId: string | null) => Promise<void>; onFinalize: (applicationId: string, fileId: string, appliedAt: string) => Promise<void> }) {
  const [tab, setTab] = useState<"completed" | "optimization">(initialTab);
  const completed = resumes.filter((file) => file.metadata.libraryType !== "optimization");
  const optimizations = resumes.filter((file) => file.metadata.libraryType === "optimization");
  const preparing = applications.filter((item) => (item.data.stage || "待投递") === "待投递");
  const [applicationId, setApplicationId] = useState(initialApplicationId || preparing[0]?.id || "");
  const [sourceFileId, setSourceFileId] = useState(completed[0]?.id || "");
  const [finalizing, setFinalizing] = useState<{ file: StoredFile; application: RecordItem } | null>(null);
  const [appliedAt, setAppliedAt] = useState(localDateTimeValue());
  const currentItems = tab === "completed" ? completed : optimizations;
  return <><PageHead eyebrow="简历工作台" title="完成稿与岗位优化稿分开管理" description="AI 只给出带原文依据的修改建议；你手动修改文件，再确认真正投递的最终版本。" action={<label className="upload-button"><Upload />上传完成简历<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onUpload} /></label>} />
    <section className="ats-note panel"><AlertTriangle /><div><b>ATS 不是“AI 简历检测器”</b><p>ATS（Applicant Tracking System）是企业用来收集、解析、筛选和跟踪候选人的招聘系统。这里不自动重写整份简历，重点是格式可解析、事实真实、关键词与岗位相关，并保留你的自然表达。</p></div><a href="https://www.oracle.com/cn/human-capital-management/recruiting/what-is-applicant-tracking-system/" target="_blank" rel="noreferrer">了解 ATS <ExternalLink /></a></section>
    <div className="resume-library-tabs"><button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}><FileText />简历库（已完成）<span>{completed.length}</span></button><button className={tab === "optimization" ? "active" : ""} onClick={() => setTab("optimization")}><Sparkles />简历优化库（待投递）<span>{optimizations.length}</span></button></div>
    {tab === "optimization" && <section className="panel optimization-starter"><div><b>为准备中的岗位建立优化副本</b><p>先选择岗位和一份完成稿。系统创建私有副本并关联岗位，原简历不会被覆盖。</p></div><select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}><option value="">选择待投递岗位</option>{preparing.map((item) => <option value={item.id} key={item.id}>{item.data.company} · {item.data.role}</option>)}</select><select value={sourceFileId} onChange={(e) => setSourceFileId(e.target.value)}><option value="">选择源简历</option>{completed.map((file) => <option value={file.id} key={file.id}>{file.metadata.displayName || file.filename}</option>)}</select><Button disabled={!applicationId || !sourceFileId} onClick={() => onCreateOptimization(applicationId, sourceFileId)}><Plus />创建优化副本</Button></section>}
    {currentItems.length ? <div className="resume-grid">{currentItems.map((file) => { const linked = applications.filter((item) => item.data.resumeId === file.id); const application = applications.find((item) => item.id === file.metadata.applicationId); const review = file.metadata.review as Record<string, any> | undefined; return <article className={`resume-card ${file.metadata.isFinalSubmitted ? "final-resume" : ""}`} key={file.id}><div className="file-cover"><FileText /><span>{file.mimeType.includes("pdf") ? "PDF" : file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"}</span>{file.metadata.isFinalSubmitted && <b>最终投递版</b>}</div><div className="resume-body"><div><h2>{file.metadata.displayName || file.filename}</h2><p>{application ? `${application.data.company} · ${application.data.role}` : file.metadata.target || "未设置目标方向"}</p></div><dl><div><dt>源文件</dt><dd>{file.filename}</dd></div><div><dt>{tab === "completed" ? "保存时间" : "版本"}</dt><dd>{tab === "completed" ? formatDate(file.createdAt, true) : `优化稿 ${file.metadata.optimizationRevision || 1}`}</dd></div><div><dt>文件大小</dt><dd>{fileSize(file.size)}</dd></div><div><dt>{tab === "completed" ? "已投岗位" : "状态"}</dt><dd>{tab === "completed" ? `${linked.length} 个` : file.metadata.optimizationStatus || "待优化"}</dd></div></dl>{file.metadata.note && <p className="resume-note">{file.metadata.note}</p>}{review && <div className="resume-review"><header><b>AI 评审建议</b><small>{formatDate(file.metadata.reviewedAt, true)} · {review.suggestions?.length || 0} 条</small></header>{(review.suggestions || []).slice(0, 2).map((item: any, index: number) => <article key={index}><b>{item.location}</b><p>{item.issue}</p><span>{item.suggestion}</span><small>依据：{item.sourceQuotes?.[0] || "无有效原文引用"}</small></article>)}{(review.warnings || []).slice(0, 2).map((warning: string) => <p className="review-warning" key={warning}><AlertTriangle />{warning}</p>)}</div>}<div className="tag-row">{(file.metadata.tags || []).map((tag: string) => <span key={tag}>{tag}</span>)}{linked.slice(0, 3).map((item) => <span key={item.id}>{item.data.company}</span>)}</div><div className="card-actions"><Button variant="outline" onClick={() => onPreview(file)}><Eye />预览</Button><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载</a></Button>{tab === "completed" ? <Button onClick={() => onAnalyze(file)}><Sparkles />通用检查</Button> : application ? <><Button onClick={() => onAnalyze(file, application)}><Sparkles />按 JD 评审</Button><label className="upload-button secondary"><Upload />上传手动修改稿<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { const next = e.target.files?.[0]; if (next) onUploadRevision(next, application, file); e.target.value = ""; }} /></label><Button variant="outline" onClick={() => { setAppliedAt(localDateTimeValue()); setFinalizing({ file, application }); }} disabled={Boolean(file.metadata.isFinalSubmitted)}><CheckCircle2 />{file.metadata.isFinalSubmitted ? "已设为最终版" : "设为最终投递简历"}</Button><Button variant="ghost" onClick={() => onLink(application.id, null)}><X />取消岗位关联</Button></> : <StatusPill tone="orange">未关联岗位</StatusPill>}<Button variant="ghost" size="icon" aria-label="删除简历" onClick={() => onDelete(file.id)}><Trash2 /></Button></div></div></article>; })}</div> : <EmptyState icon={FileText} title={tab === "completed" ? "还没有完成简历" : "还没有岗位优化稿"} text={tab === "completed" ? "上传 PDF、DOCX 或 DOC，原文件会保存为你的私有云端副本。" : "选择一个准备中的岗位和一份完成简历，创建独立优化副本。"} action={tab === "completed" ? <label className="upload-button"><Upload />上传第一份简历<input type="file" accept=".pdf,.doc,.docx" onChange={onUpload} /></label> : undefined} />}
    {finalizing && <Dialog open onOpenChange={(open) => !open && setFinalizing(null)}><DialogContent><DialogHeader><DialogTitle>确认最终投递版本</DialogTitle><DialogDescription>{finalizing.application.data.company} · {finalizing.application.data.role}<br />确认后岗位会从“准备中”自动进入“已投递”，并在岗位分析和简历库中同步关联。</DialogDescription></DialogHeader><Field label="实际投递时间"><Input type="datetime-local" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} /></Field><div className="final-resume-summary"><FileText /><span><b>{finalizing.file.metadata.displayName || finalizing.file.filename}</b><small>请确认这与招聘网站实际上传的文件完全一致</small></span></div><DialogFooter><Button variant="outline" onClick={() => setFinalizing(null)}>取消</Button><Button onClick={async () => { await onFinalize(finalizing.application.id, finalizing.file.id, appliedAt); setFinalizing(null); }} disabled={!appliedAt}><CheckCircle2 />确认已投递</Button></DialogFooter></DialogContent></Dialog>}
  </>;
}

function JobDeadlineNotice({ data, settings, serverNow }: { data: Record<string, any>; settings?: Record<string, any>; serverNow?: string }) {
  if (!serverNow) return <div className="job-deadline missing"><Timer />正在校准截止时间</div>;
  const status = jobDeadlineStatus(data, { ...defaultJobSearchSettings, ...(settings || {}) }, new Date(serverNow));
  return <div className={`job-deadline ${status.level}`}><AlertTriangle />{status.message}</div>;
}

function SavedJobsView({ items, screenshots, settings, serverNow, onSave, onExtract, onConfirm, onConvert, onDelete }: { items: RecordItem[]; screenshots: StoredFile[]; settings: Record<string, any>; serverNow?: string; onSave: (data: Record<string, any>, screenshot?: File) => Promise<void>; onExtract: (url?: string, screenshot?: File) => Promise<{ job: AIJob; screenshotFileId: string }>; onConfirm: (jobId: string, data: Record<string, any>, allowDuplicate?: boolean) => Promise<any>; onConvert: (item: RecordItem) => Promise<void>; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File>();
  const [jobId, setJobId] = useState(""); const [screenshotFileId, setScreenshotFileId] = useState(""); const [extracting, setExtracting] = useState(false); const [warnings, setWarnings] = useState<string[]>([]); const [conflicts, setConflicts] = useState<Array<{ key: string; current: string; incoming: string }>>([]);
  const confirmation = useConfirmDialog();
  const empty = { sourceUrl: "", company: "", role: "", location: "", salary: "", deadline: "", recruitmentMode: "自动判断", priority: "普通", jd: "" }; const [draft, setDraft] = useState<Record<string, any>>(empty);
  const update = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function extract(mode: "url" | "image") { if (mode === "url" && !/^https?:\/\//i.test(draft.sourceUrl)) return toast.error("请先输入公开岗位链接"); if (mode === "image" && !file) return toast.error("请先选择岗位截图"); setExtracting(true); const toastId = toast.loading(mode === "url" ? "正在读取岗位页面…" : "正在识别岗位截图…"); try { const output = await onExtract(mode === "url" ? draft.sourceUrl : undefined, mode === "image" ? file : undefined); const result = output.job.result || {}; const next = { ...draft }; const found: Array<{ key: string; current: string; incoming: string }> = []; ["sourceUrl","company","role","location","salary","deadline","jd"].forEach((key) => { const incoming = String(result[key] || ""); if (!incoming) return; if (String(next[key] || "").trim() && String(next[key]).trim() !== incoming.trim()) found.push({ key, current: String(next[key]), incoming }); else next[key] = incoming; }); setDraft(next); setConflicts(found); setWarnings(result.warnings || []); setJobId(output.job.id); if (output.screenshotFileId) setScreenshotFileId(output.screenshotFileId); toast.success("提取完成，请核对后保存", { id: toastId }); } catch (error) { toast.error((error as Error).message + "。你仍可手动填写或改用截图。", { id: toastId }); } finally { setExtracting(false); } }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.sourceUrl && !file && !draft.company && !draft.role) return toast.error("请填写岗位链接、上传截图或补充岗位信息");
    setSaving(true);
    try {
      if (jobId) { const result = await onConfirm(jobId, { ...draft, screenshotFileId }); if (result.requiresConfirmation && result.duplicate) { if (!await confirmation.ask("保存重复岗位？", `已存在「${result.duplicate.title}」。只有确实需要两条独立记录时才保存副本。`)) return; await onConfirm(jobId, { ...draft, screenshotFileId }, true); } }
      else await onSave(draft, file);
      setFile(undefined); setDraft(empty); setJobId(""); setWarnings([]); setConflicts([]); setOpen(false); toast.success("岗位已保存");
    } finally { setSaving(false); }
  }
  return <><PageHead eyebrow="机会收集箱" title="先收藏岗位，再决定是否投递" description="保存岗位链接、JD 截图和关键信息；确认后可一键转入投递看板。" action={<Button onClick={() => setOpen(true)}><Plus />收藏岗位</Button>} />
    {items.length ? <div className="saved-job-grid">{items.map((item) => { const image = screenshots.find((entry) => entry.id === item.data.screenshotFileId); return <article className="saved-job-card" key={item.id}>{image ? <Image unoptimized width={720} height={360} src={`/api/files/content?id=${image.id}`} alt={`${item.data.company || "岗位"} JD 截图`} /> : <div className="saved-job-placeholder"><ImageIcon /><span>未上传 JD 截图</span></div>}<div className="saved-job-body"><div><span className="resource-badge">{item.data.priority || "待评估"}</span><h2>{item.data.company || "公司待补充"}</h2><p>{item.data.role || "岗位名称待补充"}</p></div><dl><div><dt>地点</dt><dd>{item.data.location || "—"}</dd></div><div><dt>招聘方式</dt><dd>{item.data.recruitmentMode || (item.data.deadline ? "固定截止" : "滚动招聘")}</dd></div></dl><JobDeadlineNotice data={item.data} settings={settings} serverNow={serverNow} />{item.data.jd && <p className="saved-job-jd">{item.data.jd}</p>}<div className="card-actions"><Button variant="outline" asChild><a href={item.data.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />查看原岗位</a></Button><Button disabled={Boolean(item.data.convertedApplicationId)} onClick={() => onConvert(item)}>{item.data.convertedApplicationId ? <CheckCircle2 /> : <BriefcaseBusiness />}{item.data.convertedApplicationId ? "已转投递" : "转入投递"}</Button><Button variant="ghost" size="icon" aria-label="删除收藏岗位" onClick={() => onDelete(item.id)}><Trash2 /></Button></div></div></article>; })}</div> : <EmptyState icon={Bookmark} title="还没有收藏岗位" text="遇到感兴趣的岗位时，先保存链接和 JD，避免信息散落在浏览器标签页和聊天记录中。" action={<Button onClick={() => setOpen(true)}><Plus />收藏第一个岗位</Button>} />}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog capture-dialog"><DialogHeader><DialogTitle>收藏岗位</DialogTitle><DialogDescription>AI 只在你点击时提取，结果不会直接写入正式记录。</DialogDescription></DialogHeader><form onSubmit={submit}><div className="capture-source"><Field label="岗位链接"><Input type="url" value={draft.sourceUrl} placeholder="https://..." onChange={(e) => update("sourceUrl", e.target.value)} /></Field><Button type="button" variant="outline" disabled={extracting || !draft.sourceUrl} onClick={() => extract("url")}><Sparkles />提取链接</Button></div><div className="editor-grid"><Field label="公司"><Input value={draft.company} onChange={(e) => update("company", e.target.value)} /></Field><Field label="岗位"><Input value={draft.role} onChange={(e) => update("role", e.target.value)} /></Field><Field label="工作地点"><Input value={draft.location} onChange={(e) => update("location", e.target.value)} /></Field><Field label="薪资范围"><Input value={draft.salary} onChange={(e) => update("salary", e.target.value)} /></Field><Field label="招聘方式"><select value={draft.recruitmentMode} onChange={(e) => update("recruitmentMode", e.target.value)}><option>自动判断</option><option>滚动招聘</option><option>固定截止</option></select></Field><Field label="网申截止日期（可空）"><Input type="date" value={draft.deadline} onChange={(e) => update("deadline", e.target.value)} /></Field><Field label="优先级"><select value={draft.priority} onChange={(e) => update("priority", e.target.value)}><option>高</option><option>普通</option><option>低</option></select></Field><Field label="完整 JD"><Textarea value={draft.jd} placeholder="提取结果或手动粘贴岗位职责与任职要求…" onChange={(e) => update("jd", e.target.value)} /></Field><Field label="JD 截图"><label className="upload-zone"><ImageIcon /><span>{file ? file.name : "选择 PNG、JPG 或 WebP，最大 10 MB"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} /></label><Button className="ocr-button" type="button" variant="outline" disabled={extracting || !file} onClick={() => extract("image")}><ImageIcon />识别截图</Button></Field></div>{warnings.length > 0 && <div className="capture-warnings"><AlertTriangle />{warnings.map((item) => <p key={item}>{item}</p>)}</div>}{conflicts.length > 0 && <div className="capture-conflicts"><b>发现字段冲突，当前保留你的填写</b>{conflicts.map((item) => <div key={item.key}><span><small>当前</small>{item.current}</span><span><small>AI 提取</small>{item.incoming}</span><Button type="button" variant="outline" onClick={() => { update(item.key, item.incoming); setConflicts((items) => items.filter((entry) => entry.key !== item.key)); }}>采用提取值</Button></div>)}</div>}<div className="capture-tip"><AlertTriangle /><span>未填写截止日期时自动按滚动招聘处理；若官网虽然写了远期截止，但岗位实际招满即止，请手动选择“滚动招聘”。</span></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={saving || extracting}>{saving ? <RefreshCw className="spin" /> : <Bookmark />}{saving ? "正在保存…" : "核对并保存"}</Button></DialogFooter></form></DialogContent></Dialog>{confirmation.dialog}
  </>;
}

const foreignQuestions = [
  "Please introduce yourself in one minute.",
  "Could you walk me through your most important backend project?",
  "What was the hardest technical problem in your project, and how did you solve it?",
  "What is the difference between HashMap and ConcurrentHashMap?",
  "How would you prevent cache penetration, breakdown, and avalanche?",
  "How do database indexes improve query performance, and when can they become ineffective?",
  "How would you design an order service that avoids overselling?",
  "Why did you choose a message queue instead of a synchronous call?",
  "How do you make a backend service observable and maintainable?",
  "Tell me about a disagreement in a team and how you handled it.",
  "Why do you want to join this company and this team?",
  "What would you like to ask the interviewers?",
];

const foreignCompanies = [
  { name: "State Street", domain: "金融服务 / 技术", cities: "在官网按 Hangzhou / China 实时筛选", url: "https://careers.statestreet.com/global/en" },
  { name: "Bosch 博世", domain: "汽车、工业与软件", cities: "上海 / 苏州 / 杭州等以当期职位为准", url: "https://www.bosch.com.cn/careers/job-offers/" },
  { name: "Siemens 西门子", domain: "工业数字化", cities: "在官网按 China 与城市筛选", url: "https://jobs.siemens.com/careers" },
  { name: "Philips 飞利浦", domain: "医疗健康科技", cities: "在官网核对中国区研发岗位", url: "https://www.careers.philips.com/" },
  { name: "Cisco 思科", domain: "网络与云基础设施", cities: "在官网核对中国区技术岗位", url: "https://jobs.cisco.com/" },
  { name: "Schneider Electric 施耐德电气", domain: "能源管理与工业自动化", cities: "官网可按 China / Shanghai / Suzhou 等筛选", url: "https://careers.se.com/china" },
  { name: "Microsoft 微软", domain: "云、平台与软件", cities: "在官网按 China 与学生岗位筛选", url: "https://careers.microsoft.com/v2/global/en/home.html" },
  { name: "Amazon 亚马逊", domain: "云与软件服务", cities: "岗位与面试流程以具体职位为准", url: "https://www.amazon.jobs/zh/" },
  { name: "PayPal", domain: "支付与金融科技", cities: "在官网核对中国及应届岗位", url: "https://careers.pypl.com/" },
];

const foreignPlan = [
  ["intro", "写完并录熟 60 秒英文自我介绍", "只写已确认的学校、技能、项目与求职动机"],
  ["project", "完成一个项目的 4 句英文版本", "背景、技术选择、解决的问题、可验证结果"],
  ["technical", "练完 6 道 Java 后端英文技术题", "先保证技术准确，再处理语法和用词"],
  ["behavior", "准备 3 个 STAR(R) 行为故事", "合作、困难、失败与复盘各有真实证据"],
  ["coding", "完成一次 45 分钟英文 Coding 模拟", "澄清问题、口述思路、边界与复杂度"],
  ["company", "核对 5 个目标岗位的语言与福利", "向 HR 确认面试语言、团队、加班、假期和 on-call"],
];

function ForeignPrepView({ saved, onSave, onReview, onOpenAI }: { saved: Record<string, any>; onSave: (data: Record<string, any>) => Promise<any>; onReview: (question: string, answer: string, role: string, jd: string) => Promise<AIJob>; onOpenAI: () => void }) {
  const initial = { role: "Java 后端开发（应届）", jd: "", selfIntro: "", projectStory: "", whyCompany: "", behaviorStories: "", questionsForInterviewer: "", checklist: {}, companyStatuses: {}, practiceQuestion: foreignQuestions[0], practiceAnswer: "", latestReview: null, ...saved };
  const [data, setData] = useState<Record<string, any>>(initial);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speechRecording, setSpeechRecording] = useState(false); const [speechFile, setSpeechFile] = useState<File | null>(null); const [speechBusy, setSpeechBusy] = useState(false); const [speechMeta, setSpeechMeta] = useState<Record<string, any>>(saved.latestSpeech || {});
  const speechRecorder = useRef<MediaRecorder | null>(null); const speechStream = useRef<MediaStream | null>(null); const speechChunks = useRef<Blob[]>([]); const speechStarted = useRef(0); const speechPauses = useRef(0); const silenceStarted = useRef<number | null>(null); const speechMonitor = useRef<ReturnType<typeof setInterval> | null>(null); const speechContext = useRef<AudioContext | null>(null);
  useEffect(() => { setData((current) => ({ ...current, ...saved })); }, [saved]);
  useEffect(() => { if (!seconds) return; const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(id); }, [seconds]);
  const update = (key: string, value: any) => setData((current) => ({ ...current, [key]: value }));
  const completed = foreignPlan.filter(([key]) => data.checklist?.[key]).length;
  async function persist(next = data) { setSaving(true); try { await onSave(next); toast.success("外企准备进度已保存到云端"); } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); } }
  async function review() { if (String(data.practiceAnswer || "").trim().length < 20) return toast.error("请先写下至少 20 个字符的英文回答"); setBusy(true); const toastId = toast.loading("千问正在检查技术准确性与英文表达…"); try { const job = await onReview(data.practiceQuestion, data.practiceAnswer, data.role, data.jd); const next = { ...data, latestReview: { ...(job.result || {}), aiJobId: job.id, question: data.practiceQuestion, answer: data.practiceAnswer, reviewedAt: new Date().toISOString() } }; setData(next); await onSave(next); toast.success("点评已生成并保存", { id: toastId }); } catch (error) { toast.error((error as Error).message, { id: toastId }); } finally { setBusy(false); } }
  function speak() { if (!("speechSynthesis" in window)) return toast.error("当前浏览器不支持朗读"); window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(data.practiceQuestion); utterance.lang = "en-US"; utterance.rate = .88; window.speechSynthesis.speak(utterance); }
  async function startSpeechRecording() {
    if (speechRecording) { speechRecorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); speechStream.current = stream; speechChunks.current = []; speechPauses.current = 0; silenceStarted.current = null; speechStarted.current = Date.now();
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"; const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 }); speechRecorder.current = recorder;
      const context = new AudioContext(); speechContext.current = context; const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 1024; source.connect(analyser); const values = new Uint8Array(analyser.fftSize);
      speechMonitor.current = setInterval(() => { analyser.getByteTimeDomainData(values); const rms = Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length); if (rms < .025) { if (silenceStarted.current == null) silenceStarted.current = Date.now(); } else if (silenceStarted.current != null) { if (Date.now() - silenceStarted.current >= 700) speechPauses.current++; silenceStarted.current = null; } }, 100);
      recorder.ondataavailable = (event) => { if (event.data.size) speechChunks.current.push(event.data); };
      recorder.onstop = () => { const duration = Math.max(1, Math.round((Date.now() - speechStarted.current) / 1000)); const blob = new Blob(speechChunks.current, { type: "audio/webm" }); setSpeechFile(new File([blob], `foreign-practice-${Date.now()}.webm`, { type: "audio/webm" })); setSpeechMeta({ durationSeconds: duration, pauseCount: speechPauses.current }); setSpeechRecording(false); if (speechMonitor.current) clearInterval(speechMonitor.current); speechStream.current?.getTracks().forEach((track) => track.stop()); speechContext.current?.close().catch(() => undefined); };
      recorder.start(); setSpeechRecording(true); window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5 * 60 * 1000);
    } catch { toast.error("无法访问麦克风，请检查浏览器权限或改用上传音频"); }
  }
  async function chooseSpeechFile(file?: File) { if (!file) return; if (file.size > 10 * 1024 * 1024) return toast.error("单段音频不能超过 10 MB"); const duration = await new Promise<number>((resolve) => { const audio = document.createElement("audio"); const url = URL.createObjectURL(file); audio.onloadedmetadata = () => { resolve(Math.round(audio.duration || 0)); URL.revokeObjectURL(url); }; audio.onerror = () => { resolve(0); URL.revokeObjectURL(url); }; audio.src = url; }); if (duration > 300) return toast.error("上传音频不能超过 5 分钟"); setSpeechFile(file); setSpeechMeta({ durationSeconds: duration, pauseCount: null }); }
  async function transcribeSpeech() {
    if (!speechFile) return toast.error("请先录音或选择音频"); setSpeechBusy(true); const toastId = toast.loading("正在转写英文回答…");
    try { const params = new URLSearchParams({ purpose: "audio", displayName: "外企英文面试练习", duration: String(speechMeta.durationSeconds || 0) }); const uploaded = await api<any>(`/api/files?${params}`, { method: "POST", headers: { "content-type": speechFile.type, "content-length": String(speechFile.size), "x-file-name": encodeURIComponent(speechFile.name) }, body: speechFile }); const created = await api<any>("/api/ai/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "transcription", input: { fileId: uploaded.file.id, segmentIndex: 0 } }) }); const completed = await api<any>(`/api/ai/jobs/${created.job.id}/run`, { method: "POST" }); const transcript = String(completed.job.result?.text || ""); const words = transcript.trim().split(/\s+/).filter(Boolean).length; const duration = Number(speechMeta.durationSeconds || 0); const fillers = transcript.match(/\b(um+|uh+|like|you know|actually|basically)\b/gi)?.length || 0; const latestSpeech = { ...speechMeta, words, wordsPerMinute: duration ? Math.round(words / duration * 60) : null, fillerCount: fillers, transcript, aiJobId: completed.job.id, audioFileId: uploaded.file.id, createdAt: new Date().toISOString() }; const next = { ...data, practiceAnswer: transcript, latestSpeech }; setSpeechMeta(latestSpeech); setData(next); await onSave(next); toast.success("转写完成并已保存，请人工修订后再提交点评", { id: toastId }); } catch (error) { toast.error((error as Error).message, { id: toastId }); } finally { setSpeechBusy(false); }
  }
  return <><PageHead eyebrow="外企准备" title="把英文技术面试拆成可练习、可复盘的动作" description="面试语言由岗位、团队和面试官决定；这里按“可能出现全英文”做准备，不把任何公司的流程、假期或 WLB 当成固定承诺。" action={<Button onClick={() => persist()} disabled={saving}><Save />{saving ? "保存中…" : "保存全部"}</Button>} />
    <section className="panel foreign-hero"><div><span>当前完成度</span><strong>{completed} / {foreignPlan.length}</strong><p>目标：能用简单准确的英文讲清 Java 后端项目、技术取舍与真实经历。</p></div><div className="foreign-progress"><i style={{ width: `${Math.round(completed / foreignPlan.length * 100)}%` }} /></div><aside><b>先确认，不猜测</b><p>收到面试邀请后向 HR 询问轮次、语言比例、Coding 工具和海外面试官安排。</p></aside></section>
    <nav className="foreign-tabs">{[["overview","训练计划"],["materials","英文材料"],["practice","AI 模拟"],["companies","目标公司"],["verify","福利核验"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>

    {tab === "overview" && <div className="foreign-layout"><section className="panel foreign-checklist"><div className="panel-title"><div><h2>四周准备清单</h2><p>完成情况会随“保存全部”同步到云端。</p></div></div>{foreignPlan.map(([key,title,text], index) => <label key={key}><input type="checkbox" checked={Boolean(data.checklist?.[key])} onChange={(e) => update("checklist", { ...(data.checklist || {}), [key]: e.target.checked })} /><span><b>{String(index + 1).padStart(2,"0")} · {title}</b><small>{text}</small></span></label>)}</section><section className="panel foreign-principles"><h2>技术岗准备重点</h2>{[["代码","可运行、边界清楚、命名可读，并能说明复杂度与测试"],["基础","Java 并发、JVM、网络、MySQL、Redis；把推理过程说出来"],["设计","先澄清需求，再解释 trade-off、失败模式与可维护性"],["沟通","不会时承认边界并澄清：Could you please rephrase that question?"]].map(([title,text]) => <article key={title}><b>{title}</b><p>{text}</p></article>)}<div className="knowledge-warning"><AlertTriangle /><div><b>不要背虚构模板</b><p>示例里的“2 年经验”“性能提升数字”只有在你的真实资料可证明时才能使用。</p></div></div></section></div>}

    {tab === "materials" && <section className="panel foreign-materials"><div className="foreign-form-head"><div><h2>英文材料库</h2><p>先用你会说的简单句完成，再逐步润色；内容必须来自真实经历。</p></div></div><div className="form-grid"><Field label="目标岗位"><Input value={data.role} onChange={(e) => update("role", e.target.value)} /></Field><Field label="目标岗位 JD（可选）"><Textarea value={data.jd} onChange={(e) => update("jd", e.target.value)} placeholder="用于 AI 点评时补充岗位语境" /></Field><Field label="60 秒自我介绍"><Textarea value={data.selfIntro} onChange={(e) => update("selfIntro", e.target.value)} placeholder="Name → education → verified backend skills → one project → why this role" /></Field><Field label="项目四句稿"><Textarea value={data.projectStory} onChange={(e) => update("projectStory", e.target.value)} placeholder="What I built → technologies → problem and decision → verified result" /></Field><Field label="Why this company / role"><Textarea value={data.whyCompany} onChange={(e) => update("whyCompany", e.target.value)} placeholder="基于真实产品、业务和岗位要求，不写空泛赞美" /></Field><Field label="STAR(R) 行为故事"><Textarea value={data.behaviorStories} onChange={(e) => update("behaviorStories", e.target.value)} placeholder="Situation / Task / Action / Result / Reflection" /></Field><Field label="反问面试官"><Textarea value={data.questionsForInterviewer} onChange={(e) => update("questionsForInterviewer", e.target.value)} placeholder="团队业务、代码评审、on-call、英文协作、培养机制…" /></Field></div></section>}

    {tab === "practice" && <div className="foreign-layout"><section className="panel foreign-practice"><div className="panel-title"><div><h2>英文模拟面试</h2><p>AI 只评价当前问题和你的回答，不会替你补造经历。</p></div><button onClick={onOpenAI}>查看审计记录</button></div><Field label="面试问题"><select value={data.practiceQuestion} onChange={(e) => update("practiceQuestion", e.target.value)}>{foreignQuestions.map((question) => <option key={question}>{question}</option>)}</select></Field><div className="practice-tools"><Button variant="outline" onClick={speak}><MessagesSquare />朗读题目</Button><Button variant="outline" onClick={() => setSeconds(90)}><Timer />{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}` : "90 秒计时"}</Button><Button variant={speechRecording ? "destructive" : "outline"} onClick={startSpeechRecording}>{speechRecording ? <Square /> : <Mic />}{speechRecording ? "停止录音" : "录制回答"}</Button><label className="upload-button secondary"><Upload />上传短音频<input type="file" accept="audio/*,video/webm,video/mp4" onChange={(event) => { chooseSpeechFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>{speechFile && <div className="speech-preview"><span><b>{speechFile.name}</b><small>{fileSize(speechFile.size)} · {speechMeta.durationSeconds || "?"} 秒</small></span><Button variant="outline" onClick={transcribeSpeech} disabled={speechBusy}>{speechBusy ? <RefreshCw className="spin" /> : <Sparkles />}{speechBusy ? "转写中…" : "转写到回答框"}</Button></div>}{speechMeta.transcript && <div className="speech-metrics"><span>时长 <b>{speechMeta.durationSeconds}s</b></span><span>语速 <b>{speechMeta.wordsPerMinute || "—"} WPM</b></span><span>长停顿 <b>{speechMeta.pauseCount ?? "上传音频不检测"}</b></span><span>填充词 <b>{speechMeta.fillerCount}</b></span><small>这些指标只帮助观察表达节奏，不评价口音或人格；转写可能有误，请人工修订。</small></div>}<Field label="你的英文回答"><Textarea className="practice-answer" value={data.practiceAnswer} onChange={(e) => update("practiceAnswer", e.target.value)} placeholder="先自己回答。建议保留自然、简单、能当场说出口的表达。" /></Field><Button onClick={review} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Sparkles />}{busy ? "正在点评…" : "AI 检查技术与表达"}</Button></section><section className="panel foreign-review">{data.latestReview ? <><div className="report-badges"><StatusPill tone={data.latestReview.verdict === "ready" ? "green" : data.latestReview.verdict === "rewrite" ? "red" : "orange"}>{({ ready:"可以继续模拟", practice_more:"需要再练", rewrite:"建议重写" } as any)[data.latestReview.verdict] || "已点评"}</StatusPill><span>{formatDate(data.latestReview.reviewedAt, true)}</span></div><h2>最近一次点评</h2><dl><div><dt>技术内容</dt><dd>{data.latestReview.technicalFeedback}</dd></div><div><dt>英文表达</dt><dd>{data.latestReview.englishFeedback}</dd></div><div><dt>回答结构</dt><dd>{data.latestReview.structureFeedback}</dd></div></dl>{data.latestReview.unsupportedClaims?.length > 0 && <div className="foreign-risk"><AlertTriangle /><div><b>需要核实的说法</b>{data.latestReview.unsupportedClaims.map((item: string) => <p key={item}>{item}</p>)}</div></div>}<h3>建议版本</h3><p className="corrected-answer">{data.latestReview.correctedAnswer}</p><h3>下一轮追问</h3><ul>{data.latestReview.followUpQuestions?.map((item: string) => <li key={item}>{item}</li>)}</ul></> : <EmptyState icon={Sparkles} title="还没有点评" text="选择一道问题，写下自己的英文回答后再让 AI 检查。" />}</section></div>}

    {tab === "companies" && <section className="panel foreign-companies"><div className="panel-title"><div><h2>江浙沪外企机会池</h2><p>不按“学校友好度”或福利传闻排名；职位是否开放、地点、语言和用工主体以当期官方 JD 为准。</p></div></div><div>{foreignCompanies.map((company) => <article key={company.name}><div><span>{company.domain}</span><h3>{company.name}</h3><p>{company.cities}</p></div><select aria-label={`${company.name} 跟进状态`} value={data.companyStatuses?.[company.name] || "未查看"} onChange={(e) => update("companyStatuses", { ...(data.companyStatuses || {}), [company.name]: e.target.value })}><option>未查看</option><option>已看官网</option><option>已收藏岗位</option><option>已投递</option><option>不适合</option></select><a href={company.url} target="_blank" rel="noreferrer">官网职位 <ExternalLink /></a></article>)}</div></section>}

    {tab === "verify" && <div className="foreign-layout"><section className="panel verify-list"><h2>收到面试邀请后</h2>{["面试共几轮，哪几轮使用英文，是否有海外面试官","Coding 是共享编辑器、白板还是本地 IDE，允许哪种语言","是否需要系统设计、英语演示或项目英文讲解","工作语言、海外会议频率与时区","团队、业务线、汇报对象和用工主体"].map((item) => <p key={item}><CheckCircle2 />{item}</p>)}</section><section className="panel verify-list"><h2>拿到 Offer 后</h2>{["年假、病假与公司假具体天数及入职首年折算规则","加班、on-call、调休/加班费及下班消息规则","固定薪资、奖金条件、公积金基数、商业保险覆盖范围","试用期、岗位地点、远程/混合办公与调岗条款","中国区业务稳定性、团队近年变化和裁员补偿按书面政策确认"].map((item) => <p key={item}><CheckCircle2 />{item}</p>)}</section></div>}
  </>;
}

const hangzhouCompanyTiers = [
  { tier: "冲刺", companies: "淘天、阿里本地生活、阿里云、网易、蚂蚁集团、字节杭州、快手杭州", focus: "技术深度与算法笔试要求高，优先关注提前批和正式批早期", fit: "项目与笔试足够强时冲刺", tone: "blue" },
  { tier: "核心主攻", companies: "有赞、微盟、同花顺、恒生电子、邦盛科技、趣链科技、同盾科技、连连支付", focus: "本土中厂与金融科技公司较集中，Java 业务场景匹配度重要", fit: "非 985/211 候选人的主要机会池", tone: "green" },
  { tier: "稳健保底", companies: "建行杭州研发中心、招行杭州研发中心、宁波银行杭州、邮储银行杭州、浙江电信 / 移动、之江实验室等", focus: "重视统一笔试、稳定性与综合素质，须逐条核对当届招聘单位、学历和专业限制", fit: "适合作为稳底盘", tone: "orange" },
];

const backendTopics = [
  { title: "Java 与框架", text: "Java、Spring Boot、MyBatis-Plus；重点掌握 Spring Cloud Alibaba 的 Nacos、Sentinel、Seata。" },
  { title: "数据与缓存", text: "MySQL 索引、事务、锁与慢 SQL；Redis 数据结构、缓存异常、分布式锁和热点治理。" },
  { title: "消息与搜索", text: "RabbitMQ / RocketMQ 的可靠性、幂等与顺序性；Elasticsearch 商品或内容搜索。" },
  { title: "部署与云原生", text: "至少能用 Docker 完成部署；冲刺大厂时补齐 Kubernetes 核心对象与发布流程。" },
];

const interviewFoundations = [
  ["Java", "HashMap、ConcurrentHashMap、线程池、CAS、AQS、JVM、GC、类加载"],
  ["MySQL", "B+ 树、最左前缀、事务隔离、MVCC、行锁与慢 SQL 优化"],
  ["Redis", "数据结构、穿透/击穿/雪崩、持久化、过期策略、分布式锁"],
  ["消息队列", "消息丢失、重复消费、顺序性、死信队列、削峰填谷"],
  ["Spring", "Bean 生命周期、事务传播、循环依赖、AOP 原理"],
  ["分布式", "CAP/BASE、2PC、TCC、可靠消息最终一致性、锁方案对比"],
];

function KnowledgeView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <><PageHead eyebrow="目标城市知识库" title="杭州 / 江浙沪后端秋招作战手册" description="把城市认知、技术准备和投递动作放在同一张地图里；公司分层与薪资为个人策略参考，不是招聘方官方评级。" action={<Button onClick={() => onNavigate("savedJobs")}><Bookmark />开始整理目标岗位</Button>} />
    <section className="panel knowledge-hero"><div><span>杭州后端生态</span><h2>电商、支付与金融科技场景密集，Java 生态匹配度是主线</h2><p>非 985/211 背景并不等于没有机会，但需要用笔试排名、项目深度、可验证的性能数据和更合理的公司分层降低简历筛选风险。</p><div className="knowledge-tags"><span>Java / Spring Boot</span><span>MySQL / Redis</span><span>Spring Cloud Alibaba</span><span>电商与支付场景</span></div></div><aside><b>推荐投递配比</b><strong>30% / 50% / 20%</strong><small>冲刺大厂 / 主攻中厂 / 国企银行保底</small></aside></section>
    <nav className="knowledge-nav" aria-label="知识库目录">{[["market","市场认知"],["stack","技术栈"],["project","简历项目"],["interview","笔试面试"],["salary","薪资政策"],["strategy","投递策略"],["actions","行动清单"]].map(([id,label]) => <a href={`#${id}`} key={id}>{label}</a>)}</nav>

    <section className="knowledge-section" id="market"><header><span>01</span><div><h2>市场认知与公司分层</h2><p>先建立机会池，再按筛选难度和业务匹配度分配时间。</p></div></header><div className="company-tier-grid">{hangzhouCompanyTiers.map((item) => <article className={`tier-${item.tone}`} key={item.tier}><span>{item.tier}</span><h3>{item.companies}</h3><p>{item.focus}</p><small>{item.fit}</small></article>)}</div><div className="knowledge-warning"><AlertTriangle /><div><b>外包辨识原则</b><p>核对劳动合同主体、社保缴纳主体、汇报关系、是否驻场和转正路径；不要仅凭“阿里生态”“大厂项目”等宣传判断岗位价值。</p></div></div></section>

    <section className="knowledge-section" id="stack"><header><span>02</span><div><h2>杭州后端默认技术栈</h2><p>准备顺序以岗位覆盖率和面试频率为准，而不是无限堆叠名词。</p></div></header><div className="knowledge-card-grid">{backendTopics.map((item) => <article key={item.title}><Database /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div><div className="knowledge-callout"><b>杭州特色补强</b><p>Nacos、Sentinel、Seata、Canal 至少选一个讲清原理、故障场景与落地取舍，避免只停留在“用过”。</p></div></section>

    <section className="knowledge-section" id="project"><header><span>03</span><div><h2>简历与项目：把教育平台讲成可迁移的业务能力</h2><p>项目优先级建议：电商 / 支付 / 订单类 &gt; 平台 / SaaS &gt; 普通管理系统。</p></div></header><div className="project-upgrade"><article><span>场景改造</span><h3>智慧教育训练平台</h3><ul><li>课程报名防超卖：Redis + Lua 或数据库乐观锁</li><li>异步通知与削峰：MQ、重试、幂等和死信队列</li><li>缓存一致性：更新数据库后删除缓存、Canal 异步订阅等方案取舍</li></ul></article><article><span>证据标准</span><h3>每个亮点都要可验证</h3><ul><li>说明基线、压测方法、数据规模与机器配置</li><li>用真实测量描述响应时间、QPS、错误率和资源占用</li><li>没有测过就先补实验，不虚构“800ms → 120ms”等数字</li></ul></article></div><div className="knowledge-callout"><b>针对性加分项</b><p>Spring Cloud Alibaba、电商/支付/金融项目、MySQL 慢查询、Redis 故障排查，以及省级以上竞赛或有质量的开源贡献。</p></div></section>

    <section className="knowledge-section" id="interview"><header><span>04</span><div><h2>笔试与面试准备</h2><p>杭州校招笔试和算法筛选常常发生在简历深挖之前，基础与手写需要并行。</p></div></header><div className="interview-knowledge"><div><h3>高频基础</h3><ol>{interviewFoundations.map(([title,text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}</ol></div><div><h3>算法与手写</h3><p>LeetCode Hot 100 + 剑指 Offer；以中等题 20 分钟内形成可解释解法为训练目标。</p><div className="code-topic-tags"><span>LRU 缓存</span><span>线程安全单例</span><span>生产者消费者</span><span>二分查找</span><span>链表反转</span></div><h3>电商场景题</h3><ul><li>订单超时未支付：延时消息与定时补偿</li><li>库存防超卖：Redis + Lua 与数据库乐观锁</li><li>秒杀系统：限流、削峰、库存预扣和幂等</li><li>缓存一致性：删缓存策略、延时双删与 Canal</li></ul></div></div></section>

    <section className="knowledge-section" id="salary"><header><span>05</span><div><h2>薪资、生活成本与杭州政策</h2><p>薪资为用户提供的 2026 本科市场参考区间；政策已按杭州官方公开信息校正，申请前仍应再次核验。</p></div></header><div className="salary-policy-grid"><article className="salary-table"><h3>税前年薪参考</h3>{[["大厂 SP / SSP","30–40W+"],["中厂 / 独角兽","22–28W"],["普通互联网","18–22W"],["银行 / 国企研发","16–22W，福利结构不同"]].map(([label,value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}<small>区间不是录用承诺，需统一比较月薪、月数、奖金、股票、补贴、公积金与工时。</small></article><article className="policy-card"><h3>官方政策核对</h3><ul><li><b>人才落户：</b>本科毕业两年内可关注“先落户后就业”；其他学历、年龄、就业与社保条件以最新办事指南为准。</li><li><b>应届生生活补贴：</b>官方指南为本科 1 万、硕士 3 万、博士 10 万，满足参保等条件后分笔发放。</li><li><b>新引进应届生租房补贴：</b>符合条件的申请家庭每户每年 1 万元，可发放 3 年；并非按本科/硕士分别 1 万/1.5 万。</li><li><b>租房预算：</b>滨江、余杭等区域单间 1500–2500 元/月仅作市场估算，签约前以实时房源和通勤为准。</li></ul><div className="policy-links"><a href="https://hrss.hangzhou.gov.cn/art/2024/5/13/art_1229578386_4267025.html" target="_blank" rel="noreferrer">杭州应届生生活补贴指南 <ExternalLink /></a><a href="https://ql.hangzhou.gov.cn/col/col1229597836/art/2026/art_8d62018211ba4915b09c78c7d2a7ca13.html" target="_blank" rel="noreferrer">杭州住房保障政策答复 <ExternalLink /></a><a href="https://zfgb.hangzhou.gov.cn/10/105220253/t117220253054/518554.shtml" target="_blank" rel="noreferrer">杭州户籍制度改革意见 <ExternalLink /></a></div></article></div></section>

    <section className="knowledge-section" id="strategy"><header><span>06</span><div><h2>投递节奏与渠道</h2><p>把“什么时候投、投什么、从哪里投”拆开管理。</p></div></header><div className="strategy-timeline">{[["7–8 月","提前批","冲刺大厂和头部中厂，用真实笔面试校准准备度"],["9.1–10.15","黄金主战场","集中主攻第二梯队、银行和国企；尽早完成核心岗位投递"],["10.15–11.15","面试与决策","处理笔面试、横向比较 OFFER，同时补投遗漏岗位"],["11.15 后","补录与春招准备","关注剩余缺口岗位，复盘短板并建立春招保底计划"]].map(([time,title,text]) => <article key={time}><time>{time}</time><div><b>{title}</b><p>{text}</p></div></article>)}</div><div className="channel-grid"><article><b>1 · 内推</b><p>优先通过可信员工或校友获取岗位信息，核对岗位编号、团队和截止时间。</p></article><article><b>2 · 官网网申</b><p>作为正式记录来源，保存岗位链接、网申截止和投递账号。</p></article><article><b>3 · 宣讲会 / 双选会</b><p>关注浙大、杭电、浙工大等高校公开活动，确认是否允许外校学生参加。</p></article><article><b>4 · 招聘平台</b><p>BOSS 直聘等适合补充中小公司机会，但仍需核对用工主体与岗位真实性。</p></article></div></section>

    <section className="knowledge-section" id="actions"><header><span>07</span><div><h2>把知识变成今天的行动</h2><p>不要一次性做完，先建立任务和目标岗位池。</p></div></header><div className="knowledge-actions">{[["01","改写项目","补充防超卖、异步通知、缓存一致性，并为每个指标准备测量证据","profile"],["02","补齐组件","选择 Nacos 或 Sentinel，能解释原理、故障与适用边界","tasks"],["03","算法训练","安排 Hot 100 两轮计划，记录错题与限时结果","tasks"],["04","建立公司池","按 30% / 50% / 20% 分层收藏约 30 家真实岗位","savedJobs"],["05","寻找内推","从可信渠道获取岗位编号，保存联系人和下一次跟进日期","resources"]].map(([number,title,text,target]) => <article key={number}><span>{number}</span><div><b>{title}</b><p>{text}</p></div><Button variant="outline" onClick={() => onNavigate(target as View)}>去执行</Button></article>)}</div></section>
  </>;
}

const jobResources = [
  { name: "小红书校园招聘", tag: "年轻人 / 校招", url: "https://job.xiaohongshu.com/campus", description: "内容、电商、产品与技术岗位的官方校招入口" },
  { name: "脉脉招聘", tag: "职场社区 / 内推", url: "https://maimai.cn/jobs/c/job_find_me", description: "岗位、员工动态、内推线索与公司口碑" },
  { name: "字节跳动校园招聘", tag: "企业官网", url: "https://jobs.bytedance.com/campus", description: "字节跳动校招、实习与投递进度官方入口" },
  { name: "BOSS 直聘", tag: "综合招聘", url: "https://www.zhipin.com/web/geek/job", description: "综合岗位与招聘者沟通" },
  { name: "拉勾校招", tag: "互联网", url: "https://campus.lagou.com/", description: "互联网与数字科技校招" },
  { name: "实习僧", tag: "实习 / 校招", url: "https://www.shixiseng.com/", description: "实习、校招与应届岗位" },
  { name: "猎聘", tag: "综合招聘", url: "https://www.liepin.com/zhaopin/", description: "社会招聘与中高端职位" },
  { name: "牛客求职", tag: "校招社区", url: "https://www.nowcoder.com/jobs", description: "校招职位、笔面试经验" },
  { name: "前程无忧校招", tag: "校园招聘", url: "https://xy.51job.com/", description: "校园招聘与企业专场" },
  { name: "智联招聘", tag: "综合招聘", url: "https://jobs.zhaopin.com/", description: "全职、校招与城市岗位" },
  { name: "应届生求职网", tag: "应届生", url: "https://www.yingjiesheng.com/", description: "校招信息、宣讲会与网申" },
  { name: "上海公共招聘", tag: "上海 / 官方", url: "https://jobs.rsj.sh.gov.cn/", description: "上海人社公共就业招聘服务入口" },
  { name: "杭州人才网", tag: "杭州 / 官方", url: "https://www.hzrc.com/", description: "杭州人才市场招聘、校招、事业单位与招聘会" },
  { name: "中国国家人才网", tag: "全国 / 国家平台", url: "https://www.newjobs.com.cn/", description: "全国人才招聘、事业单位与人才服务信息" },
  { name: "中国公共招聘网", tag: "全国 / 公共就业", url: "https://job.mohrss.gov.cn/", description: "人社系统公共招聘与高校毕业生岗位" },
  { name: "中国卫生人才网", tag: "卫生健康", url: "https://www.21wecan.com/", description: "国家卫生健康委人才交流服务与卫生岗位" },
  { name: "中国外语人才网", tag: "外语 / 翻译 / 外贸", url: "https://www.jobeast.com/", description: "外语、翻译、外贸和国际业务垂直岗位" },
  { name: "中国国际人才网", tag: "国际人才", url: "https://www.chinajob.com/", description: "国际化与涉外人才岗位及招聘活动" },
  { name: "V2EX 酷工作", tag: "技术社区", url: "https://www.v2ex.com/go/jobs", description: "开发者社区中的技术岗位与团队直招信息" },
  { name: "工信人才网", tag: "信息技术 / 工业", url: "https://www.miitjob.cn/", description: "工业和信息化领域的软件、通信、电子与技术岗位" },
  { name: "开源中国招聘", tag: "信息技术", url: "https://www.oschina.net/job", description: "软件开发、开源生态与信息技术岗位" },
  { name: "国聘校园", tag: "国企 / 校招", url: "https://job.iguopin.com/jobList?channel=campus", description: "央企、国企与重点行业校园岗位" },
  { name: "国家大学生就业服务平台", tag: "国家平台", url: "https://gcu.ncss.cn/", description: "教育部就业服务、专场招聘与实习岗位" },
  { name: "中央企业应届生招聘", tag: "央企", url: "https://job.mohrss.gov.cn/qyzp/index.jhtml", description: "中央企业招聘应届高校毕业生信息" },
  { name: "国资委招聘", tag: "国资央企", url: "https://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html", description: "国务院国资委招聘公告汇总" },
];

function JobResourcesView() {
  return <><PageHead eyebrow="求职入口" title="寻找岗位" description="常用招聘平台集中跳转；打开后找到岗位，再回到收藏岗位保存链接与 JD。" />
    <div className="resources-grid">{jobResources.map((item) => <article className="resource-card" key={item.name}><div className="resource-mark">{item.name.slice(0, 1)}</div><div><span className="resource-badge">{item.tag}</span><h2>{item.name}</h2><p>{item.description}</p><small>{new URL(item.url).hostname}</small></div><Button asChild><a href={item.url} target="_blank" rel="noreferrer">访问平台<ExternalLink /></a></Button></article>)}</div>
    <section className="panel resource-note"><b>使用建议</b><p>外部平台可能要求登录或触发风控验证。本工具只提供官方入口，不代替你登录，也不会抓取账号数据。</p></section>
  </>;
}

function ApplicationsView({ items, resumes, settings, serverNow, onAdd, onEdit, onDelete, onMove, onChecklist, onUnlink, onOptimize }: { items: RecordItem[]; resumes: StoredFile[]; settings: Record<string, any>; serverNow?: string; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onMove: (item: RecordItem, stage: string) => void; onChecklist: (item: RecordItem, key: string, done: boolean) => void; onUnlink: (item: RecordItem) => void; onOptimize: (item: RecordItem) => void }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("updated");
  const [mode, setMode] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const tabStages: Record<string, string[]> = { all: stageOrder, prepare: ["待投递", "已投递"], written: ["笔试中"], interview: ["面试中", "OFFER"] };
  const filtered = items.filter((item) => `${item.data.company} ${item.data.role} ${item.data.location}`.toLowerCase().includes(query.toLowerCase()) && tabStages[tab].includes(item.data.stage || "待投递")).sort((a, b) => {
    if (sort === "company") return String(a.data.company).localeCompare(String(b.data.company), "zh-CN");
    if (sort === "deadline") return new Date(a.data.deadline || "2999-12-31").getTime() - new Date(b.data.deadline || "2999-12-31").getTime();
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const card = (item: RecordItem) => { const resume = resumes.find((file) => file.id === item.data.resumeId); const completed = Object.values(item.data.checklist || {}).filter((entry: any) => typeof entry === "boolean" ? entry : entry?.done).length; return <article draggable key={item.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}><div className="job-card-head"><span>{String(item.data.company || "?").slice(0, 1)}</span><div><h3>{item.data.company}</h3><p>{item.data.role}</p></div></div><div className="job-meta"><span>{item.data.location || "地点待定"}</span><span>{item.data.priority || "普通"}</span></div>{resume && <small>简历：{resume.metadata.displayName || resume.filename}</small>}<small>执行清单：{completed}/7</small><JobDeadlineNotice data={item.data} settings={settings} serverNow={serverNow} /><footer>{item.data.sourceUrl && <a href={item.data.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />原岗位</a>}<button onClick={() => setSelected(item)}><Eye />详情</button><button onClick={() => onEdit(item)}><Pencil />编辑</button><button onClick={() => onDelete(item.id)}><Trash2 />删除</button></footer></article>; };
  return <><PageHead eyebrow="投递管理" title="每个机会都有下一步" description="看板拖动会记录阶段变化；列表视图便于筛选、排序与集中核对。" action={<Button onClick={onAdd}><Plus />新增投递</Button>} />
    <div className="pipeline-tabs">{[["all","全部"],["prepare","准备简历"],["written","笔试邀约"],["interview","面试邀约"]].map(([value,label]) => <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{label}<span>{items.filter((item) => tabStages[value].includes(item.data.stage || "待投递")).length}</span></button>)}</div>
    <div className="toolbar application-toolbar"><div className="searchbox"><Search /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索公司、岗位或城市" /></div><div className="toolbar-controls"><label>排序<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="company">公司名称</option></select></label><div className="view-toggle"><Button variant={mode === "board" ? "default" : "outline"} size="icon" aria-label="看板视图" onClick={() => setMode("board")}><Columns3 /></Button><Button variant={mode === "list" ? "default" : "outline"} size="icon" aria-label="列表视图" onClick={() => setMode("list")}><List /></Button></div></div></div>
    {items.length ? mode === "board" ? <div className="kanban">{stageOrder.filter((stage) => tabStages[tab].includes(stage)).map((stage) => <section key={stage} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const item = items.find((candidate) => candidate.id === e.dataTransfer.getData("text/plain")); if (item) onMove(item, stage); }}><header><b>{stageLabel(stage)}</b><span>{filtered.filter((item) => (item.data.stage || "待投递") === stage).length}</span></header><div>{filtered.filter((item) => (item.data.stage || "待投递") === stage).map(card)}</div></section>)}</div> : <div className="application-table"><div className="application-row head"><span>公司与岗位</span><span>阶段</span><span>截止风险</span><span>关联简历</span><span>操作</span></div>{filtered.map((item) => { const resume = resumes.find((file) => file.id === item.data.resumeId); return <div className="application-row" key={item.id}><span><b>{item.data.company}</b><small>{item.data.role} · {item.data.location || "地点待定"}</small></span><span><StatusPill>{stageLabel(item.data.stage || "待投递")}</StatusPill></span><span><JobDeadlineNotice data={item.data} settings={settings} serverNow={serverNow} /></span><span>{resume?.metadata.displayName || resume?.filename || "未关联"}</span><span className="row-actions">{item.data.sourceUrl && <a href={item.data.sourceUrl} target="_blank" rel="noreferrer" aria-label="查看原岗位"><ExternalLink /></a>}<button onClick={() => setSelected(item)} aria-label="查看详情"><Eye /></button><button onClick={() => onEdit(item)} aria-label="编辑"><Pencil /></button><button onClick={() => onDelete(item.id)} aria-label="删除"><Trash2 /></button></span></div>; })}</div> : <EmptyState icon={BriefcaseBusiness} title="还没有投递记录" text="添加一个目标岗位，从 JD、简历到面试都可以围绕它持续积累。" action={<Button onClick={onAdd}><Plus />新增第一条投递</Button>} />}
    {selected && <ApplicationDetail item={items.find((item) => item.id === selected.id) || selected} resume={resumes.find((file) => file.id === selected.data.resumeId)} settings={settings} serverNow={serverNow} onClose={() => setSelected(null)} onEdit={() => onEdit(selected)} onChecklist={(key, done) => onChecklist(selected, key, done)} onUnlink={() => { onUnlink(selected); setSelected(null); }} onOptimize={() => { setSelected(null); onOptimize(selected); }} />}
  </>;
}

const checklistLabels: Record<string, string> = { research: "完成公司背调", analysis: "完成岗位分析", resumeSelected: "选择投递简历", resumeOptimized: "核对简历优化", submitted: "完成正式投递", followedUp: "完成一次跟进", interviewScheduled: "安排面试日程" };
function ApplicationDetail({ item, resume, settings, serverNow, onClose, onEdit, onChecklist, onUnlink, onOptimize }: { item: RecordItem; resume?: StoredFile; settings: Record<string, any>; serverNow?: string; onClose: () => void; onEdit: () => void; onChecklist: (key: string, done: boolean) => void; onUnlink: () => void; onOptimize: () => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="application-detail-dialog"><DialogHeader><DialogTitle>{item.data.company} · {item.data.role}</DialogTitle><DialogDescription>{stageLabel(item.data.stage || "待投递")} · 最近更新 {formatDate(item.updatedAt, true)}</DialogDescription></DialogHeader><JobDeadlineNotice data={item.data} settings={settings} serverNow={serverNow} /><div className="application-detail-grid"><section><h3>投递执行清单</h3><div className="checklist">{Object.entries(checklistLabels).map(([key, label]) => { const entry = item.data.checklist?.[key]; const done = typeof entry === "boolean" ? entry : Boolean(entry?.done); return <label key={key}><input type="checkbox" checked={done} onChange={(e) => onChecklist(key, e.target.checked)} /><span>{label}</span>{done && typeof entry === "object" && entry?.at && <small>{formatDate(entry.at, true)}</small>}</label>; })}</div></section><section><h3>联系与投递信息</h3><dl className="detail-list"><div><dt>招聘方式</dt><dd>{item.data.recruitmentMode || (item.data.deadline ? "固定截止" : "滚动招聘")}</dd></div><div><dt>官方截止</dt><dd>{formatDate(item.data.deadline)}</dd></div><div><dt>投递时间</dt><dd>{formatDate(item.data.appliedAt, true)}</dd></div><div><dt>渠道</dt><dd>{item.data.channel || "未填写"}</dd></div><div><dt>联系人 / 内推人</dt><dd>{item.data.contactName || item.data.contact || "未填写"}</dd></div><div><dt>联系方式</dt><dd>{item.data.contactValue || "未填写"}</dd></div><div><dt>下次跟进</dt><dd>{formatDate(item.data.nextFollowUpAt, true)}</dd></div><div><dt>关联简历</dt><dd>{resume?.metadata.displayName || resume?.filename || "未关联"}</dd></div></dl><div className="detail-actions"><Button variant="outline" onClick={onEdit}><Pencil />编辑完整信息</Button>{item.data.stage === "待投递" && <Button onClick={onOptimize}><Sparkles />去简历优化库</Button>}{resume && <Button variant="ghost" onClick={onUnlink}><X />取消简历关联</Button>}</div></section></div><ActivityTimeline entityId={item.id} /></DialogContent></Dialog>;
}

function ActivityTimeline({ entityId }: { entityId: string }) { const [events, setEvents] = useState<RecordItem[]>([]); useEffect(() => { api<{ events: RecordItem[] }>(`/api/activity?entityType=applications&entityId=${encodeURIComponent(entityId)}`).then((result) => setEvents(result.events)).catch(() => setEvents([])); }, [entityId]); return <section className="activity-timeline"><h3>操作时间线</h3>{events.length ? events.map((event) => <article key={event.id}><time>{formatDate(event.createdAt, true)}</time><div><b>{event.title}</b><small>{event.data.action || "记录更新"}</small></div></article>) : <p className="muted">还没有操作历史</p>}</section>; }

function TasksView({ items, applications, onChanged }: { items: RecordItem[]; applications: RecordItem[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [status, setStatus] = useState("active"); const visible = items.filter((item) => status === "all" ? true : status === "active" ? !["done", "dismissed"].includes(item.data.status) : item.data.status === status);
  const confirmation = useConfirmDialog();
  async function create(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), category: form.get("category"), priority: form.get("priority"), dueAt: form.get("dueAt"), notes: form.get("notes"), applicationId: form.get("applicationId"), entityType: form.get("applicationId") ? "applications" : "", entityId: form.get("applicationId") || "", status: "todo", createdBy: "user", aiJobId: "", checklistKey: "", sourceRefs: [] }) }); setOpen(false); onChanged(); toast.success("行动任务已创建"); } catch (error) { toast.error((error as Error).message); } }
  async function update(item: RecordItem, data: Record<string, any>) { try { await api("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, version: item.version, data }) }); onChanged(); } catch (error) { toast.error((error as Error).message); } }
  async function remove(item: RecordItem) { if (!await confirmation.ask("将任务移入回收站？", "任务将在回收站保留30天，期间可以恢复。")) return; await api(`/api/tasks?id=${item.id}&version=${item.version}`, { method: "DELETE" }); onChanged(); }
  return <><PageHead eyebrow="行动清单" title="把分析结论变成下一步" description="手动任务与带来源的 AI 建议集中管理；有日期的任务会自动进入求职日历。" action={<Button onClick={() => setOpen(true)}><Plus />新增任务</Button>} /><div className="pipeline-tabs task-tabs">{[["active","待处理"],["todo","待办"],["doing","进行中"],["done","已完成"],["all","全部"]].map(([value,label]) => <button className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>{label}</button>)}</div>{visible.length ? <div className="task-list">{visible.map((item) => { const app = applications.find((entry) => entry.id === item.data.applicationId); return <article key={item.id} className={`task-card ${item.data.status}`}><button className="task-check" aria-label="标记完成" onClick={() => update(item, { status: item.data.status === "done" ? "todo" : "done" })}>{item.data.status === "done" ? <CheckCircle2 /> : <span />}</button><div><div className="tag-row"><span>{({ resume: "简历", evidence: "事实补充", application: "投递", follow_up: "跟进", interview: "面试", deadline: "截止事项", custom: "自定义" } as any)[item.data.category] || item.data.category}</span>{item.data.createdBy === "ai" && <span>AI · 有引用</span>}</div><h2>{item.data.title}</h2><p>{item.data.notes || (app ? `${app.data.company} · ${app.data.role}` : "")}</p><small>{item.data.dueAt ? `截止 ${formatDate(item.data.dueAt, true)}` : "未设置日期"}</small></div><div className="task-actions"><select value={item.data.status} onChange={(e) => update(item, { status: e.target.value })}><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option><option value="dismissed">已忽略</option></select><button onClick={() => remove(item)} aria-label="删除任务"><Trash2 /></button></div></article>; })}</div> : <EmptyState icon={ListChecks} title="没有符合条件的任务" text="从岗位分析、简历建议、面试复盘中创建行动项，或手动添加下一步。" action={<Button onClick={() => setOpen(true)}><Plus />添加任务</Button>} />}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>新增行动任务</DialogTitle><DialogDescription>设置日期后会自动进入求职日历和 ICS 导出。</DialogDescription></DialogHeader><form onSubmit={create}><div className="editor-grid"><Field label="任务标题"><Input name="title" required /></Field><Field label="任务类型"><select name="category" defaultValue="custom"><option value="resume">简历</option><option value="evidence">事实补充</option><option value="application">投递</option><option value="follow_up">跟进</option><option value="interview">面试</option><option value="deadline">截止事项</option><option value="custom">自定义</option></select></Field><Field label="优先级"><select name="priority" defaultValue="normal"><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></Field><Field label="截止时间"><Input name="dueAt" type="datetime-local" /></Field><Field label="关联投递"><select name="applicationId"><option value="">不关联</option>{applications.map((item) => <option value={item.id} key={item.id}>{item.data.company} · {item.data.role}</option>)}</select></Field><Field label="备注"><Textarea name="notes" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit">保存任务</Button></DialogFooter></form></DialogContent></Dialog>{confirmation.dialog}</>;
}

function EvidenceView({ items, onAdd, onEdit, onDelete }: { items: RecordItem[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void }) {
  const confirmed = items.filter((item) => item.data.status === "confirmed");
  const skills = new Set(items.flatMap((item) => Array.isArray(item.data.skills) ? item.data.skills : String(item.data.skills || "").split(/[,，]/)).filter(Boolean));
  return <><PageHead eyebrow="候选人事实库" title="AI 只使用你确认过的事实" description="每条事实都有来源、行动和结果；缺少证据时只标记缺口。" action={<Button onClick={onAdd}><Plus />添加事实</Button>} />
    <section className="mini-metrics"><article><span>已确认</span><strong>{confirmed.length}</strong></article><article><span>待补充</span><strong>{items.length - confirmed.length}</strong></article><article><span>能力标签</span><strong>{skills.size}</strong></article></section>
    {items.length ? <div className="evidence-grid">{items.map((item) => <article key={item.id} className={item.data.status === "confirmed" ? "confirmed" : "draft"}><header><div><h2>{item.data.title}</h2><p>{item.data.source || "手动添加"}</p></div><StatusPill tone={item.data.status === "confirmed" ? "green" : "orange"}>{item.data.status === "confirmed" ? "已确认" : "待补充"}</StatusPill></header><dl><div><dt>背景 / 任务</dt><dd>{item.data.context || "未填写"}</dd></div><div><dt>你的行动</dt><dd>{item.data.action || "未填写"}</dd></div><div><dt>结果 / 证据</dt><dd>{item.data.result || "未填写"}</dd></div></dl><div className="tag-row">{(Array.isArray(item.data.skills) ? item.data.skills : String(item.data.skills || "").split(/[,，]/)).filter(Boolean).map((skill: string) => <span key={skill}>{skill}</span>)}</div><footer><small>事实 ID：{item.id.slice(0, 8)}</small><div><button onClick={() => onEdit(item)}><Pencil />编辑</button><button onClick={() => onDelete(item.id)}><Trash2 />删除</button></div></footer></article>)}</div> : <EmptyState icon={Database} title="事实库还是空的" text="先添加一段可以在面试中解释和验证的经历，AI 才能安全地生成表达。" action={<Button onClick={onAdd}><Plus />添加第一条事实</Button>} />}
  </>;
}

function AnalysisView({ input, setInput, busy, result, onRun, onEvidence, onCreateTask }: { input: { title: string; jd: string }; setInput: (next: { title: string; jd: string }) => void; busy: boolean; result: Record<string, any> | null; onRun: () => void; onEvidence: () => void; onCreateTask: (task: Record<string, any>) => void }) {
  return <><PageHead eyebrow="岗位证据矩阵" title="每一个匹配结论都有依据" description="模型负责提取与映射，最终分数按公开权重公式计算。" />
    <div className="analysis-layout"><section className="panel form-panel"><Field label="岗位名称"><Input value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} placeholder="例如：字节跳动商业化产品经理" /></Field><Field label="完整职位描述"><Textarea className="jd-input" value={input.jd} onChange={(e) => setInput({ ...input, jd: e.target.value })} placeholder="粘贴岗位职责、任职要求和加分项…" /></Field><div className="privacy-note"><CheckCircle2 /><span><b>严格事实模式</b>仅匹配事实库中状态为“已确认”的内容。</span></div><Button size="lg" disabled={busy || input.jd.length < 40} onClick={onRun}>{busy ? <RefreshCw className="spin" /> : <Sparkles />}{busy ? "正在建立证据矩阵…" : "生成证据矩阵"}</Button></section><section className="panel analysis-summary">{result ? <><div className="score-ring" style={{ "--score": `${result.score || 0}%` } as React.CSSProperties}><strong>{result.score ?? "—"}</strong><span>证据覆盖</span></div><h2>{result.summary || "分析已完成"}</h2><p>必备项权重 3、重要项权重 2、加分项权重 1；强匹配计 100%，部分匹配计 55%。</p></> : <EmptyState icon={Sparkles} title="等待分析" text="输入 JD 后，系统会把要求、事实依据、缺口和下一步动作放在同一张表里。" />}</section></div>
    {result && <section className="panel matrix-panel"><div className="panel-title"><div><h2>要求与证据</h2><p>无引用的内容不会被标记为匹配</p></div><Button variant="outline" onClick={onEvidence}>管理事实库</Button></div>{Array.isArray(result.requirements) ? <div className="matrix-table"><div className="matrix-row head"><span>岗位要求</span><span>重要度</span><span>覆盖</span><span>依据与理由</span></div>{result.requirements.map((item: any, index: number) => <div className="matrix-row" key={index}><span><b>{item.label}</b></span><span>{item.importance === "must" ? "必备" : item.importance === "important" ? "重要" : "加分"}</span><span><StatusPill tone={item.coverage === "strong" ? "green" : item.coverage === "partial" ? "orange" : "red"}>{item.coverage === "strong" ? "强匹配" : item.coverage === "partial" ? "部分匹配" : "缺少证据"}</StatusPill></span><span><p>{item.reason}</p><small>{(item.evidenceIds || []).map((id: string) => `#${id.slice(0, 8)}`).join("、") || "没有可引用事实"}</small></span></div>)}</div> : null}{Array.isArray(result.suggestions) && <div className="suggestion-grid">{result.suggestions.map((item: any, index: number) => { const refs = (item.evidenceIds || []).map((id: string) => ({ type: "evidence", id })); const quoteRefs = (item.sourceQuotes || []).map((quote: string, quoteIndex: number) => ({ type: "resume_quote", id: `${index}-${quoteIndex}`, quote })); const sourceRefs = refs.length ? refs : quoteRefs; return <article key={index}><span>建议 {index + 1}</span><h3>{item.issue}</h3><p>{item.suggestion}</p><small>风险：{item.risk || "无"}</small>{result.aiJobId && sourceRefs.length > 0 && <Button variant="outline" onClick={() => onCreateTask({ title: item.issue, category: refs.length ? "evidence" : "resume", priority: "normal", dueAt: "", notes: item.suggestion, entityType: "analysis", entityId: result.aiJobId, applicationId: "", checklistKey: refs.length ? "analysis" : "resumeOptimized", aiJobId: result.aiJobId, sourceRefs })}><ListChecks />加入行动清单</Button>}</article>; })}</div>}</section>}
  </>;
}

const aiTypeLabels: Record<string, string> = { job_analysis: "岗位分析", resume_suggestions: "简历建议", company_research: "公司背调", interview_review: "面试复盘", foreign_interview_review: "外企英文面试点评", transcription: "录音转写", evaluation_case: "合成评测", job_capture_url: "岗位链接提取", job_capture_image: "岗位截图识别" };
const aiStatusLabels: Record<string, string> = { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", cancelled: "已取消" };

function FeishuView({ resumes, records, onDataChanged }: { resumes: StoredFile[]; records: Record<Kind, RecordItem[]>; onDataChanged: () => Promise<void> }) {
  const [status, setStatus] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<any[]>([]);
  const [syncRun, setSyncRun] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [minutesText, setMinutesText] = useState("");
  const [minutesRun, setMinutesRun] = useState<any>(null);
  const [resumeImportRun, setResumeImportRun] = useState<any>(null);
  const [acceptanceRun, setAcceptanceRun] = useState<any>(null);
  const [interviewId, setInterviewId] = useState(records.interviews[0]?.id || "");
  const [documentImport, setDocumentImport] = useState({ token: "", title: "", entityId: records.applications[0]?.id || records.interviews[0]?.id || "" });
  const confirmation = useConfirmDialog();

  const reload = useCallback(async () => {
    const [connection, history, health] = await Promise.all([api<any>("/api/integrations/feishu"), api<any>("/api/integrations/feishu/runs"), api<any>("/api/integrations/feishu/diagnostics")]);
    setStatus(connection); setRuns(history.runs || []); setDiagnostic(health);
    const acceptanceRuns = (history.runs || []).filter((run: any) => run.runType === "acceptance_suite"); const actionableAcceptance = acceptanceRuns.find((run: any) => run.status !== "cleaned") || acceptanceRuns[0]; if (actionableAcceptance) setAcceptanceRun(actionableAcceptance);
  }, []);
  useEffect(() => { reload().catch((error) => toast.error(error.message)); }, [reload]);

  async function action(name: string, task: () => Promise<void>) {
    setBusy(name); try { await task(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(""); }
  }
  const connection = status?.connection;
  const config = connection?.config || {};
  const connected = connection?.status === "connected";
  const bootstrapped = Boolean(config.bitableAppToken && config.tableId && config.rootFolderToken);
  const requiredReady = Boolean(diagnostic?.requiredReady);

  async function bootstrap() {
    await action("bootstrap", async () => { await api("/api/integrations/feishu/bootstrap", { method: "POST" }); await reload(); toast.success("飞书专用空间已准备好"); });
  }
  async function previewSync() {
    await action("preview", async () => { const result = await api<any>("/api/integrations/feishu/sync/preview", { method: "POST" }); setSyncRun(result.run); setDecisions(Object.fromEntries(result.run.preview.items.map((item: any) => [item.id, item.defaultDecision]))); toast.success("同步预览已生成，尚未改动任何数据"); });
  }
  async function commitSync() {
    if (!syncRun) return;
    await action("commit", async () => { const result = await api<any>(`/api/integrations/feishu/sync/${syncRun.id}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: syncRun.version, decisions: syncRun.preview.items.map((item: any) => ({ itemId: item.id, action: decisions[item.id] || item.defaultDecision })) }) }); setSyncRun(null); await Promise.all([reload(), onDataChanged()]); if (result.run.status === "partial") toast.error("部分项目未能同步，请查看审计记录后重新预览"); else toast.success("投递记录同步完成"); });
  }
  async function loadFiles() {
    await action("files", async () => { const result = await api<any>("/api/integrations/feishu/files?folder=resumes"); setRemoteFiles(result.files || []); });
  }
  async function exportResume(id: string) {
    await action(`resume-${id}`, async () => { const result = await api<any>(`/api/integrations/feishu/resumes/${id}/export`, { method: "POST" }); toast.success(result.duplicate ? "该简历已在飞书中" : "简历已导出到飞书"); await loadFiles(); });
  }
  async function importResume(file: any) {
    const type = String(file.type || file.name?.split(".").pop() || "").toLowerCase();
    await action(`remote-${file.token}`, async () => { const result = await api<any>("/api/integrations/feishu/resumes/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remoteFileToken: file.token, name: file.name, type, size: Number(file.size || 0) }) }); setResumeImportRun(result.run); toast.success("导入预览已生成，尚未保存文件"); });
  }
  async function commitResumeImport() { if (!resumeImportRun) return; await action("resume-import", async () => { await api("/api/integrations/feishu/resumes/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: resumeImportRun.id, version: resumeImportRun.version }) }); setResumeImportRun(null); await Promise.all([reload(), onDataChanged()]); toast.success("简历已导入私有文件库"); }); }
  async function runAcceptance() { await action("acceptance", async () => { const result = await api<any>("/api/integrations/feishu/acceptance", { method: "POST" }); setAcceptanceRun(result.run); await reload(); toast.success(result.run.status === "succeeded" ? "合成验收已完成" : "验收存在失败项，请查看步骤"); }); }
  async function cleanupAcceptance() { if (!acceptanceRun || !await confirmation.ask("清理本次飞书验收数据？", "只会删除当前验收批次创建的合成对象，不会触碰其他本地或飞书数据。", true)) return; await action("acceptance-cleanup", async () => { const result = await api<any>(`/api/integrations/feishu/acceptance/${acceptanceRun.id}/cleanup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, version: acceptanceRun.version }) }); setAcceptanceRun(result.run); await Promise.all([reload(), onDataChanged()]); toast.success(result.run.status === "cleaned" ? "验收数据已清理" : "部分远程对象清理失败，可重试"); }); }
  async function exportReport(item: RecordItem, mode: "update" | "copy") {
    await action(`report-${item.id}`, async () => { const result = await api<any>("/api/integrations/feishu/reports/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordId: item.id, kind: item.kind, mode }) }); toast.success(result.updated ? "原飞书文档已追加更新" : "报告已生成飞书文档"); if (result.document?.url) window.open(result.document.url, "_blank", "noopener,noreferrer"); });
  }
  async function importDocumentSnapshot() {
    const target = [...records.applications, ...records.saved_jobs, ...records.research, ...records.interviews].find((item) => item.id === documentImport.entityId);
    if (!target || !documentImport.token.trim() || !documentImport.title.trim()) return toast.error("请填写文档标识、标题并选择关联记录");
    await action("document-import", async () => { await api("/api/integrations/feishu/reports/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentToken: documentImport.token.trim(), documentType: "docx", title: documentImport.title.trim(), entityType: target.kind, entityId: target.id }) }); setDocumentImport((current) => ({ ...current, token: "", title: "" })); toast.success("飞书文档已保存为只读快照，不会进入事实库"); });
  }
  async function previewMinutes() {
    await action("minutes", async () => { const result = await api<any>("/api/integrations/feishu/minutes/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: minutesUrl || undefined, text: minutesText || undefined }) }); setMinutesRun(result.run); toast.success("妙记转写预览已生成"); });
  }
  async function previewMinutesFile(file: File) {
    await action("minutes", async () => { const form = new FormData(); form.set("file", file); const result = await api<any>("/api/integrations/feishu/minutes/preview", { method: "POST", body: form }); setMinutesRun(result.run); setMinutesText(result.run.preview.transcript || ""); toast.success("转写文件预览已生成"); });
  }
  async function commitMinutes() {
    if (!minutesRun || !interviewId) return toast.error("请选择面试记录");
    await action("minutes-commit", async () => { await api("/api/integrations/feishu/minutes/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: minutesRun.id, runVersion: minutesRun.version, interviewId }) }); setMinutesRun(null); setMinutesText(""); setMinutesUrl(""); await onDataChanged(); toast.success("转写文本已写入面试记录"); });
  }

  if (!status) return <div className="panel integration-loading"><RefreshCw className="spin" />正在读取飞书连接状态…</div>;
  return <>
    <PageHead eyebrow="FEISHU INTEGRATION" title="飞书同步中心" description="OFFER 收割机仍是唯一主数据源；所有远程变更先预览、再由你确认。" action={<Button variant="outline" onClick={() => reload()} disabled={Boolean(busy)}><RefreshCw />刷新状态</Button>} />
    {!status.configured ? <section className="panel feishu-setup"><div className="setup-icon"><AlertTriangle /></div><div><h2>尚未配置飞书自建应用</h2><p>当前页面安全可用，但连接按钮暂不显示。请在 Sites 生产环境中配置下列三项机密，然后重新发布。</p><div className="secret-list">{status.missing.map((item: string) => <code key={item}>{item}</code>)}</div><ol><li>飞书开放平台创建“中国版企业自建应用”，可用范围仅自己。</li><li>添加回调地址：<code>{status.callbackUrl}</code></li><li>开通用户身份、云空间文件、云文档/文档块、多维表格权限；需要直接导入妙记时再开通妙记读取。</li><li>发布应用，再把 App ID 和 App Secret 配置为站点机密。</li></ol></div></section> : !connected ? <section className="panel feishu-setup"><div className="setup-icon"><RefreshCw /></div><div><h2>{connection?.status === "needs_reauth" ? "飞书授权需要更新" : "连接你的飞书账号"}</h2><p>{connection?.lastError || "授权只用于你主动发起的同步、导入和导出。"}</p><Button asChild><a href="/api/integrations/feishu/connect">前往飞书授权</a></Button></div></section> : <>
      <section className="integration-summary">
        <article className="panel"><StatusPill tone="green">已连接</StatusPill><h2>{connection.externalUserName || "飞书账号"}</h2><p>令牌已在服务端加密保存，浏览器无法读取。</p><Button variant="outline" onClick={() => action("disconnect", async () => { await api("/api/integrations/feishu/disconnect", { method: "POST" }); await reload(); toast.success("已断开连接，本地数据与飞书文件均保留"); })} disabled={busy === "disconnect"}>断开连接</Button></article>
        <article className="panel"><StatusPill tone={bootstrapped ? "green" : requiredReady ? "blue" : "orange"}>{bootstrapped ? "空间已就绪" : requiredReady ? "等待初始化" : "权限待补齐"}</StatusPill><h2>OFFER 收割机专用空间</h2><p>{bootstrapped ? "文件夹、投递多维表格与字段映射已保存；重复初始化不会再创建一套。" : requiredReady ? "首次初始化会创建简历、分析报告、面试复盘文件夹和投递记录多维表格。" : "必需权限未全部授权，初始化与同步已安全禁用。"}</p>{bootstrapped ? <div className="integration-links"><a href={config.rootFolderUrl} target="_blank" rel="noreferrer">打开专用文件夹 <ExternalLink /></a><a href={config.bitableUrl} target="_blank" rel="noreferrer">打开投递表格 <ExternalLink /></a></div> : requiredReady ? <Button onClick={bootstrap} disabled={busy === "bootstrap"}>{busy === "bootstrap" ? <RefreshCw className="spin" /> : <Plus />}初始化专用空间</Button> : <Button asChild><a href="/api/integrations/feishu/connect">重新授权</a></Button>}</article>
      </section>
      <section className="panel diagnostic-panel"><div className="panel-title"><div><h2>连接诊断</h2><p>{diagnostic?.tenantFingerprint ? `租户指纹 ${diagnostic.tenantFingerprint} · ` : ""}令牌到期 {formatDate(diagnostic?.tokenExpiresAt, true)}</p></div><StatusPill tone={requiredReady ? "green" : "orange"}>{requiredReady ? "必需能力通过" : "缺少必需权限"}</StatusPill></div><div className="capability-grid">{(diagnostic?.capabilities || []).map((item: any) => <article key={item.id} className={item.granted ? "ready" : "missing"}><b>{item.granted ? "已授权" : item.required ? "必需" : "可选"} · {item.label}</b><small>{item.granted ? item.matchedScopes.join("、") : item.hint}</small></article>)}</div>{!requiredReady && <p className="integration-warning">请到飞书开放平台为当前自建应用补齐缺失权限，再点击“重新授权”。本页不会在权限不足时创建半套资源。</p>}</section>
      <section className="panel acceptance-panel"><div className="panel-title"><div><h2>测试企业 · 一键合成验收</h2><p>只创建带批次标识的虚拟投递、虚拟简历和虚拟报告；不要在测试企业放入真实求职资料。</p></div><Button onClick={runAcceptance} disabled={!requiredReady || Boolean(busy)}>{busy === "acceptance" ? <RefreshCw className="spin" /> : <CheckCircle2 />}开始验收</Button></div>{acceptanceRun && <div className="acceptance-result"><div><StatusPill tone={acceptanceRun.status === "succeeded" || acceptanceRun.status === "cleaned" ? "green" : "orange"}>{acceptanceRun.status}</StatusPill><b>{acceptanceRun.result?.tag || acceptanceRun.preview?.tag || acceptanceRun.id}</b></div><div className="acceptance-steps">{(acceptanceRun.result?.steps || []).map((step: any) => <span key={step.id} className={step.status}><CheckCircle2 />{step.label}</span>)}</div>{acceptanceRun.status !== "cleaned" && <Button variant="outline" onClick={cleanupAcceptance} disabled={Boolean(busy)}>一键清理本批次</Button>}</div>}</section>
      {bootstrapped && <>
        <section className="panel sync-panel"><div className="panel-title"><div><h2>投递记录双向同步</h2><p>仅生成预览不会修改任何一侧；冲突默认保留 OFFER 收割机版本。</p></div><Button onClick={previewSync} disabled={Boolean(busy)}>{busy === "preview" ? <RefreshCw className="spin" /> : <RefreshCw />}生成同步预览</Button></div>
          {syncRun ? <div className="sync-preview"><div className="sync-counts"><span>本地 {syncRun.preview.localCount}</span><span>飞书 {syncRun.preview.remoteCount}</span><span>待确认 {syncRun.preview.items.filter((item: any) => item.type !== "unchanged").length}</span></div>{syncRun.preview.items.length ? <div className="sync-items">{syncRun.preview.items.map((item: any) => <article key={item.id}><div><StatusPill tone={item.type === "conflict" ? "orange" : item.type.includes("invalid") || item.type.includes("deletion") ? "red" : "blue"}>{({ local_only: "仅本地", remote_only: "仅飞书", push: "本地有更新", pull: "飞书有更新", conflict: "双向冲突", unchanged: "内容一致", deletion_warning: "删除提示", invalid_remote: "不可导入" } as any)[item.type]}</StatusPill><b>{item.local?.company || item.remote?.company || "未命名公司"} · {item.local?.role || item.remote?.role || "未命名岗位"}</b><small>{item.message}</small></div><select aria-label="同步处理方式" value={decisions[item.id] || item.defaultDecision} onChange={(event) => setDecisions((current) => ({ ...current, [item.id]: event.target.value }))} disabled={["invalid_remote", "deletion_warning", "unchanged"].includes(item.type)}><option value="local">使用本地版本</option><option value="remote">使用飞书版本</option><option value="skip">跳过</option></select></article>)}</div> : <EmptyState icon={CheckCircle2} title="两侧暂无记录" text="添加投递记录后再生成预览。" />}<div className="sync-submit"><small>预览有效期至 {formatDate(syncRun.expiresAt, true)}</small><Button onClick={commitSync} disabled={busy === "commit"}>{busy === "commit" ? <RefreshCw className="spin" /> : <CheckCircle2 />}确认并执行</Button></div></div> : null}
        </section>
        <div className="integration-columns">
          <section className="panel integration-module"><div className="panel-title"><div><h2>简历文件</h2><p>原文件副本在两侧分别保存，导入必须先预览。</p></div><Button variant="outline" onClick={loadFiles} disabled={busy === "files"}><RefreshCw />读取飞书</Button></div><div className="compact-list"><h3>本地简历</h3>{resumes.length ? resumes.map((file) => <article key={file.id}><span><b>{file.metadata.displayName || file.filename}</b><small>{fileSize(file.size)}</small></span><Button variant="outline" onClick={() => exportResume(file.id)} disabled={Boolean(busy)}>导出</Button></article>) : <p className="muted">本地暂无简历。</p>}<h3>飞书“简历”文件夹</h3>{remoteFiles.length ? remoteFiles.map((file) => { const supported = ["pdf", "docx", "doc"].includes(String(file.type || file.name?.split(".").pop() || "").toLowerCase()); return <article key={file.token}><span><b>{file.name}</b><small>{file.type || "文件"}</small></span>{supported ? <Button variant="outline" onClick={() => importResume(file)} disabled={Boolean(busy)}>预览导入</Button> : <small>该类型暂不导入</small>}</article>; }) : <p className="muted">点击“读取飞书”查看可导入文件。</p>}{resumeImportRun && <div className="import-confirm"><b>{resumeImportRun.preview.file.name}</b><small>{resumeImportRun.preview.duplicateLocalId ? "已导入过，不能重复导入" : `类型 ${resumeImportRun.preview.extension.toUpperCase()} · 将校验文件头与 20 MB 限制`}</small><Button onClick={commitResumeImport} disabled={Boolean(busy) || Boolean(resumeImportRun.preview.duplicateLocalId)}>确认导入</Button></div>}</div></section>
          <section className="panel integration-module"><div className="panel-title"><div><h2>分析报告与文档快照</h2><p>导出为飞书原生文档；导入只读快照不会进入事实库。</p></div></div><div className="compact-list">{[...records.analyses, ...records.research, ...records.interviews.filter((item) => item.data.review)].slice(0, 12).map((item) => <article key={item.id}><span><b>{item.title}</b><small>{item.kind === "interviews" ? "面试复盘" : item.kind === "research" ? "公司背调" : "岗位分析"}</small></span><span className="compact-actions"><Button variant="outline" onClick={() => exportReport(item, "update")} disabled={Boolean(busy)}>更新</Button><Button variant="outline" onClick={() => exportReport(item, "copy")} disabled={Boolean(busy)}>另存</Button></span></article>)}{![...records.analyses, ...records.research, ...records.interviews.filter((item) => item.data.review)].length && <p className="muted">生成分析、背调或复盘后可在此导出。</p>}<h3>导入飞书文档快照</h3><div className="document-import"><Input value={documentImport.token} onChange={(event) => setDocumentImport((current) => ({ ...current, token: event.target.value }))} placeholder="飞书文档 Token" /><Input value={documentImport.title} onChange={(event) => setDocumentImport((current) => ({ ...current, title: event.target.value }))} placeholder="快照标题" /><select value={documentImport.entityId} onChange={(event) => setDocumentImport((current) => ({ ...current, entityId: event.target.value }))}><option value="">选择关联记录</option>{[...records.applications, ...records.saved_jobs, ...records.research, ...records.interviews].map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button variant="outline" onClick={importDocumentSnapshot} disabled={Boolean(busy)}>保存快照</Button></div></div></section>
        </div>
        <section className="panel minutes-panel"><div className="panel-title"><div><h2>妙记与转写文本导入</h2><p>{config.minutesAvailable ? "当前授权包含妙记能力，也可使用文件/文本降级入口。" : "当前租户未授予妙记 API；直接链接入口已隐藏，请使用 TXT、DOCX、SRT 或文本。"}</p></div></div><div className="minutes-form">{config.minutesAvailable && <Field label="飞书妙记链接"><Input value={minutesUrl} onChange={(event) => setMinutesUrl(event.target.value)} placeholder="https://.../minutes/..." /></Field>}<Field label="转写文本（可直接粘贴）"><Textarea value={minutesText} onChange={(event) => setMinutesText(event.target.value)} placeholder="粘贴妙记导出的转写文本；导入前会生成预览" rows={6} /></Field><label className="upload-button secondary">读取 TXT / DOCX / SRT<input type="file" accept=".txt,.docx,.srt,text/plain,application/x-subrip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await previewMinutesFile(file); event.target.value = ""; }} /></label><Button onClick={previewMinutes} disabled={Boolean(busy) || (!minutesText.trim() && !minutesUrl.trim())}>生成导入预览</Button></div>{minutesRun && <div className="minutes-preview"><h3>{minutesRun.preview.title}</h3><p>{minutesRun.preview.characterCount} 字 · 尚未写入面试记录</p><pre>{minutesRun.preview.transcript.slice(0, 4000)}</pre><div><select value={interviewId} onChange={(event) => setInterviewId(event.target.value)}><option value="">选择面试记录</option>{records.interviews.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button onClick={commitMinutes}>确认导入</Button></div></div>}
        </section>
      </>}
    </>}
    {runs.length > 0 && <section className="panel run-history"><div className="panel-title"><div><h2>同步审计记录</h2><p>保留预览、决定、结果与部分失败信息。</p></div></div>{runs.slice(0, 12).map((run) => <article key={run.id}><StatusPill tone={run.status === "succeeded" || run.status === "cleaned" ? "green" : run.status === "partial" || run.status === "failed" ? "orange" : "blue"}>{run.status}</StatusPill><span><b>{({ application_sync: "投递记录同步", acceptance_suite: "合成全链路验收", minutes_import: "妙记导入", resume_import: "简历导入", resume_export: "简历导出", report_export: "报告导出" } as Record<string, string>)[run.runType] || "飞书集成任务"}</b><small>{formatDate(run.createdAt, true)}</small></span><small>{run.error || (run.runType === "acceptance_suite" ? `${run.result?.steps?.filter((step: any) => step.status === "succeeded").length ?? 0} 个步骤通过` : `成功 ${run.result?.succeeded ?? 0} 项`)}</small></article>)}</section>}{confirmation.dialog}
  </>;
}

function AICenterView({ jobs, legacy, activeId, attempts, evaluation, onSelect, onRetry, onCancel, onRefresh, onRunEvaluation, onNavigate }: { jobs: AIJob[]; legacy: any[]; activeId: string | null; attempts: any[]; evaluation: Record<string, any> | null; onSelect: (id: string) => void; onRetry: (id: string) => void; onCancel: (id: string) => void; onRefresh: () => void; onRunEvaluation: () => void; onNavigate: (view: View) => void }) {
  const [type, setType] = useState(""); const [status, setStatus] = useState(""); const [date, setDate] = useState("");
  const filtered = jobs.filter((job) => (!type || job.type === type) && (!status || job.status === status) && (!date || job.createdAt.slice(0, 10) === date));
  const active = jobs.find((job) => job.id === activeId) || filtered[0];
  const recent = jobs.filter((job) => Date.now() - new Date(job.createdAt).getTime() <= 7 * 86400000); const succeeded = recent.filter((job) => job.status === "succeeded"); const latestFailure = jobs.find((job) => job.status === "failed");
  const navigateTarget = active?.type === "company_research" ? "company" : active?.type === "foreign_interview_review" ? "foreignPrep" : active?.type === "interview_review" || active?.type === "transcription" ? "interviews" : "analysis";
  return <><PageHead eyebrow="AI 任务中心" title="每次分析都能复核、重试和追溯" description="记录输入快照、来源、模型、提示版本、耗时和每次尝试；取消后的迟到结果不会写入正式记录。" action={<div className="head-actions"><Button variant="outline" onClick={onRefresh}><RefreshCw />刷新</Button><Button onClick={onRunEvaluation}><Sparkles />运行 20 组合成回归</Button></div>} />
    <section className="mini-metrics ai-health"><article><span>近7天任务</span><strong>{recent.length}</strong></article><article><span>成功率</span><strong>{recent.length ? Math.round(succeeded.length / recent.length * 100) : 100}%</strong></article><article><span>运行中</span><strong>{jobs.filter((job) => ["queued", "running"].includes(job.status)).length}</strong></article><article><span>最近失败</span><strong>{latestFailure ? formatDate(latestFailure.createdAt, true) : "无"}</strong><small>{latestFailure?.errorCode || "当前无失败记录"}</small></article></section>
    {evaluation && <section className={`evaluation-banner ${evaluation.passed ? "passed" : ""}`}><div><b>合成回归：{evaluation.completed || 0}/{evaluation.total || 20}</b><span>只使用内置合成简历事实与 JD，不读取你的真实资料。</span></div><div><strong>F1 {Math.round((evaluation.f1 || 0) * 100)}%</strong><span>无效引用 {evaluation.invalidReferenceCount || 0} · 编造事实 {evaluation.unsupportedFactCount || 0} · Schema {Math.round((evaluation.schemaPassRate || 0) * 100)}% · 建议引用覆盖 {Math.round((evaluation.citationCoverageRate || 0) * 100)}%</span><span>首轮成功 {Math.round((evaluation.firstAttemptSuccessRate || 0) * 100)}% · 重试成功 {Math.round((evaluation.retrySuccessRate || 0) * 100)}% · P50 {Math.round((evaluation.p50Ms || 0) / 1000)}s · P95 {Math.round((evaluation.p95Ms || 0) / 1000)}s · Token {evaluation.totalTokens || 0}</span></div></section>}
    <section className="ai-filters panel"><label>任务类型<select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部</option>{Object.entries(aiTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{Object.entries(aiStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>日期<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></section>
    <div className="ai-center-layout"><section className="panel ai-job-list">{filtered.length ? filtered.map((job) => <button key={job.id} className={active?.id === job.id ? "active" : ""} onClick={() => onSelect(job.id)}><span className={`ai-status ${job.status}`}>{aiStatusLabels[job.status] || job.status}</span><b>{aiTypeLabels[job.type] || job.type}</b><small>{formatDate(job.createdAt, true)} · {job.model}</small>{job.errorMessage && <em>{job.errorMessage}</em>}</button>) : <EmptyState icon={ListChecks} title="没有符合条件的任务" text="执行岗位分析、简历建议、背调或面试复盘后，记录会出现在这里。" />}{legacy.length > 0 && <div className="legacy-jobs"><b>旧版记录</b><p>以下记录在审计管线建立前生成，缺少完整追溯字段，不会补造。</p>{legacy.map((item) => <span key={item.id}>{item.title}<small>{formatDate(item.createdAt, true)}</small></span>)}</div>}</section>
      <section className="panel ai-job-detail">{active ? <><header><div><span className={`ai-status ${active.status}`}>{aiStatusLabels[active.status]}</span><h2>{aiTypeLabels[active.type]}</h2><p>{active.id}</p></div><div>{["queued", "running"].includes(active.status) && <Button variant="outline" onClick={() => onCancel(active.id)}>取消</Button>}{["failed", "cancelled"].includes(active.status) && <Button onClick={() => onRetry(active.id)}><RefreshCw />重试</Button>}{active.status === "succeeded" && active.type !== "evaluation_case" && <Button variant="outline" onClick={() => onNavigate(navigateTarget)}><ExternalLink />查看业务结果</Button>}</div></header><dl className="ai-audit-grid"><div><dt>模型</dt><dd>{active.model}</dd></div><div><dt>提示版本</dt><dd>{active.promptVersion}</dd></div><div><dt>耗时</dt><dd>{active.elapsedMs == null ? "—" : `${(active.elapsedMs / 1000).toFixed(1)} 秒`}</dd></div><div><dt>置信度</dt><dd>{active.confidence || "—"}</dd></div></dl>{active.errorMessage && <div className="ai-error"><AlertTriangle /><span><b>{active.errorCode}</b>{active.errorMessage}</span></div>}<section><h3>输入快照</h3><pre>{JSON.stringify(active.inputSnapshot, null, 2)}</pre></section><section><h3>来源引用</h3><pre>{JSON.stringify(active.sourceRefs, null, 2)}</pre></section>{active.result && <section><h3>结果摘要</h3><pre>{JSON.stringify(active.result, null, 2)}</pre></section>}<section><h3>尝试历史</h3>{attempts.length ? <div className="attempt-list">{attempts.map((attempt) => <div key={attempt.id}><b>第 {attempt.attemptNumber} 次 · {aiStatusLabels[attempt.status] || attempt.status}</b><span>{formatDate(attempt.startedAt, true)} · {attempt.model}</span>{attempt.errorMessage && <small>{attempt.errorCode}：{attempt.errorMessage}</small>}</div>)}</div> : <p className="muted">选择任务后查看完整尝试记录。</p>}</section></> : <EmptyState icon={ListChecks} title="还没有 AI 任务" text="先从岗位分析、简历库、公司背调或面试复盘发起一次真实任务。" />}</section></div>
  </>;
}

const researchStages = [
  { key: "screening", title: "投递前初筛", time: "约 10 分钟", description: "核对主体合法性、经营状态、公司规模、业务基本盘和明显司法风险。" },
  { key: "interview", title: "面试前深挖", time: "决定是否投入面试", description: "重点查员工待遇、真实工时、人员稳定、业务线地位、技术栈与招聘风评。" },
  { key: "offer", title: "Offer 前终核", time: "签约前最后把关", description: "核对签约主体、薪资福利、社保公积金、试用期、部门地点和书面条款。" },
];

const researchCategories = [
  ["basic", "公司基本信息"], ["business", "主营业务与产品"], ["prospects", "发展前景"], ["employee", "员工待遇与工作体验"], ["latest", "最新动态"],
  ["compliance", "工商、司法与合规"], ["role", "岗位与业务线"], ["recruitment", "招聘风评"], ["offer", "Offer 条款核验"],
] as const;

const researchTools = [
  { name: "国家企业信用信息公示系统", note: "工商登记、经营异常、严重违法失信", url: "https://www.gsxt.gov.cn/", official: true },
  { name: "信用中国", note: "行政处罚、失信与信用信息", url: "https://www.creditchina.gov.cn/", official: true },
  { name: "中国裁判文书网", note: "公开裁判文书；注意同名主体与样本缺失", url: "https://wenshu.court.gov.cn/", official: true },
  { name: "中国执行信息公开网", note: "被执行人、失信被执行与限制消费", url: "https://zxgk.court.gov.cn/", official: true },
  { name: "企查查", note: "商业聚合查询，关键信息回官方源复核", url: "https://www.qcc.com/", official: false },
  { name: "天眼查", note: "商业聚合查询，关键信息回官方源复核", url: "https://www.tianyancha.com/", official: false },
  { name: "看准网", note: "员工评价与薪资样本，注意偏差和时效", url: "https://www.kanzhun.com/", official: false },
  { name: "牛客网", note: "校招进度、面经和招聘风评", url: "https://www.nowcoder.com/", official: false },
  { name: "脉脉", note: "员工与业务线线索，匿名内容需交叉核验", url: "https://maimai.cn/", official: false },
];

function ResearchFindingEditor({ report, onSave }: { report: RecordItem; onSave: (report: RecordItem, value: string) => Promise<void> | void }) {
  const [value, setValue] = useState(String(report.data.personalFindings || ""));
  const [saving, setSaving] = useState(false);
  return <section className="personal-findings"><div><h3>个人发现</h3><p>只作为你的未核验线索保存，不会自动变成报告事实或事实库证据。</p></div><Textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="例如：学长反馈该部门近期调整较多；HR 口头承诺 15 薪，待书面确认……" /><Button variant="outline" disabled={saving || value === String(report.data.personalFindings || "")} onClick={async () => { setSaving(true); await onSave(report, value); setSaving(false); }}><Save />{saving ? "保存中…" : "保存个人发现"}</Button></section>;
}

function ResearchView({ draft, setDraft, busy, reports, onRun, onSaveFindings, onDelete }: { draft: ResearchDraft; setDraft: (value: ResearchDraft) => void; busy: boolean; reports: RecordItem[]; onRun: () => void; onSaveFindings: (report: RecordItem, value: string) => Promise<void> | void; onDelete: (id: string) => void }) {
  const update = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const stageLabel = (value: string) => researchStages.find((item) => item.key === value)?.title || "阶段未记录";
  const verdictLabel: Record<string, string> = { recommended: "可继续推进", proceed_with_caution: "谨慎推进", insufficient_information: "信息不足", avoid: "建议放弃" };
  const natureLabel: Record<string, string> = { fact: "公开事实", inference: "分析推断", review_claim: "口碑线索" };
  return <><PageHead eyebrow="公司背调" title="三阶段反向尽调，来源不足就不下结论" description="从投递前初筛到 Offer 前终核；公开事实、分析推断、匿名口碑和个人发现严格分开。" />
    <section className="research-workflow">{researchStages.map((stage, index) => <button key={stage.key} className={draft.researchStage === stage.key ? "active" : ""} onClick={() => update("researchStage", stage.key)}><span>{index + 1}</span><div><b>{stage.title}</b><small>{stage.time}</small><p>{stage.description}</p></div></button>)}</section>
    <section className="research-form panel"><div className="research-form-grid"><Field label="公司完整名称（尽量填写工商主体）"><Input value={draft.company} onChange={(event) => update("company", event.target.value)} placeholder="例如：××科技（杭州）有限公司" /></Field><Field label="公司类型"><select value={draft.companyType} onChange={(event) => update("companyType", event.target.value)}><option value="unknown">暂不确定</option><option value="large_tech">大厂 / 集团</option><option value="mid_size">中厂 / 成熟企业</option><option value="startup">小公司 / 初创</option><option value="soe_bank">国企 / 银行 / 研究所</option><option value="outsourcing">外包 / 派遣</option><option value="other">其他</option></select></Field><Field label="目标岗位"><Input value={draft.targetRole} onChange={(event) => update("targetRole", event.target.value)} placeholder="例如：Java 后端开发" /></Field><Field label="部门 / 业务线"><Input value={draft.businessLine} onChange={(event) => update("businessLine", event.target.value)} placeholder="未知可留空，报告会列为待确认" /></Field><Field label="个人发现（未核验线索）"><Textarea value={draft.personalFindings} onChange={(event) => update("personalFindings", event.target.value)} placeholder="粘贴校友反馈、HR 口头说法、你观察到的异常；AI 只把它当检索线索。" /></Field><Field label="Offer / 口头承诺（待核对）"><Textarea value={draft.offerDetails} onChange={(event) => update("offerDetails", event.target.value)} placeholder="例如签约主体、月薪×月数、绩效、试用期、社保公积金、部门与城市；未到 Offer 阶段可留空。" /></Field></div><div className="research-submit"><p><AlertTriangle />联网信息可能不完整；涉及匿名评价会标为“口碑线索”，不会当作已核实事实。</p><Button disabled={busy || !draft.company.trim()} onClick={onRun}>{busy ? <RefreshCw className="spin" /> : <Building2 />}{busy ? "正在分层检索与交叉核对…" : `生成${stageLabel(draft.researchStage)}报告`}</Button></div></section>
    <section className="research-legal panel"><AlertTriangle /><div><h3>法律口径提示</h3><p>试用期不是统一“最长 6 个月”，上限取决于劳动合同期限；试用期工资还需同时满足法定比例与当地最低工资。三方协议违约金也不存在全国统一“不得超过 5000 元”的通用规则，应以协议、学校政策和适用法律为准。以下报告用于求职决策辅助，不替代法律意见。</p><div><a href="https://www.npc.gov.cn/zgrdw/npc/xinwen/lfgz/zxfl/2007-06/29/content_368169.htm" target="_blank" rel="noreferrer">劳动合同法（中国人大网）<ExternalLink /></a><a href="https://chinajob.mohrss.gov.cn/c/2024-07-12/411982.shtml" target="_blank" rel="noreferrer">高校毕业生就业法律知识（中国就业网）<ExternalLink /></a></div></div></section>
    {reports.length ? <div className="report-list">{reports.map((report) => { const sources = report.data.sources || []; const findings = report.data.findings || []; const legacy = !Array.isArray(report.data.findings); return <article className="panel report research-report" key={report.id}><header><div><div className="report-badges"><StatusPill tone={report.data.verdict === "avoid" ? "red" : report.data.verdict === "proceed_with_caution" ? "orange" : "blue"}>{verdictLabel[report.data.verdict] || "旧版报告"}</StatusPill><span>{stageLabel(report.data.researchStage)}</span><span>置信度 {report.data.confidence === "high" ? "高" : report.data.confidence === "medium" ? "中" : "低"}</span></div><h2>{report.data.company || report.title}</h2><p>{formatDate(report.data.generatedAt, true)} · {report.data.targetRole || "未指定岗位"}{report.data.businessLine ? ` · ${report.data.businessLine}` : ""}</p></div><button aria-label="删除背调报告" onClick={() => onDelete(report.id)}><Trash2 /></button></header><p className="report-overview">{report.data.overview}</p>{legacy ? <div className="report-columns"><section><h3>旧版已核实线索</h3><ul>{(report.data.facts || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>风险与不确定性</h3><ul>{(report.data.risks || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>面试建议确认</h3><ul>{(report.data.questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section></div> : <div className="research-finding-groups">{researchCategories.map(([key, label]) => { const entries = findings.filter((item: any) => item.category === key); return <section key={key}><h3>{label}<span>{entries.length}</span></h3>{entries.length ? entries.map((item: any, itemIndex: number) => <article className={`research-finding severity-${item.severity}`} key={`${item.title}-${itemIndex}`}><div><b>{item.title}</b><span>{natureLabel[item.nature] || item.nature}{item.asOf ? ` · ${item.asOf}` : ""}</span></div><p>{item.detail}</p>{item.sourceIndexes?.length ? <div className="finding-sources">{item.sourceIndexes.map((sourceIndex: number) => sources[sourceIndex] ? <a key={sourceIndex} href={sources[sourceIndex].url} target="_blank" rel="noreferrer">来源 {sourceIndex + 1}<ExternalLink /></a> : null)}</div> : null}</article>) : <p className="research-empty">当前公开检索未形成可追溯结论，需手动核查。</p>}</section>; })}</div>} {!legacy && <section className="research-recommendations"><h3>综合建议与分析</h3><p>{report.data.overallEvaluation}</p><div><section><h4>应聘建议</h4><ul>{(report.data.applicationAdvice || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h4>面试建议</h4><ul>{(report.data.interviewAdvice || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h4>Offer 前建议</h4><ul>{(report.data.offerAdvice || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section className="risk-list"><h4>风险提示</h4><ul>{(report.data.risks || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section></div><section className="questions"><h4>需要向 HR / 面试官确认</h4><ul>{(report.data.questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section>{report.data.limitations?.length ? <section className="limitations"><h4>信息缺口</h4><ul>{report.data.limitations.map((item: string) => <li key={item}>{item}</li>)}</ul></section> : null}</section>}<ResearchFindingEditor key={`${report.id}-${report.version}`} report={report} onSave={onSaveFindings} /><footer><h3>报告来源（仅保留千问联网接口返回的真实来源）</h3>{sources.length ? <div className="source-list">{sources.map((source: any, index: number) => <a key={index} href={source.url} target="_blank" rel="noreferrer"><b>{index + 1}. {source.title}</b><small>{source.publishedAt || "发布日期未知"} · 抓取 {formatDate(source.crawledAt, true)}</small></a>)}</div> : <p className="research-empty">未返回可核验来源，因此不能把报告内容视为已核实事实。</p>}</footer></article>; })}</div> : <EmptyState icon={Building2} title="还没有背调报告" text="选择阶段并填写公司后才会联网检索；不会展示预设或虚构报告。" />}
    <section className="research-tools panel"><div className="panel-title"><div><h2>手动背调工具箱</h2><p>官方渠道优先；商业聚合和匿名评价只用于发现线索，关键结论回到原始来源复核。</p></div></div><div>{researchTools.map((tool) => <a key={tool.name} href={tool.url} target="_blank" rel="noreferrer"><span>{tool.official ? "官方" : "辅助"}</span><b>{tool.name}</b><p>{tool.note}</p><ExternalLink /></a>)}</div></section>
  </>;
}

function InterviewView({ items, active, recording, onSelect, onAdd, onEdit, onDelete, onSave, onRecord, onAudio, onTranscribe, onReview, onCreateTask }: { items: RecordItem[]; active?: RecordItem; audioFiles: StoredFile[]; recording: boolean; onSelect: (id: string) => void; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onSave: (data: Record<string, any>) => void; onRecord: () => void; onAudio: (file: File) => void; onTranscribe: () => void; onReview: (transcript?: string) => void; onCreateTask: (task: Record<string, any>) => void }) {
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(active?.data.transcript || ""), [active?.id, active?.data.transcript]);
  return <><PageHead eyebrow="面试辅导" title="准备、录音、转写、复盘" description="点评引用你的原话，不把 AI 生成内容当成真实经历。" action={<Button onClick={onAdd}><Plus />新建面试</Button>} />
    {items.length ? <div className="interview-layout"><aside className="panel interview-list">{items.map((item) => <button className={active?.id === item.id ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}><b>{item.data.company || "未命名公司"}</b><span>{item.data.role} · {item.data.round || "面试"}</span><small>{formatDate(item.data.scheduledAt, true)}</small></button>)}</aside>{active && <section className="panel interview-detail"><header><div><span>{active.data.round || "面试记录"}</span><h2>{active.data.company} · {active.data.role}</h2><p>{formatDate(active.data.scheduledAt, true)}</p></div><div><Button variant="outline" onClick={() => onEdit(active)}><Pencil />编辑</Button><Button variant="ghost" size="icon" onClick={() => onDelete(active.id)}><Trash2 /></Button></div></header><div className="recording-actions"><Button variant={recording ? "destructive" : "outline"} onClick={onRecord}>{recording ? <Square /> : <Mic />}{recording ? "停止并保存" : "开始录音"}</Button><label className="secondary-upload"><Upload />上传音频<input type="file" accept="audio/*,video/webm,video/mp4" onChange={(e) => e.target.files?.[0] && onAudio(e.target.files[0])} /></label><Button variant="outline" disabled={!active.data.audioFileId && !active.data.audioSegments?.length} onClick={onTranscribe}><Sparkles />转写录音</Button></div><Field label="转写或复盘文本"><Textarea className="transcript" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="录音转写会出现在这里，也可以手动粘贴面试记录。" /></Field><div className="detail-actions"><Button variant="outline" onClick={() => onSave({ transcript: draft })}><Save />保存文本</Button><Button disabled={draft.length < 30} onClick={() => onReview(draft)}><Sparkles />生成 AI 复盘</Button></div>{active.data.review && <div className="review-board"><div><h3>复盘摘要</h3><p>{active.data.review.summary}</p></div><div className="review-columns"><section><h3>做得较好</h3><ul>{(active.data.review.strengths || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>需要补强</h3><ul>{(active.data.review.gaps || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>下一步行动</h3><ul>{(active.data.review.actions || []).map((item: string) => <li key={item}><span>{item}</span>{active.data.review.aiJobId && active.data.review.quotes?.length ? <Button size="sm" variant="outline" onClick={() => onCreateTask({ title: item, category: "interview", status: "todo", priority: "normal", dueAt: "", notes: `来自 ${active.data.company} · ${active.data.round || "面试"} 的复盘建议`, entityType: "interview", entityId: active.id, applicationId: active.data.applicationId || "", checklistKey: "", aiJobId: active.data.review.aiJobId, sourceRefs: [{ type: "transcript", id: active.id, quote: active.data.review.quotes[0] }] })}><Plus />加入行动清单</Button> : null}</li>)}</ul></section></div>{active.data.review.quotes?.length ? <blockquote>“{active.data.review.quotes[0]}”<small>点评依据的原话</small></blockquote> : null}</div>}</section>}</div> : <EmptyState icon={MessagesSquare} title="还没有面试记录" text="新建面试后可以录音、上传音频、编辑转写并生成复盘。" action={<Button onClick={onAdd}><Plus />新建第一次面试</Button>} />}
  </>;
}

function annualComp(data: Record<string, any>) { return Number(data.baseMonthly || 0) * Number(data.months || 12) + Number(data.bonus || 0) + Number(data.equity || 0) + Number(data.allowance || 0); }

function OffersView({ items, weights, setWeights, onAdd, onEdit, onDelete }: { items: RecordItem[]; weights: Record<string, number>; setWeights: (next: any) => void; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void }) {
  const maxComp = Math.max(...items.map((item) => annualComp(item.data)), 1);
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const scored = items.map((item) => { const data = item.data; const score = Math.round(((annualComp(data) / maxComp * 100) * weights.salary + Number(data.growth || 5) * 10 * weights.growth + Number(data.platform || 5) * 10 * weights.platform + Number(data.balance || 5) * 10 * weights.balance + Number(data.outlook || 5) * 10 * weights.outlook) / totalWeight); return { item, score }; }).sort((a, b) => b.score - a.score);
  return <><PageHead eyebrow="OFFER 决策" title="把显性收入和隐性成本放在一起" description="总包与加权分数由确定性公式计算，权重变化会立即重算。" action={<Button onClick={onAdd}><Plus />添加 OFFER</Button>} />
    <div className="offer-layout"><section className="panel weight-card"><div className="panel-title"><div><h2>我的决策权重</h2><p>总权重自动归一化</p></div></div>{Object.entries({ salary: "薪资待遇", growth: "成长空间", platform: "公司平台", balance: "工作生活", outlook: "行业前景" }).map(([key, label]) => <label className="weight-row" key={key}><span>{label}<b>{weights[key]}</b></span><input type="range" min="5" max="50" value={weights[key]} onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })} /></label>)}</section><section className="panel formula-card"><CircleDollarSign /><h2>统一口径</h2><p>年总包 = 月基本薪资 × 薪资月数 + 现金奖金 + 年化股票 + 年度补贴。</p><p>工作地点、通勤、工时和风险不折算成虚假货币数值，而是进入偏好维度评分。</p></section></div>
    {items.length ? <div className="offer-grid">{scored.map(({ item, score }, index) => <article key={item.id} className={index === 0 ? "winner" : ""}><header><div><span>{index === 0 ? "当前更符合偏好" : "候选 OFFER"}</span><h2>{item.data.company}</h2><p>{item.data.role} · {item.data.city || "地点待定"}</p></div><strong>{score}</strong></header><div className="annual"><span>税前年总包估算</span><b>¥ {annualComp(item.data).toLocaleString("zh-CN")}</b></div><dl><div><dt>月薪 × 月数</dt><dd>{Number(item.data.baseMonthly || 0).toLocaleString()} × {item.data.months || 12}</dd></div><div><dt>奖金 / 股票</dt><dd>{Number(item.data.bonus || 0).toLocaleString()} / {Number(item.data.equity || 0).toLocaleString()}</dd></div><div><dt>通勤 / 工时</dt><dd>{item.data.commute || "—"} / {item.data.hours || "—"}</dd></div><div><dt>接受截止</dt><dd>{formatDate(item.data.deadline)}</dd></div></dl>{item.data.risk && <p className="risk"><AlertTriangle />{item.data.risk}</p>}<footer><Button variant="outline" onClick={() => onEdit(item)}><Pencil />编辑</Button><Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}><Trash2 /></Button></footer></article>)}</div> : <EmptyState icon={Scale} title="还没有 OFFER" text="录入真实薪酬和偏好维度后，系统再进行统一口径比较。" action={<Button onClick={onAdd}><Plus />添加第一份 OFFER</Button>} />}
  </>;
}

function parseCalendarDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
}

function CalendarView({ items, applications, interviews, offers, tasks, onAdd, onEdit, onDelete, onExport }: { items: RecordItem[]; applications: RecordItem[]; interviews: RecordItem[]; offers: RecordItem[]; tasks: RecordItem[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onExport: () => void }) {
  const today = new Date();
  const [mode, setMode] = useState<"day" | "week" | "month">("month");
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const dateKey = (value: Date | string) => { const date = typeof value === "string" ? parseCalendarDate(value) : value; return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; };
  const events: Array<{ id: string; date: string; title: string; type: string; durationMinutes: number; allDay: boolean; item?: RecordItem }> = [
    ...items.map((item) => ({ id: item.id, date: String(item.data.dueAt || ""), title: item.data.title, type: item.data.type || "提醒", durationMinutes: Number(item.data.durationMinutes || 60), allDay: false, item })),
    ...applications.filter((item) => item.data.deadline).map((item) => ({ id: `a-${item.id}`, date: String(item.data.deadline), title: `${item.data.company} · ${item.data.role}`, type: "投递截止", durationMinutes: 30, allDay: true })),
    ...interviews.filter((item) => item.data.scheduledAt).map((item) => ({ id: `i-${item.id}`, date: String(item.data.scheduledAt), title: `${item.data.company} · ${item.data.round || "面试"}`, type: "面试", durationMinutes: Number(item.data.durationMinutes || 60), allDay: false })),
    ...offers.filter((item) => item.data.deadline).map((item) => ({ id: `o-${item.id}`, date: String(item.data.deadline), title: `${item.data.company} · OFFER`, type: "OFFER 截止", durationMinutes: 30, allDay: true })),
    ...tasks.filter((item) => item.data.dueAt && !["done", "dismissed"].includes(item.data.status)).map((item) => ({ id: `t-${item.id}`, date: String(item.data.dueAt), title: item.data.title, type: "行动任务", durationMinutes: Number(item.data.durationMinutes || 45), allDay: !String(item.data.dueAt).includes("T") })),
  ].filter((event) => event.date && Number.isFinite(parseCalendarDate(event.date).getTime())).sort((a, b) => parseCalendarDate(a.date).getTime() - parseCalendarDate(b.date).getTime());
  const weekStart = new Date(anchor); weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  const visibleDays = mode === "day" ? [anchor] : Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const firstWeekday = (month.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday);
  const monthDays = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const viewEvents = events.filter((event) => mode === "month" ? parseCalendarDate(event.date).getFullYear() === month.getFullYear() && parseCalendarDate(event.date).getMonth() === month.getMonth() : visibleDays.some((day) => dateKey(day) === dateKey(event.date)));
  const move = (direction: number) => setAnchor((current) => { const next = new Date(current); if (mode === "month") next.setMonth(next.getMonth() + direction); else next.setDate(next.getDate() + direction * (mode === "week" ? 7 : 1)); return next; });
  const periodTitle = mode === "month" ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月` : mode === "day" ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(anchor) : `${visibleDays[0].getMonth() + 1}月${visibleDays[0].getDate()}日 – ${visibleDays[6].getMonth() + 1}月${visibleDays[6].getDate()}日`;
  const tone = (type: string) => type.includes("面试") ? "interview" : type.includes("OFFER") ? "offer" : type.includes("截止") ? "deadline" : "";
  return <><PageHead eyebrow="求职日历" title="日、周、月三个维度安排求职" description="日视图与周视图按 24 小时垂直排布；投递截止、面试、OFFER 与行动任务自动汇入。" action={<div className="head-actions"><Button variant="outline" disabled={!events.length} onClick={onExport}><Download />导出全部 ICS</Button><Button onClick={onAdd}><Plus />添加日程</Button></div>} />
    <section className="panel calendar-shell"><div className="calendar-toolbar"><Button variant="outline" onClick={() => setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}>今天</Button><div><Button variant="ghost" size="icon" aria-label="上一时间段" onClick={() => move(-1)}><ChevronLeft /></Button><b>{periodTitle}</b><Button variant="ghost" size="icon" aria-label="下一时间段" onClick={() => move(1)}><ChevronRight /></Button></div><div className="calendar-modes">{(["day","week","month"] as const).map((value) => <button className={mode === value ? "active" : ""} key={value} onClick={() => setMode(value)}>{value === "day" ? "日" : value === "week" ? "周" : "月"}</button>)}</div></div>
      {mode === "month" ? <><div className="calendar-weekdays">{["周一","周二","周三","周四","周五","周六","周日"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{monthDays.map((day) => { const dayEvents = events.filter((event) => dateKey(event.date) === dateKey(day)); const outside = day.getMonth() !== month.getMonth(); const isToday = dateKey(day) === dateKey(today); return <button className={`calendar-day${outside ? " outside" : ""}${isToday ? " today" : ""}`} key={day.toISOString()} onClick={() => { setAnchor(day); setMode("day"); }}><b>{day.getDate()}</b><div>{dayEvents.slice(0, 3).map((event) => <span className={`event-chip ${tone(event.type)}`} title={`${event.type} · ${event.title}`} key={event.id}>{event.title}</span>)}{dayEvents.length > 3 && <small>还有 {dayEvents.length - 3} 项</small>}</div></button>; })}</div></> : <div className="time-calendar-scroll"><div className={`time-calendar ${mode}`}><div className="time-calendar-head"><span />{visibleDays.map((day) => <button className={dateKey(day) === dateKey(today) ? "today" : ""} key={day.toISOString()} onClick={() => { setAnchor(day); setMode("day"); }}><small>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day)}</small><b>{day.getDate()}</b></button>)}</div><div className="all-day-row"><span>全天</span>{visibleDays.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && dateKey(event.date) === dateKey(day)).map((event) => <span className={`event-chip ${tone(event.type)}`} key={event.id}>{event.title}</span>)}</div>)}</div><div className="time-calendar-body"><div className="hour-labels">{Array.from({ length: 24 }, (_, hour) => <span style={{ top: `${hour * 52}px` }} key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>{visibleDays.map((day) => <div className="time-day-column" key={day.toISOString()}>{events.filter((event) => !event.allDay && dateKey(event.date) === dateKey(day)).map((event) => { const date = parseCalendarDate(event.date); const top = (date.getHours() + date.getMinutes() / 60) * 52; const height = Math.max(30, event.durationMinutes / 60 * 52); return <button className={`time-event ${tone(event.type)}`} style={{ top, height }} key={event.id} title={`${event.type} · ${formatDate(event.date, true)}`} onClick={() => event.item && onEdit(event.item)}><b>{event.title}</b><small>{String(date.getHours()).padStart(2, "0")}:{String(date.getMinutes()).padStart(2, "0")} · {event.durationMinutes} 分钟</small></button>; })}</div>)}</div></div></div>}
    </section>
    {events.length ? <section className="calendar-agenda"><h2>{mode === "month" ? "本月节点" : mode === "week" ? "本周安排" : "当日安排"}</h2><div className="timeline">{viewEvents.map((event) => { const date = parseCalendarDate(event.date); return <article key={event.id}><time><b>{date.getDate()}</b><span>{new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(date)}</span></time><div><StatusPill>{event.type}</StatusPill><h2>{event.title}</h2><p>{formatDate(event.date, !event.allDay)}{event.item?.data.notes ? ` · ${event.item.data.notes}` : ""}</p></div>{event.item && <footer><button onClick={() => onEdit(event.item!)} aria-label="编辑日程"><Pencil /></button><button onClick={() => onDelete(event.item!.id)} aria-label="删除日程"><Trash2 /></button></footer>}</article>; })}</div></section> : <p className="calendar-empty">还没有求职节点。你可以添加日程，或在投递、面试和 OFFER 中填写日期。</p>}
  </>;
}

const editorFields: Record<Kind, Array<{ key: string; label: string; type?: string; options?: string[]; required?: boolean }>> = {
  applications: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "direction", label: "岗位方向" }, { key: "location", label: "工作地点" }, { key: "stage", label: "当前阶段", type: "select", options: stageOrder }, { key: "priority", label: "优先级", type: "select", options: ["高", "普通", "低"] }, { key: "recruitmentMode", label: "招聘方式", type: "select", options: ["自动判断", "滚动招聘", "固定截止"] }, { key: "deadline", label: "网申截止日期", type: "date" }, { key: "salary", label: "薪资范围" }, { key: "sourceUrl", label: "岗位链接", type: "url" }, { key: "channel", label: "投递渠道" }, { key: "contactName", label: "联系人 / 内推人" }, { key: "contactRole", label: "联系人身份" }, { key: "contactValue", label: "联系方式" }, { key: "lastContactAt", label: "最后联系时间", type: "datetime-local" }, { key: "nextFollowUpAt", label: "下次跟进时间", type: "datetime-local" }, { key: "resumeId", label: "关联简历", type: "resume" }, { key: "jd", label: "职位描述", type: "textarea" }, { key: "notes", label: "备注", type: "textarea" },
  ],
  saved_jobs: [],
  evidence: [
    { key: "title", label: "事实标题", required: true }, { key: "source", label: "来源简历 / 项目" }, { key: "status", label: "确认状态", type: "select", options: ["confirmed", "draft"] }, { key: "context", label: "背景与任务", type: "textarea", required: true }, { key: "action", label: "你的行动", type: "textarea", required: true }, { key: "result", label: "结果与证据", type: "textarea" }, { key: "skills", label: "能力标签（逗号分隔）" },
  ],
  interviews: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "round", label: "面试轮次" }, { key: "scheduledAt", label: "面试时间", type: "datetime-local" }, { key: "jd", label: "岗位描述", type: "textarea" }, { key: "notes", label: "准备重点", type: "textarea" },
  ],
  offers: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "city", label: "城市" }, { key: "baseMonthly", label: "月基本薪资（元）", type: "number" }, { key: "months", label: "薪资月数", type: "number" }, { key: "bonus", label: "年度现金奖金（元）", type: "number" }, { key: "equity", label: "年化股票（元）", type: "number" }, { key: "allowance", label: "年度补贴（元）", type: "number" }, { key: "growth", label: "成长空间 1–10", type: "number" }, { key: "platform", label: "公司平台 1–10", type: "number" }, { key: "balance", label: "工作生活 1–10", type: "number" }, { key: "outlook", label: "行业前景 1–10", type: "number" }, { key: "commute", label: "通勤" }, { key: "hours", label: "典型工时" }, { key: "deadline", label: "接受截止", type: "date" }, { key: "risk", label: "已知风险", type: "textarea" },
  ],
  reminders: [
    { key: "title", label: "日程标题", required: true }, { key: "type", label: "类型", type: "select", options: ["网申截止", "笔试", "面试", "OFFER 截止", "跟进", "其他"] }, { key: "dueAt", label: "日期与时间", type: "datetime-local", required: true }, { key: "durationMinutes", label: "持续时间（分钟）", type: "number" }, { key: "notes", label: "备注", type: "textarea" },
  ],
  tasks: [], analyses: [], research: [],
};

function RecordEditor({ editor, resumes, onClose, onSaved }: { editor: { kind: Kind; item?: RecordItem } | null; resumes: StoredFile[]; onClose: () => void; onSaved: (kind: Kind) => void }) {
  const [saving, setSaving] = useState(false);
  if (!editor) return null;
  const currentEditor = editor;
  const labels: Record<Kind, string> = { applications: "投递", saved_jobs: "收藏岗位", tasks: "行动任务", evidence: "事实", interviews: "面试", offers: "OFFER", reminders: "日程", analyses: "分析", research: "背调" };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget); const data: Record<string, any> = { ...(currentEditor.item?.data || {}) };
    for (const field of editorFields[currentEditor.kind]) { const value = form.get(field.key); data[field.key] = field.type === "number" ? Number(value || 0) : String(value || ""); }
    if (currentEditor.kind === "evidence") data.skills = String(data.skills || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    if (currentEditor.kind === "applications") data.resumeName = resumes.find((file) => file.id === data.resumeId)?.metadata.displayName || resumes.find((file) => file.id === data.resumeId)?.filename || "";
    try {
      if (currentEditor.item) await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: currentEditor.item.id, version: currentEditor.item.version, data }) });
      else await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: currentEditor.kind, data }) });
      onSaved(currentEditor.kind);
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{currentEditor.item ? "编辑" : "新增"}{labels[currentEditor.kind]}</DialogTitle><DialogDescription>保存后会立即同步到你的私人云端空间。</DialogDescription></DialogHeader><form onSubmit={submit}><div className="editor-grid">{editorFields[currentEditor.kind].map((field) => <Field key={field.key} label={field.label}>{field.type === "textarea" ? <Textarea name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || ""} /> : field.type === "select" ? <select name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || field.options?.[0]}>{field.options?.map((option) => <option key={option} value={option}>{option === "confirmed" ? "已确认" : option === "draft" ? "待补充" : option}</option>)}</select> : field.type === "resume" ? <select name={field.key} defaultValue={currentEditor.item?.data[field.key] || ""}><option value="">暂不关联</option>{resumes.map((file) => <option key={file.id} value={file.id}>{file.metadata.displayName || file.filename}</option>)}</select> : <Input name={field.key} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} max={field.key === "growth" || field.key === "platform" || field.key === "balance" || field.key === "outlook" ? 10 : undefined} defaultValue={currentEditor.item?.data[field.key] || (field.key === "months" ? 12 : field.key === "durationMinutes" ? 60 : "")} />}</Field>)}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <Save />}{saving ? "保存中…" : "保存"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function FilePreview({ file, onClose }: { file: StoredFile | null; onClose: () => void }) {
  const [text, setText] = useState(""); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!file) return; setText(String(file.metadata.previewText || "")); setVersion(file.version); if (!file.mimeType.includes("pdf")) api<any>(`/api/files/preview?id=${file.id}`).then((result) => { setText(result.text || ""); setVersion(result.version || file.version); }).catch(() => undefined); }, [file]);
  if (!file) return null;
  const isPdf = file.mimeType === "application/pdf";
  async function generate() { setBusy(true); try { const result = await api<any>("/api/files/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: file!.id, version }) }); setText(result.text); setVersion(result.version); toast.success("文本预览已生成"); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="preview-dialog"><DialogHeader><DialogTitle>{file.metadata.displayName || file.filename}</DialogTitle><DialogDescription>{file.filename} · {fileSize(file.size)}</DialogDescription></DialogHeader>{isPdf ? <iframe title="简历预览" src={`/api/files/content?id=${file.id}`} /> : text ? <div className="document-text-preview"><div><small>解析文本只用于核对内容，排版请查看原文件。</small><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载原文件</a></Button></div><pre>{text}</pre></div> : <div className="doc-preview-fallback"><FileText /><h3>{file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"} 原文件已安全保存</h3><p>{file.mimeType.includes("wordprocessing") ? "点击后在应用内解析正文，不会发送给第三方。" : "旧版 DOC 无法在浏览器稳定渲染；点击后会主动调用文档解析服务，并保存只读文本快照。"}</p><div className="card-actions"><Button onClick={generate} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Eye />}{busy ? "正在解析…" : "生成文本预览"}</Button><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载原文件</a></Button></div></div>}</DialogContent></Dialog>;
}
