"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  Bookmark,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type View = "dashboard" | "profile" | "resumes" | "savedJobs" | "applications" | "tasks" | "evidence" | "analysis" | "company" | "interviews" | "offers" | "calendar" | "resources" | "aiCenter";
type Kind = "applications" | "saved_jobs" | "tasks" | "evidence" | "interviews" | "offers" | "reminders" | "analyses" | "research";
type RecordItem = { id: string; kind: Kind; title: string; data: Record<string, any>; version: number; createdAt: string; updatedAt: string; deletedAt: string | null };
type StoredFile = { id: string; filename: string; mimeType: string; size: number; metadata: Record<string, any>; version: number; createdAt: string };
type Dashboard = { totalApplications: number; savedCount: number; interviewCount: number; offerCount: number; invitationRate: number; stageCounts: Record<string, number>; funnel: Record<string, number>; upcoming: Array<{ data: Record<string, any> }>; risks: Array<{ item: Record<string, any>; risk: { level: string; reason: string } }>; openTasks: Array<Record<string, any>>; pendingEvidence: number; recentApplications: Array<{ data: Record<string, any>; updatedAt: string }>; segments: Record<string, any[]>; settings: Record<string, any> };
type AIJob = { id: string; batchId?: string | null; type: string; status: string; inputSnapshot: Record<string, any>; sourceRefs: any[]; model: string; promptVersion: string; result: Record<string, any> | null; resultRecordId?: string | null; confidence?: string | null; elapsedMs?: number | null; errorCode?: string | null; errorMessage?: string | null; createdAt: string; startedAt?: string | null; finishedAt?: string | null };

const emptyDashboard: Dashboard = { totalApplications: 0, savedCount: 0, interviewCount: 0, offerCount: 0, invitationRate: 0, stageCounts: {}, funnel: {}, upcoming: [], risks: [], openTasks: [], pendingEvidence: 0, recentApplications: [], segments: {}, settings: {} };
const stageOrder = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"];

const nav = [
  { id: "dashboard" as View, label: "数据总览", icon: LayoutDashboard },
  { id: "profile" as View, label: "个人资料", icon: UserRound },
  { id: "resumes" as View, label: "简历库", icon: FileText },
  { id: "savedJobs" as View, label: "收藏岗位", icon: Bookmark },
  { id: "applications" as View, label: "投递看板", icon: BriefcaseBusiness },
  { id: "tasks" as View, label: "行动清单", icon: ListChecks },
  { id: "evidence" as View, label: "事实库", icon: Database },
  { id: "analysis" as View, label: "岗位分析", icon: Sparkles },
  { id: "aiCenter" as View, label: "AI 任务中心", icon: ListChecks },
  { id: "company" as View, label: "公司背调", icon: Building2 },
  { id: "interviews" as View, label: "面试复盘", icon: MessagesSquare },
  { id: "offers" as View, label: "OFFER 决策", icon: Scale },
  { id: "calendar" as View, label: "日程提醒", icon: CalendarDays },
  { id: "resources" as View, label: "寻找岗位", icon: Search },
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
  const [analysisInput, setAnalysisInput] = useState({ title: "", jd: "" });
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, any> | null>(null);
  const [company, setCompany] = useState("");
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
    if (!window.confirm("移入回收站？记录可在 30 天内恢复。")) return;
    try {
      await api("/api/records?id=" + encodeURIComponent(id), { method: "DELETE" });
      toast.success("已移入回收站", {
        duration: 10000,
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, restore: true }) });
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
    if (!window.confirm("移入回收站？原文件暂时不会被永久删除。")) return;
    try {
      await api("/api/files?id=" + encodeURIComponent(id), { method: "DELETE" });
      setResumes((items) => items.filter((item) => item.id !== id));
      toast.success("简历已移入回收站", {
        duration: 10000,
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api("/api/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, restore: true }) });
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
      await api("/api/applications/stage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, stage }) });
      toast.success(`已移动到「${stage}」`);
      refresh("applications");
    } catch (error) { toast.error((error as Error).message); }
  }

  async function toggleChecklist(item: RecordItem, key: string, done: boolean) {
    try { await api("/api/applications/checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, key, done }) }); await Promise.all([refresh("applications"), refresh("tasks")]); }
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
    const displayName = window.prompt("版本名称", file.name.replace(/\.[^.]+$/, "")) || file.name;
    const note = window.prompt("备注（可选）", "") || "";
    const target = window.prompt("目标岗位方向（可选）", "") || "";
    const toastId = toast.loading("正在上传简历…");
    try {
      const saved = await uploadFile(file, "resume", { displayName, note, target });
      setResumes((items) => [saved, ...items]);
      toast.success("简历版本已保存", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
    event.target.value = "";
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
      const response = await api<{ record: RecordItem }>("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "applications", data: { company: item.data.company, role: item.data.role, sourceUrl: item.data.sourceUrl, jd: item.data.jd, location: item.data.location, salary: item.data.salary, deadline: item.data.deadline, priority: item.data.priority || "普通", stage: "待投递", notes: item.data.notes || "", savedJobId: item.id, checklist: {} } }) });
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

  async function analyzeResume(file: StoredFile) {
    const jd = window.prompt("可粘贴目标岗位 JD；留空则做通用事实检查", analysisInput.jd) ?? "";
    const toastId = toast.loading("正在读取并分析简历，完成后会删除供应商临时文件…");
    try {
      const job = await createAndRunAI("resume_suggestions", { fileId: file.id, jd });
      setAnalysisResult({ ...(job.result || {}), aiJobId: job.id, sourceResume: file.metadata.displayName || file.filename });
      setView("analysis");
      toast.success("简历建议已生成", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function runResearch() {
    if (!company.trim()) return;
    setResearchBusy(true);
    try {
      await createAndRunAI("company_research", { company });
      await refresh("research");
      toast.success("背调报告已生成并保存");
    } catch (error) { toast.error((error as Error).message); }
    finally { setResearchBusy(false); }
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
    await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: activeInterview.id, data }) });
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
      return `BEGIN:VEVENT\r\nUID:${item.id}@offer-harvester\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\r\nDTSTART:${stamp}\r\nSUMMARY:${String(item.data.title || "求职提醒").replace(/[,;]/g, " ")}\r\nDESCRIPTION:${String(item.data.notes || "").replace(/\n/g, "\\n")}\r\nEND:VEVENT`;
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
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileNav(false); }}><Icon /><span>{label}</span>{id === "applications" && dashboard.totalApplications > 0 ? <em>{dashboard.totalApplications}</em> : null}</button>)}</nav>
        <div className="sidebar-foot"><b>数据归你所有</b><p>文件私有保存，AI 仅在你主动分析时读取。</p></div>
      </aside>
      {mobileNav && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}

      <main className="workspace">
        {migrationItems && <div className="migration-banner"><div><b>发现旧版保存在本机的记录</b><p>{migrationItems.applications.length} 条投递、{migrationItems.evidence.length} 条事实可迁移到云端。</p></div><div><Button variant="outline" onClick={() => setMigrationItems(null)}>忽略</Button><Button onClick={importOldData}>迁移记录</Button></div></div>}
        {activeAIJobId && view !== "aiCenter" && aiJobs.find((item) => item.id === activeAIJobId) && <button className="ai-task-strip" onClick={() => setView("aiCenter")}><ListChecks /><span><b>最近 AI 任务</b>{aiJobs.find((item) => item.id === activeAIJobId)?.status === "succeeded" ? "已完成，可查看完整追溯记录" : aiJobs.find((item) => item.id === activeAIJobId)?.status === "failed" ? "执行失败，输入已保留，可重试" : "正在处理或等待执行"}</span><ExternalLink /></button>}
        {view === "dashboard" && <DashboardView dashboard={dashboard} profile={profile} records={records} onNavigate={setView} onAdd={() => setEditor({ kind: "applications" })} />}
        {view === "profile" && <ProfileView profile={profile} saveState={saveState} onChange={updateProfile} onSave={() => saveProfile(profile)} onAvatar={async (file) => { const saved = await uploadFile(file, "avatar"); updateProfile("avatarFileId", saved.id); }} />}
        {view === "resumes" && <ResumeView resumes={resumes} applications={records.applications} onUpload={uploadResume} onPreview={setPreview} onDelete={deleteFile} onAnalyze={analyzeResume} />}
        {view === "savedJobs" && <SavedJobsView items={records.saved_jobs} screenshots={jobScreenshots} onSave={saveJob} onExtract={extractJob} onConfirm={confirmCapturedJob} onConvert={convertSavedJob} onDelete={(id) => deleteRecord("saved_jobs", id)} />}
        {view === "applications" && <ApplicationsView items={records.applications} resumes={resumes} onAdd={() => setEditor({ kind: "applications" })} onEdit={(item) => setEditor({ kind: "applications", item })} onDelete={(id) => deleteRecord("applications", id)} onMove={moveApplication} onChecklist={toggleChecklist} />}
        {view === "tasks" && <TasksView items={records.tasks} applications={records.applications} onChanged={() => refresh("tasks")} />}
        {view === "evidence" && <EvidenceView items={records.evidence} onAdd={() => setEditor({ kind: "evidence" })} onEdit={(item) => setEditor({ kind: "evidence", item })} onDelete={(id) => deleteRecord("evidence", id)} />}
        {view === "analysis" && <AnalysisView input={analysisInput} setInput={setAnalysisInput} busy={analysisBusy} result={analysisResult || records.analyses[0]?.data || null} onRun={runAnalysis} onEvidence={() => setView("evidence")} onCreateTask={createAIAction} />}
        {view === "aiCenter" && <AICenterView jobs={aiJobs} legacy={legacyAI} activeId={activeAIJobId} attempts={aiAttempts} evaluation={evaluation} onSelect={openAIJob} onRetry={retryAIJob} onCancel={cancelAIJob} onRefresh={refreshAIJobs} onRunEvaluation={runEvaluation} onNavigate={setView} />}
        {view === "company" && <ResearchView company={company} setCompany={setCompany} busy={researchBusy} reports={records.research} onRun={runResearch} onDelete={(id) => deleteRecord("research", id)} />}
        {view === "interviews" && <InterviewView items={records.interviews} active={activeInterview} audioFiles={audioFiles} recording={recording} onSelect={setSelectedInterview} onAdd={() => setEditor({ kind: "interviews" })} onEdit={(item) => setEditor({ kind: "interviews", item })} onDelete={(id) => deleteRecord("interviews", id)} onSave={updateInterview} onRecord={recording ? stopRecording : startRecording} onAudio={uploadInterviewAudio} onTranscribe={transcribeInterview} onReview={reviewInterview} onCreateTask={createAIAction} />}
        {view === "offers" && <OffersView items={records.offers} weights={weights} setWeights={setWeights} onAdd={() => setEditor({ kind: "offers" })} onEdit={(item) => setEditor({ kind: "offers", item })} onDelete={(id) => deleteRecord("offers", id)} />}
        {view === "calendar" && <CalendarView items={records.reminders} applications={records.applications} interviews={records.interviews} offers={records.offers} tasks={records.tasks} onAdd={() => setEditor({ kind: "reminders" })} onEdit={(item) => setEditor({ kind: "reminders", item })} onDelete={(id) => deleteRecord("reminders", id)} onExport={exportIcs} />}
        {view === "resources" && <JobResourcesView />}
      </main>

      <RecordEditor editor={editor} resumes={resumes} onClose={() => setEditor(null)} onSaved={async (kind) => { setEditor(null); await refresh(kind); toast.success("记录已保存"); }} />
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardView({ dashboard, profile, records, onNavigate, onAdd }: { dashboard: Dashboard; profile: Record<string, any>; records: Record<Kind, RecordItem[]>; onNavigate: (view: View) => void; onAdd: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
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
  const deadlineText = dashboard.settings.cycleConfirmed ? dashboard.settings.cycleEndDate : "";
  const deadline = deadlineText ? new Date(`${deadlineText}T23:59:59`) : new Date(now);
  const remaining = deadlineText ? Math.max(0, deadline.getTime() - now) : 0;
  const countdown = { days: Math.floor(remaining / 86400000), hours: Math.floor(remaining / 3600000) % 24, minutes: Math.floor(remaining / 60000) % 60, seconds: Math.floor(remaining / 1000) % 60 };
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
        {deadlineText ? <section className="panel countdown-card"><div className="countdown-title"><Timer /><div><span>距离{profile.seasonName || "秋招周期结束"}还有</span><small>{formatDate(deadlineText)} · 可在个人资料中修改</small></div></div><div className="countdown-values">{Object.entries(countdown).map(([key, value]) => <div key={key}><b>{String(value).padStart(2, "0")}</b><span>{{ days: "天", hours: "时", minutes: "分", seconds: "秒" }[key]}</span></div>)}</div></section> : <section className="panel setup-countdown"><Timer /><div><b>尚未确认求职周期</b><p>确认后才显示倒计时，不使用虚假默认日期。</p></div><Button variant="outline" onClick={() => onNavigate("profile")}>设置周期</Button></section>}
        <section className="panel"><div className="panel-title"><div><h2>七日内日程</h2><p>关键节点别错过</p></div><button onClick={() => onNavigate("calendar")}>查看全部</button></div><div className="agenda-list">{dashboard.upcoming.length ? dashboard.upcoming.map((item, index) => <article key={index}><time>{formatDate(item.data.dueAt, true)}</time><div><b>{item.data.title}</b><p>{item.data.type || "提醒"}</p></div></article>) : <p className="muted">未来七天没有安排</p>}</div></section>
        <section className="panel risk-panel"><div className="panel-title"><div><h2>需要处理</h2><p>截止风险与停滞机会</p></div><button onClick={() => onNavigate("tasks")}>行动清单</button></div>{dashboard.risks.length ? dashboard.risks.slice(0, 5).map((entry, index) => <article key={index}><AlertTriangle /><span><b>{entry.item.data.company || entry.item.data.title || "求职事项"}</b><small>{entry.risk.reason}</small></span></article>) : <p className="muted">当前没有风险提醒</p>}</section>
      </div>
    </div>
    <section className="panel segment-panel"><div className="panel-title"><div><h2>转化效果对比</h2><p>按渠道、简历版本和岗位方向查看历史到达情况；样本不足 {dashboard.settings.minimumSample || 5} 条时只展示数量。</p></div></div><div className="segment-grid">{Object.entries({ channel: "投递渠道", resume: "简历版本", direction: "岗位方向" }).map(([key, title]) => <div key={key}><h3>{title}</h3>{(dashboard.segments?.[key] || []).length ? (dashboard.segments[key] as any[]).map((item) => <article key={item.label}><div><b>{item.label}</b><small>{item.count} 条记录</small></div>{item.ratesVisible ? <span>面试 {Math.round(item.interviewCount / item.count * 100)}% · OFFER {Math.round(item.offerCount / item.count * 100)}%</span> : <span>面试 {item.interviewCount} · OFFER {item.offerCount}</span>}</article>) : <p className="muted">暂无可比较记录</p>}</div>)}</div></section>
    <div className="dashboard-grid dashboard-followups"><section className="panel"><div className="panel-title"><div><h2>本周行动</h2><p>待办与进行中的下一步</p></div><button onClick={() => onNavigate("tasks")}>查看全部</button></div><div className="agenda-list">{dashboard.openTasks.length ? dashboard.openTasks.slice(0, 6).map((task, index) => <article key={task.id || index}><time>{task.dueAt ? formatDate(task.dueAt) : "待安排"}</time><div><b>{task.title}</b><p>{task.type || "自定义"} · {task.status === "doing" ? "进行中" : "待办"}</p></div></article>) : <p className="muted">当前没有待办行动</p>}</div></section><section className="panel"><div className="panel-title"><div><h2>待补事实</h2><p>未经确认的经历不会被 AI 当作正式证据</p></div><button onClick={() => onNavigate("evidence")}>前往核对</button></div><div className="pending-evidence"><strong>{dashboard.pendingEvidence}</strong><span>条事实等待确认或补充</span></div></section></div>
  </>;
}

function ProfileView({ profile, saveState, onChange, onSave, onAvatar }: { profile: Record<string, any>; saveState: string; onChange: (key: string, value: any) => void; onSave: () => void; onAvatar: (file: File) => void }) {
  const settings = { cycleEndDate: "2027-01-31", cycleConfirmed: false, savedStaleDays: 7, pendingStaleDays: 3, appliedStaleDays: 7, processStaleDays: 5, deadlineRiskDays: 3, minimumSample: 5, ...(profile.jobSearchSettings || {}) };
  const updateSetting = (key: string, value: any) => onChange("jobSearchSettings", { ...settings, [key]: value });
  return <><PageHead eyebrow="个人中心" title="你的求职底稿" description="所有字段都可以修改，更新会自动保存并用于后续分析。" action={<div className="save-state"><CheckCircle2 />{saveState}<Button variant="outline" onClick={onSave}><Save />立即保存</Button></div>} />
    <div className="profile-layout"><section className="panel profile-card"><div className="profile-avatar">{profile.avatarFileId ? <img src={`/api/files/content?id=${profile.avatarFileId}`} alt="个人头像" /> : <span>{(profile.name || "我").slice(0, 1)}</span>}<label><Upload />更换头像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && onAvatar(event.target.files[0])} /></label></div><h2>{profile.name || "尚未填写姓名"}</h2><p>{profile.targetRoles || "填写目标岗位后，AI 会更懂你的方向"}</p><StatusPill tone={profile.jobStatus ? "green" : "orange"}>{profile.jobStatus || "资料待完善"}</StatusPill></section>
      <section className="panel form-panel"><h2>基本信息</h2><div className="form-grid"><Field label="姓名"><Input value={profile.name || ""} onChange={(e) => onChange("name", e.target.value)} /></Field><Field label="手机"><Input value={profile.phone || ""} onChange={(e) => onChange("phone", e.target.value)} /></Field><Field label="邮箱"><Input type="email" value={profile.email || ""} onChange={(e) => onChange("email", e.target.value)} /></Field><Field label="当前城市"><Input value={profile.city || ""} onChange={(e) => onChange("city", e.target.value)} /></Field><Field label="求职状态"><select value={profile.jobStatus || ""} onChange={(e) => onChange("jobStatus", e.target.value)}><option value="">请选择</option><option>准备中</option><option>积极投递</option><option>面试中</option><option>已有 OFFER</option><option>暂缓求职</option></select></Field><Field label="到岗时间"><Input type="date" value={profile.availableDate || ""} onChange={(e) => onChange("availableDate", e.target.value)} /></Field></div><h2>目标与偏好</h2><div className="form-grid"><Field label="目标岗位"><Input value={profile.targetRoles || ""} placeholder="产品经理、策略产品" onChange={(e) => onChange("targetRoles", e.target.value)} /></Field><Field label="目标行业"><Input value={profile.targetIndustries || ""} onChange={(e) => onChange("targetIndustries", e.target.value)} /></Field><Field label="目标城市"><Input value={profile.targetCities || ""} onChange={(e) => onChange("targetCities", e.target.value)} /></Field><Field label="期望薪资"><Input value={profile.expectedSalary || ""} placeholder="例如 25K–35K × 15" onChange={(e) => onChange("expectedSalary", e.target.value)} /></Field><Field label="冲刺节点名称"><Input value={profile.seasonName || "秋招冲刺节点"} onChange={(e) => onChange("seasonName", e.target.value)} /></Field><Field label="求职周期结束日期"><Input type="date" value={settings.cycleEndDate} onChange={(e) => updateSetting("cycleEndDate", e.target.value)} /></Field><Field label="倒计时状态"><select value={settings.cycleConfirmed ? "confirmed" : "draft"} onChange={(e) => updateSetting("cycleConfirmed", e.target.value === "confirmed")}><option value="draft">暂不显示</option><option value="confirmed">确认并显示倒计时</option></select></Field><Field label="截止风险提前天数"><Input type="number" min={1} max={30} value={settings.deadlineRiskDays} onChange={(e) => updateSetting("deadlineRiskDays", Number(e.target.value))} /></Field><Field label="收藏停滞天数"><Input type="number" min={1} max={90} value={settings.savedStaleDays} onChange={(e) => updateSetting("savedStaleDays", Number(e.target.value))} /></Field><Field label="待投递停滞天数"><Input type="number" min={1} max={90} value={settings.pendingStaleDays} onChange={(e) => updateSetting("pendingStaleDays", Number(e.target.value))} /></Field><Field label="已投递停滞天数"><Input type="number" min={1} max={90} value={settings.appliedStaleDays} onChange={(e) => updateSetting("appliedStaleDays", Number(e.target.value))} /></Field><Field label="笔面试停滞天数"><Input type="number" min={1} max={90} value={settings.processStaleDays} onChange={(e) => updateSetting("processStaleDays", Number(e.target.value))} /></Field></div><h2>经历与能力</h2><div className="form-stack"><Field label="教育经历"><Textarea value={profile.education || ""} placeholder="每行一段，写明学校、专业、时间" onChange={(e) => onChange("education", e.target.value)} /></Field><Field label="实习 / 工作经历"><Textarea value={profile.experience || ""} onChange={(e) => onChange("experience", e.target.value)} /></Field><Field label="项目经历"><Textarea value={profile.projects || ""} onChange={(e) => onChange("projects", e.target.value)} /></Field><Field label="技能标签"><Input value={profile.skills || ""} placeholder="SQL，用户研究，A/B 测试" onChange={(e) => onChange("skills", e.target.value)} /></Field><Field label="个人简介"><Textarea value={profile.bio || ""} onChange={(e) => onChange("bio", e.target.value)} /></Field></div><DataManagement /></section></div></>;
}

function DataManagement() {
  const [preview, setPreview] = useState<any>(null); const [decisions, setDecisions] = useState<Record<string, "current" | "backup">>({}); const [busy, setBusy] = useState(false);
  async function choose(file?: File) { if (!file) return; setBusy(true); try { const content = await file.text(); const result = await api<any>("/api/data/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json", content }) }); setPreview(result); setDecisions(Object.fromEntries((result.preview.conflicts || []).map((item: any) => [item.id, "current"]))); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function commit() { if (!preview) return; setBusy(true); try { await api(`/api/data/imports/${preview.importId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisions, useProfile: false }) }); toast.success("备份已按预览结果合并，请刷新页面查看"); setPreview(null); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <section className="data-management"><h2>数据备份与恢复</h2><p>JSON 是完整结构化备份；CSV 便于表格查看；附件包包含简历、录音、头像和岗位截图原件。导入前只生成预览，冲突默认保留当前版本。</p><div className="card-actions"><Button variant="outline" asChild><a href="/api/data/export?format=json"><Download />导出 JSON</a></Button><Button variant="outline" asChild><a href="/api/data/export?format=csv"><Download />导出 CSV</a></Button><Button variant="outline" asChild><a href="/api/data/files/archive"><Archive />打包附件</a></Button><label className="upload-button secondary"><Upload />{busy ? "处理中…" : "导入备份"}<input type="file" accept=".json,.csv,application/json,text/csv" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} /></label></div>{preview && <div className="import-preview"><b>导入预览</b><p>新增 {preview.preview.summary.additions} 条，相同 {preview.preview.summary.unchanged} 条，冲突 {preview.preview.summary.conflicts} 条。</p>{preview.preview.conflicts.map((item: any) => <label key={item.id}><span>{item.kind} · {item.title || item.id.slice(0, 8)}</span><select value={decisions[item.id] || "current"} onChange={(e) => setDecisions({ ...decisions, [item.id]: e.target.value as any })}><option value="current">保留当前</option><option value="backup">使用备份</option></select></label>)}<div className="card-actions"><Button variant="outline" onClick={() => setPreview(null)}>取消</Button><Button onClick={commit} disabled={busy}>确认合并</Button></div></div>}</section>;
}

function ResumeView({ resumes, applications, onUpload, onPreview, onDelete, onAnalyze }: { resumes: StoredFile[]; applications: RecordItem[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPreview: (file: StoredFile) => void; onDelete: (id: string) => void; onAnalyze: (file: StoredFile) => void }) {
  return <><PageHead eyebrow="多版本简历库" title="原文件私有保存，版本清晰可追踪" description="应用不会改写你的简历，只保存、预览、关联投递并生成可核验建议。" action={<label className="upload-button"><Upload />上传简历<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onUpload} /></label>} />
    {resumes.length ? <div className="resume-grid">{resumes.map((file) => { const linked = applications.filter((item) => item.data.resumeId === file.id); return <article className="resume-card" key={file.id}><div className="file-cover"><FileText /><span>{file.mimeType.includes("pdf") ? "PDF" : file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"}</span></div><div className="resume-body"><div><h2>{file.metadata.displayName || file.filename}</h2><p>{file.metadata.target || "未设置目标方向"}</p></div><dl><div><dt>源文件</dt><dd>{file.filename}</dd></div><div><dt>保存时间</dt><dd>{formatDate(file.createdAt, true)}</dd></div><div><dt>文件大小</dt><dd>{fileSize(file.size)}</dd></div><div><dt>已投岗位</dt><dd>{linked.length} 个</dd></div></dl>{file.metadata.note && <p className="resume-note">{file.metadata.note}</p>}<div className="tag-row">{(file.metadata.tags || []).map((tag: string) => <span key={tag}>{tag}</span>)}{linked.slice(0, 3).map((item) => <span key={item.id}>{item.data.company}</span>)}</div><div className="card-actions"><Button variant="outline" onClick={() => onPreview(file)}><Eye />预览</Button><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载</a></Button><Button onClick={() => onAnalyze(file)}><Sparkles />AI 建议</Button><Button variant="ghost" size="icon" aria-label="删除简历" onClick={() => onDelete(file.id)}><Trash2 /></Button></div></div></article>; })}</div> : <EmptyState icon={FileText} title="还没有简历版本" text="上传 PDF、DOCX 或 DOC，本地原文件会保存为你的私有云端副本。" action={<label className="upload-button"><Upload />上传第一份简历<input type="file" accept=".pdf,.doc,.docx" onChange={onUpload} /></label>} />}
  </>;
}

function SavedJobsView({ items, screenshots, onSave, onExtract, onConfirm, onConvert, onDelete }: { items: RecordItem[]; screenshots: StoredFile[]; onSave: (data: Record<string, any>, screenshot?: File) => Promise<void>; onExtract: (url?: string, screenshot?: File) => Promise<{ job: AIJob; screenshotFileId: string }>; onConfirm: (jobId: string, data: Record<string, any>, allowDuplicate?: boolean) => Promise<any>; onConvert: (item: RecordItem) => Promise<void>; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File>();
  const [jobId, setJobId] = useState(""); const [screenshotFileId, setScreenshotFileId] = useState(""); const [extracting, setExtracting] = useState(false); const [warnings, setWarnings] = useState<string[]>([]); const [conflicts, setConflicts] = useState<Array<{ key: string; current: string; incoming: string }>>([]);
  const empty = { sourceUrl: "", company: "", role: "", location: "", salary: "", deadline: "", priority: "普通", jd: "" }; const [draft, setDraft] = useState<Record<string, any>>(empty);
  const update = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function extract(mode: "url" | "image") { if (mode === "url" && !/^https?:\/\//i.test(draft.sourceUrl)) return toast.error("请先输入公开岗位链接"); if (mode === "image" && !file) return toast.error("请先选择岗位截图"); setExtracting(true); const toastId = toast.loading(mode === "url" ? "正在读取岗位页面…" : "正在识别岗位截图…"); try { const output = await onExtract(mode === "url" ? draft.sourceUrl : undefined, mode === "image" ? file : undefined); const result = output.job.result || {}; const next = { ...draft }; const found: Array<{ key: string; current: string; incoming: string }> = []; ["sourceUrl","company","role","location","salary","deadline","jd"].forEach((key) => { const incoming = String(result[key] || ""); if (!incoming) return; if (String(next[key] || "").trim() && String(next[key]).trim() !== incoming.trim()) found.push({ key, current: String(next[key]), incoming }); else next[key] = incoming; }); setDraft(next); setConflicts(found); setWarnings(result.warnings || []); setJobId(output.job.id); if (output.screenshotFileId) setScreenshotFileId(output.screenshotFileId); toast.success("提取完成，请核对后保存", { id: toastId }); } catch (error) { toast.error((error as Error).message + "。你仍可手动填写或改用截图。", { id: toastId }); } finally { setExtracting(false); } }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.sourceUrl && !file && !draft.company && !draft.role) return toast.error("请填写岗位链接、上传截图或补充岗位信息");
    setSaving(true);
    try {
      if (jobId) { const result = await onConfirm(jobId, { ...draft, screenshotFileId }); if (result.requiresConfirmation && result.duplicate) { if (!window.confirm(`已存在「${result.duplicate.title}」，仍要保存副本吗？`)) return; await onConfirm(jobId, { ...draft, screenshotFileId }, true); } }
      else await onSave(draft, file);
      setFile(undefined); setDraft(empty); setJobId(""); setWarnings([]); setConflicts([]); setOpen(false); toast.success("岗位已保存");
    } finally { setSaving(false); }
  }
  return <><PageHead eyebrow="机会收集箱" title="先收藏岗位，再决定是否投递" description="保存岗位链接、JD 截图和关键信息；确认后可一键转入投递看板。" action={<Button onClick={() => setOpen(true)}><Plus />收藏岗位</Button>} />
    {items.length ? <div className="saved-job-grid">{items.map((item) => { const image = screenshots.find((entry) => entry.id === item.data.screenshotFileId); return <article className="saved-job-card" key={item.id}>{image ? <img src={`/api/files/content?id=${image.id}`} alt={`${item.data.company || "岗位"} JD 截图`} /> : <div className="saved-job-placeholder"><ImageIcon /><span>未上传 JD 截图</span></div>}<div className="saved-job-body"><div><span className="resource-badge">{item.data.priority || "待评估"}</span><h2>{item.data.company || "公司待补充"}</h2><p>{item.data.role || "岗位名称待补充"}</p></div><dl><div><dt>地点</dt><dd>{item.data.location || "—"}</dd></div><div><dt>截止</dt><dd>{formatDate(item.data.deadline)}</dd></div></dl>{item.data.jd && <p className="saved-job-jd">{item.data.jd}</p>}<div className="card-actions"><Button variant="outline" asChild><a href={item.data.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />查看原岗位</a></Button><Button disabled={Boolean(item.data.convertedApplicationId)} onClick={() => onConvert(item)}>{item.data.convertedApplicationId ? <CheckCircle2 /> : <BriefcaseBusiness />}{item.data.convertedApplicationId ? "已转投递" : "转入投递"}</Button><Button variant="ghost" size="icon" aria-label="删除收藏岗位" onClick={() => onDelete(item.id)}><Trash2 /></Button></div></div></article>; })}</div> : <EmptyState icon={Bookmark} title="还没有收藏岗位" text="遇到感兴趣的岗位时，先保存链接和 JD，避免信息散落在浏览器标签页和聊天记录中。" action={<Button onClick={() => setOpen(true)}><Plus />收藏第一个岗位</Button>} />}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog capture-dialog"><DialogHeader><DialogTitle>收藏岗位</DialogTitle><DialogDescription>AI 只在你点击时提取，结果不会直接写入正式记录。</DialogDescription></DialogHeader><form onSubmit={submit}><div className="capture-source"><Field label="岗位链接"><Input type="url" value={draft.sourceUrl} placeholder="https://..." onChange={(e) => update("sourceUrl", e.target.value)} /></Field><Button type="button" variant="outline" disabled={extracting || !draft.sourceUrl} onClick={() => extract("url")}><Sparkles />提取链接</Button></div><div className="editor-grid"><Field label="公司"><Input value={draft.company} onChange={(e) => update("company", e.target.value)} /></Field><Field label="岗位"><Input value={draft.role} onChange={(e) => update("role", e.target.value)} /></Field><Field label="工作地点"><Input value={draft.location} onChange={(e) => update("location", e.target.value)} /></Field><Field label="薪资范围"><Input value={draft.salary} onChange={(e) => update("salary", e.target.value)} /></Field><Field label="截止日期"><Input type="date" value={draft.deadline} onChange={(e) => update("deadline", e.target.value)} /></Field><Field label="优先级"><select value={draft.priority} onChange={(e) => update("priority", e.target.value)}><option>高</option><option>普通</option><option>低</option></select></Field><Field label="完整 JD"><Textarea value={draft.jd} placeholder="提取结果或手动粘贴岗位职责与任职要求…" onChange={(e) => update("jd", e.target.value)} /></Field><Field label="JD 截图"><label className="upload-zone"><ImageIcon /><span>{file ? file.name : "选择 PNG、JPG 或 WebP，最大 10 MB"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} /></label><Button className="ocr-button" type="button" variant="outline" disabled={extracting || !file} onClick={() => extract("image")}><ImageIcon />识别截图</Button></Field></div>{warnings.length > 0 && <div className="capture-warnings"><AlertTriangle />{warnings.map((item) => <p key={item}>{item}</p>)}</div>}{conflicts.length > 0 && <div className="capture-conflicts"><b>发现字段冲突，当前保留你的填写</b>{conflicts.map((item) => <div key={item.key}><span><small>当前</small>{item.current}</span><span><small>AI 提取</small>{item.incoming}</span><Button type="button" variant="outline" onClick={() => { update(item.key, item.incoming); setConflicts((items) => items.filter((entry) => entry.key !== item.key)); }}>采用提取值</Button></div>)}</div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={saving || extracting}>{saving ? <RefreshCw className="spin" /> : <Bookmark />}{saving ? "正在保存…" : "核对并保存"}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

const jobResources = [
  { name: "BOSS 直聘", tag: "综合招聘", url: "https://www.zhipin.com/web/geek/job", description: "综合岗位与招聘者沟通" },
  { name: "拉勾校招", tag: "互联网", url: "https://campus.lagou.com/", description: "互联网与数字科技校招" },
  { name: "实习僧", tag: "实习 / 校招", url: "https://www.shixiseng.com/", description: "实习、校招与应届岗位" },
  { name: "猎聘", tag: "综合招聘", url: "https://www.liepin.com/zhaopin/", description: "社会招聘与中高端职位" },
  { name: "牛客求职", tag: "校招社区", url: "https://www.nowcoder.com/jobs", description: "校招职位、笔面试经验" },
  { name: "前程无忧校招", tag: "校园招聘", url: "https://xy.51job.com/", description: "校园招聘与企业专场" },
  { name: "智联招聘", tag: "综合招聘", url: "https://jobs.zhaopin.com/", description: "全职、校招与城市岗位" },
  { name: "应届生求职网", tag: "应届生", url: "https://www.yingjiesheng.com/", description: "校招信息、宣讲会与网申" },
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

function ApplicationsView({ items, resumes, onAdd, onEdit, onDelete, onMove, onChecklist }: { items: RecordItem[]; resumes: StoredFile[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onMove: (item: RecordItem, stage: string) => void; onChecklist: (item: RecordItem, key: string, done: boolean) => void }) {
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
  const card = (item: RecordItem) => { const resume = resumes.find((file) => file.id === item.data.resumeId); const completed = Object.values(item.data.checklist || {}).filter((entry: any) => entry?.done).length; return <article draggable key={item.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}><div className="job-card-head"><span>{String(item.data.company || "?").slice(0, 1)}</span><div><h3>{item.data.company}</h3><p>{item.data.role}</p></div></div><div className="job-meta"><span>{item.data.location || "地点待定"}</span><span>{item.data.priority || "普通"}</span></div>{resume && <small>简历：{resume.metadata.displayName || resume.filename}</small>}<small>执行清单：{completed}/7</small>{item.data.deadline && <small>截止：{formatDate(item.data.deadline)}</small>}<footer>{item.data.sourceUrl && <a href={item.data.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />原岗位</a>}<button onClick={() => setSelected(item)}><Eye />详情</button><button onClick={() => onEdit(item)}><Pencil />编辑</button><button onClick={() => onDelete(item.id)}><Trash2 />删除</button></footer></article>; };
  return <><PageHead eyebrow="投递管理" title="每个机会都有下一步" description="看板拖动会记录阶段变化；列表视图便于筛选、排序与集中核对。" action={<Button onClick={onAdd}><Plus />新增投递</Button>} />
    <div className="pipeline-tabs">{[["all","全部"],["prepare","准备简历"],["written","笔试邀约"],["interview","面试邀约"]].map(([value,label]) => <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{label}<span>{items.filter((item) => tabStages[value].includes(item.data.stage || "待投递")).length}</span></button>)}</div>
    <div className="toolbar application-toolbar"><div className="searchbox"><Search /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索公司、岗位或城市" /></div><div className="toolbar-controls"><label>排序<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="company">公司名称</option></select></label><div className="view-toggle"><Button variant={mode === "board" ? "default" : "outline"} size="icon" aria-label="看板视图" onClick={() => setMode("board")}><Columns3 /></Button><Button variant={mode === "list" ? "default" : "outline"} size="icon" aria-label="列表视图" onClick={() => setMode("list")}><List /></Button></div></div></div>
    {items.length ? mode === "board" ? <div className="kanban">{stageOrder.filter((stage) => tabStages[tab].includes(stage)).map((stage) => <section key={stage} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const item = items.find((candidate) => candidate.id === e.dataTransfer.getData("text/plain")); if (item) onMove(item, stage); }}><header><b>{stage}</b><span>{filtered.filter((item) => (item.data.stage || "待投递") === stage).length}</span></header><div>{filtered.filter((item) => (item.data.stage || "待投递") === stage).map(card)}</div></section>)}</div> : <div className="application-table"><div className="application-row head"><span>公司与岗位</span><span>阶段</span><span>截止日期</span><span>关联简历</span><span>操作</span></div>{filtered.map((item) => { const resume = resumes.find((file) => file.id === item.data.resumeId); return <div className="application-row" key={item.id}><span><b>{item.data.company}</b><small>{item.data.role} · {item.data.location || "地点待定"}</small></span><span><StatusPill>{item.data.stage || "待投递"}</StatusPill></span><span>{formatDate(item.data.deadline)}</span><span>{resume?.metadata.displayName || resume?.filename || "未关联"}</span><span className="row-actions">{item.data.sourceUrl && <a href={item.data.sourceUrl} target="_blank" rel="noreferrer" aria-label="查看原岗位"><ExternalLink /></a>}<button onClick={() => setSelected(item)} aria-label="查看详情"><Eye /></button><button onClick={() => onEdit(item)} aria-label="编辑"><Pencil /></button><button onClick={() => onDelete(item.id)} aria-label="删除"><Trash2 /></button></span></div>; })}</div> : <EmptyState icon={BriefcaseBusiness} title="还没有投递记录" text="添加一个目标岗位，从 JD、简历到面试都可以围绕它持续积累。" action={<Button onClick={onAdd}><Plus />新增第一条投递</Button>} />}
    {selected && <ApplicationDetail item={items.find((item) => item.id === selected.id) || selected} resume={resumes.find((file) => file.id === selected.data.resumeId)} onClose={() => setSelected(null)} onEdit={() => onEdit(selected)} onChecklist={(key, done) => onChecklist(selected, key, done)} />}
  </>;
}

const checklistLabels: Record<string, string> = { research: "完成公司背调", analysis: "完成岗位分析", resumeSelected: "选择投递简历", resumeOptimized: "核对简历优化", submitted: "完成正式投递", followedUp: "完成一次跟进", interviewScheduled: "安排面试日程" };
function ApplicationDetail({ item, resume, onClose, onEdit, onChecklist }: { item: RecordItem; resume?: StoredFile; onClose: () => void; onEdit: () => void; onChecklist: (key: string, done: boolean) => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="application-detail-dialog"><DialogHeader><DialogTitle>{item.data.company} · {item.data.role}</DialogTitle><DialogDescription>{item.data.stage || "待投递"} · 最近更新 {formatDate(item.updatedAt, true)}</DialogDescription></DialogHeader><div className="application-detail-grid"><section><h3>投递执行清单</h3><div className="checklist">{Object.entries(checklistLabels).map(([key, label]) => { const done = Boolean(item.data.checklist?.[key]?.done); return <label key={key}><input type="checkbox" checked={done} onChange={(e) => onChecklist(key, e.target.checked)} /><span>{label}</span>{done && <small>{formatDate(item.data.checklist[key].at, true)}</small>}</label>; })}</div></section><section><h3>联系与投递信息</h3><dl className="detail-list"><div><dt>渠道</dt><dd>{item.data.channel || "未填写"}</dd></div><div><dt>联系人 / 内推人</dt><dd>{item.data.contactName || item.data.contact || "未填写"}</dd></div><div><dt>联系方式</dt><dd>{item.data.contactValue || "未填写"}</dd></div><div><dt>下次跟进</dt><dd>{formatDate(item.data.nextFollowUpAt, true)}</dd></div><div><dt>关联简历</dt><dd>{resume?.metadata.displayName || resume?.filename || "未关联"}</dd></div></dl><Button variant="outline" onClick={onEdit}><Pencil />编辑完整信息</Button></section></div><ActivityTimeline entityId={item.id} /></DialogContent></Dialog>;
}

function ActivityTimeline({ entityId }: { entityId: string }) { const [events, setEvents] = useState<RecordItem[]>([]); useEffect(() => { api<{ events: RecordItem[] }>(`/api/activity?entityType=applications&entityId=${encodeURIComponent(entityId)}`).then((result) => setEvents(result.events)).catch(() => setEvents([])); }, [entityId]); return <section className="activity-timeline"><h3>操作时间线</h3>{events.length ? events.map((event) => <article key={event.id}><time>{formatDate(event.createdAt, true)}</time><div><b>{event.title}</b><small>{event.data.action || "记录更新"}</small></div></article>) : <p className="muted">还没有操作历史</p>}</section>; }

function TasksView({ items, applications, onChanged }: { items: RecordItem[]; applications: RecordItem[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [status, setStatus] = useState("active"); const visible = items.filter((item) => status === "all" ? true : status === "active" ? !["done", "dismissed"].includes(item.data.status) : item.data.status === status);
  async function create(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), category: form.get("category"), priority: form.get("priority"), dueAt: form.get("dueAt"), notes: form.get("notes"), applicationId: form.get("applicationId"), entityType: form.get("applicationId") ? "applications" : "", entityId: form.get("applicationId") || "", status: "todo", createdBy: "user", aiJobId: "", checklistKey: "", sourceRefs: [] }) }); setOpen(false); onChanged(); toast.success("行动任务已创建"); } catch (error) { toast.error((error as Error).message); } }
  async function update(item: RecordItem, data: Record<string, any>) { try { await api("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, version: item.version, data }) }); onChanged(); } catch (error) { toast.error((error as Error).message); } }
  async function remove(item: RecordItem) { if (!window.confirm("将这个任务移入回收站？")) return; await api(`/api/tasks?id=${item.id}`, { method: "DELETE" }); onChanged(); }
  return <><PageHead eyebrow="行动清单" title="把分析结论变成下一步" description="手动任务与带来源的 AI 建议集中管理；有日期的任务会自动进入求职日历。" action={<Button onClick={() => setOpen(true)}><Plus />新增任务</Button>} /><div className="pipeline-tabs task-tabs">{[["active","待处理"],["todo","待办"],["doing","进行中"],["done","已完成"],["all","全部"]].map(([value,label]) => <button className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>{label}</button>)}</div>{visible.length ? <div className="task-list">{visible.map((item) => { const app = applications.find((entry) => entry.id === item.data.applicationId); return <article key={item.id} className={`task-card ${item.data.status}`}><button className="task-check" aria-label="标记完成" onClick={() => update(item, { status: item.data.status === "done" ? "todo" : "done" })}>{item.data.status === "done" ? <CheckCircle2 /> : <span />}</button><div><div className="tag-row"><span>{({ resume: "简历", evidence: "事实补充", application: "投递", follow_up: "跟进", interview: "面试", deadline: "截止事项", custom: "自定义" } as any)[item.data.category] || item.data.category}</span>{item.data.createdBy === "ai" && <span>AI · 有引用</span>}</div><h2>{item.data.title}</h2><p>{item.data.notes || (app ? `${app.data.company} · ${app.data.role}` : "")}</p><small>{item.data.dueAt ? `截止 ${formatDate(item.data.dueAt, true)}` : "未设置日期"}</small></div><div className="task-actions"><select value={item.data.status} onChange={(e) => update(item, { status: e.target.value })}><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option><option value="dismissed">已忽略</option></select><button onClick={() => remove(item)} aria-label="删除任务"><Trash2 /></button></div></article>; })}</div> : <EmptyState icon={ListChecks} title="没有符合条件的任务" text="从岗位分析、简历建议、面试复盘中创建行动项，或手动添加下一步。" action={<Button onClick={() => setOpen(true)}><Plus />添加任务</Button>} />}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>新增行动任务</DialogTitle><DialogDescription>设置日期后会自动进入求职日历和 ICS 导出。</DialogDescription></DialogHeader><form onSubmit={create}><div className="editor-grid"><Field label="任务标题"><Input name="title" required /></Field><Field label="任务类型"><select name="category" defaultValue="custom"><option value="resume">简历</option><option value="evidence">事实补充</option><option value="application">投递</option><option value="follow_up">跟进</option><option value="interview">面试</option><option value="deadline">截止事项</option><option value="custom">自定义</option></select></Field><Field label="优先级"><select name="priority" defaultValue="normal"><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></Field><Field label="截止时间"><Input name="dueAt" type="datetime-local" /></Field><Field label="关联投递"><select name="applicationId"><option value="">不关联</option>{applications.map((item) => <option value={item.id} key={item.id}>{item.data.company} · {item.data.role}</option>)}</select></Field><Field label="备注"><Textarea name="notes" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit">保存任务</Button></DialogFooter></form></DialogContent></Dialog></>;
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

const aiTypeLabels: Record<string, string> = { job_analysis: "岗位分析", resume_suggestions: "简历建议", company_research: "公司背调", interview_review: "面试复盘", transcription: "录音转写", evaluation_case: "合成评测", job_capture_url: "岗位链接提取", job_capture_image: "岗位截图识别" };
const aiStatusLabels: Record<string, string> = { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", cancelled: "已取消" };

function AICenterView({ jobs, legacy, activeId, attempts, evaluation, onSelect, onRetry, onCancel, onRefresh, onRunEvaluation, onNavigate }: { jobs: AIJob[]; legacy: any[]; activeId: string | null; attempts: any[]; evaluation: Record<string, any> | null; onSelect: (id: string) => void; onRetry: (id: string) => void; onCancel: (id: string) => void; onRefresh: () => void; onRunEvaluation: () => void; onNavigate: (view: View) => void }) {
  const [type, setType] = useState(""); const [status, setStatus] = useState(""); const [date, setDate] = useState("");
  const filtered = jobs.filter((job) => (!type || job.type === type) && (!status || job.status === status) && (!date || job.createdAt.slice(0, 10) === date));
  const active = jobs.find((job) => job.id === activeId) || filtered[0];
  const navigateTarget = active?.type === "company_research" ? "company" : active?.type === "interview_review" || active?.type === "transcription" ? "interviews" : "analysis";
  return <><PageHead eyebrow="AI 任务中心" title="每次分析都能复核、重试和追溯" description="记录输入快照、来源、模型、提示版本、耗时和每次尝试；取消后的迟到结果不会写入正式记录。" action={<div className="head-actions"><Button variant="outline" onClick={onRefresh}><RefreshCw />刷新</Button><Button onClick={onRunEvaluation}><Sparkles />运行 20 组合成回归</Button></div>} />
    {evaluation && <section className={`evaluation-banner ${evaluation.passed ? "passed" : ""}`}><div><b>合成回归：{evaluation.completed || 0}/{evaluation.total || 20}</b><span>只使用内置合成简历事实与 JD，不读取你的真实资料。</span></div><div><strong>F1 {Math.round((evaluation.f1 || 0) * 100)}%</strong><span>无效引用 {evaluation.invalidReferenceCount || 0} · 编造事实 {evaluation.unsupportedFactCount || 0} · Schema {Math.round((evaluation.schemaPassRate || 0) * 100)}%</span></div></section>}
    <section className="ai-filters panel"><label>任务类型<select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部</option>{Object.entries(aiTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{Object.entries(aiStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>日期<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></section>
    <div className="ai-center-layout"><section className="panel ai-job-list">{filtered.length ? filtered.map((job) => <button key={job.id} className={active?.id === job.id ? "active" : ""} onClick={() => onSelect(job.id)}><span className={`ai-status ${job.status}`}>{aiStatusLabels[job.status] || job.status}</span><b>{aiTypeLabels[job.type] || job.type}</b><small>{formatDate(job.createdAt, true)} · {job.model}</small>{job.errorMessage && <em>{job.errorMessage}</em>}</button>) : <EmptyState icon={ListChecks} title="没有符合条件的任务" text="执行岗位分析、简历建议、背调或面试复盘后，记录会出现在这里。" />}{legacy.length > 0 && <div className="legacy-jobs"><b>旧版记录</b><p>以下记录在审计管线建立前生成，缺少完整追溯字段，不会补造。</p>{legacy.map((item) => <span key={item.id}>{item.title}<small>{formatDate(item.createdAt, true)}</small></span>)}</div>}</section>
      <section className="panel ai-job-detail">{active ? <><header><div><span className={`ai-status ${active.status}`}>{aiStatusLabels[active.status]}</span><h2>{aiTypeLabels[active.type]}</h2><p>{active.id}</p></div><div>{["queued", "running"].includes(active.status) && <Button variant="outline" onClick={() => onCancel(active.id)}>取消</Button>}{["failed", "cancelled"].includes(active.status) && <Button onClick={() => onRetry(active.id)}><RefreshCw />重试</Button>}{active.status === "succeeded" && active.type !== "evaluation_case" && <Button variant="outline" onClick={() => onNavigate(navigateTarget)}><ExternalLink />查看业务结果</Button>}</div></header><dl className="ai-audit-grid"><div><dt>模型</dt><dd>{active.model}</dd></div><div><dt>提示版本</dt><dd>{active.promptVersion}</dd></div><div><dt>耗时</dt><dd>{active.elapsedMs == null ? "—" : `${(active.elapsedMs / 1000).toFixed(1)} 秒`}</dd></div><div><dt>置信度</dt><dd>{active.confidence || "—"}</dd></div></dl>{active.errorMessage && <div className="ai-error"><AlertTriangle /><span><b>{active.errorCode}</b>{active.errorMessage}</span></div>}<section><h3>输入快照</h3><pre>{JSON.stringify(active.inputSnapshot, null, 2)}</pre></section><section><h3>来源引用</h3><pre>{JSON.stringify(active.sourceRefs, null, 2)}</pre></section>{active.result && <section><h3>结果摘要</h3><pre>{JSON.stringify(active.result, null, 2)}</pre></section>}<section><h3>尝试历史</h3>{attempts.length ? <div className="attempt-list">{attempts.map((attempt) => <div key={attempt.id}><b>第 {attempt.attemptNumber} 次 · {aiStatusLabels[attempt.status] || attempt.status}</b><span>{formatDate(attempt.startedAt, true)} · {attempt.model}</span>{attempt.errorMessage && <small>{attempt.errorCode}：{attempt.errorMessage}</small>}</div>)}</div> : <p className="muted">选择任务后查看完整尝试记录。</p>}</section></> : <EmptyState icon={ListChecks} title="还没有 AI 任务" text="先从岗位分析、简历库、公司背调或面试复盘发起一次真实任务。" />}</section></div>
  </>;
}

function ResearchView({ company, setCompany, busy, reports, onRun, onDelete }: { company: string; setCompany: (value: string) => void; busy: boolean; reports: RecordItem[]; onRun: () => void; onDelete: (id: string) => void }) {
  return <><PageHead eyebrow="公司背调" title="来源不足，就不下结论" description="联网检索公开信息，保留来源、生成时间和置信度。" />
    <section className="research-bar"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="输入完整公司名称" onKeyDown={(e) => e.key === "Enter" && onRun()} /><Button disabled={busy || !company.trim()} onClick={onRun}>{busy ? <RefreshCw className="spin" /> : <Building2 />}{busy ? "正在交叉检索…" : "生成背调报告"}</Button></section>
    {reports.length ? <div className="report-list">{reports.map((report) => <article className="panel report" key={report.id}><header><div><h2>{report.data.company || report.title}</h2><p>{formatDate(report.data.generatedAt, true)} · 置信度 {report.data.confidence === "high" ? "高" : report.data.confidence === "medium" ? "中" : "低"}</p></div><button onClick={() => onDelete(report.id)}><Trash2 /></button></header><p className="report-overview">{report.data.overview}</p><div className="report-columns"><section><h3>已核实线索</h3><ul>{(report.data.facts || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>风险与不确定性</h3><ul>{(report.data.risks || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>面试建议确认</h3><ul>{(report.data.questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section></div><footer><h3>来源</h3><div className="source-list">{(report.data.sources || []).map((source: any, index: number) => <a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title}<small>{source.publishedAt || "日期未知"}</small></a>)}</div></footer></article>)}</div> : <EmptyState icon={Building2} title="还没有背调报告" text="输入公司名称后才会联网检索；不会展示预设或虚构报告。" />}
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

function CalendarView({ items, applications, interviews, offers, tasks, onAdd, onEdit, onDelete, onExport }: { items: RecordItem[]; applications: RecordItem[]; interviews: RecordItem[]; offers: RecordItem[]; tasks: RecordItem[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onExport: () => void }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const events: Array<{ id: string; date: string; title: string; type: string; item?: RecordItem }> = [
    ...items.map((item) => ({ id: item.id, date: item.data.dueAt, title: item.data.title, type: item.data.type || "提醒", item })),
    ...applications.filter((item) => item.data.deadline).map((item) => ({ id: `a-${item.id}`, date: item.data.deadline, title: `${item.data.company} · ${item.data.role}`, type: "投递截止" })),
    ...interviews.filter((item) => item.data.scheduledAt).map((item) => ({ id: `i-${item.id}`, date: item.data.scheduledAt, title: `${item.data.company} · ${item.data.round || "面试"}`, type: "面试" })),
    ...offers.filter((item) => item.data.deadline).map((item) => ({ id: `o-${item.id}`, date: item.data.deadline, title: `${item.data.company} · OFFER`, type: "OFFER 截止" })),
    ...tasks.filter((item) => item.data.dueAt && !["done", "dismissed"].includes(item.data.status)).map((item) => ({ id: `t-${item.id}`, date: item.data.dueAt, title: item.data.title, type: "行动任务" })),
  ].filter((event) => event.date && Number.isFinite(new Date(event.date).getTime())).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const firstWeekday = (month.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday);
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const dateKey = (date: Date | string) => { const value = new Date(date); return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`; };
  const monthEvents = events.filter((event) => { const date = new Date(event.date); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); });
  return <><PageHead eyebrow="求职日历" title="截止、笔试和面试集中查看" description="手动提醒、投递截止、面试、OFFER 与行动任务会自动汇入月历。" action={<div className="head-actions"><Button variant="outline" disabled={!events.length} onClick={onExport}><Download />导出全部 ICS</Button><Button onClick={onAdd}><Plus />添加日程</Button></div>} />
    <section className="panel month-calendar"><div className="calendar-toolbar"><Button variant="outline" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>今天</Button><div><Button variant="ghost" size="icon" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button><b>{month.getFullYear()} 年 {month.getMonth() + 1} 月</b><Button variant="ghost" size="icon" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button></div><span>{monthEvents.length} 个节点</span></div><div className="calendar-weekdays">{["周一","周二","周三","周四","周五","周六","周日"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((day) => { const dayEvents = events.filter((event) => dateKey(event.date) === dateKey(day)); const outside = day.getMonth() !== month.getMonth(); const isToday = dateKey(day) === dateKey(today); return <div className={`calendar-day${outside ? " outside" : ""}${isToday ? " today" : ""}`} key={day.toISOString()}><b>{day.getDate()}</b><div>{dayEvents.slice(0, 3).map((event) => <span className={`event-chip ${event.type.includes("面试") ? "interview" : event.type.includes("OFFER") ? "offer" : ""}`} title={`${event.type} · ${event.title}`} key={event.id}>{event.title}</span>)}{dayEvents.length > 3 && <small>还有 {dayEvents.length - 3} 项</small>}</div></div>; })}</div></section>
    {events.length ? <section className="calendar-agenda"><h2>本月节点</h2><div className="timeline">{monthEvents.map((event) => <article key={event.id}><time><b>{new Date(event.date).getDate()}</b><span>{new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(new Date(event.date))}</span></time><div><StatusPill>{event.type}</StatusPill><h2>{event.title}</h2><p>{formatDate(event.date, true)}{event.item?.data.notes ? ` · ${event.item.data.notes}` : ""}</p></div>{event.item && <footer><button onClick={() => onEdit(event.item!)} aria-label="编辑日程"><Pencil /></button><button onClick={() => onDelete(event.item!.id)} aria-label="删除日程"><Trash2 /></button></footer>}</article>)}</div></section> : <p className="calendar-empty">还没有求职节点。你可以添加日程，或在投递、面试和 OFFER 中填写日期。</p>}
  </>;
}

const editorFields: Record<Kind, Array<{ key: string; label: string; type?: string; options?: string[]; required?: boolean }>> = {
  applications: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "direction", label: "岗位方向" }, { key: "location", label: "工作地点" }, { key: "stage", label: "当前阶段", type: "select", options: stageOrder }, { key: "priority", label: "优先级", type: "select", options: ["高", "普通", "低"] }, { key: "deadline", label: "截止日期", type: "date" }, { key: "salary", label: "薪资范围" }, { key: "sourceUrl", label: "岗位链接", type: "url" }, { key: "channel", label: "投递渠道" }, { key: "contactName", label: "联系人 / 内推人" }, { key: "contactRole", label: "联系人身份" }, { key: "contactValue", label: "联系方式" }, { key: "lastContactAt", label: "最后联系时间", type: "datetime-local" }, { key: "nextFollowUpAt", label: "下次跟进时间", type: "datetime-local" }, { key: "resumeId", label: "关联简历", type: "resume" }, { key: "jd", label: "职位描述", type: "textarea" }, { key: "notes", label: "备注", type: "textarea" },
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
    { key: "title", label: "日程标题", required: true }, { key: "type", label: "类型", type: "select", options: ["网申截止", "笔试", "面试", "OFFER 截止", "跟进", "其他"] }, { key: "dueAt", label: "日期与时间", type: "datetime-local", required: true }, { key: "notes", label: "备注", type: "textarea" },
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
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{currentEditor.item ? "编辑" : "新增"}{labels[currentEditor.kind]}</DialogTitle><DialogDescription>保存后会立即同步到你的私人云端空间。</DialogDescription></DialogHeader><form onSubmit={submit}><div className="editor-grid">{editorFields[currentEditor.kind].map((field) => <Field key={field.key} label={field.label}>{field.type === "textarea" ? <Textarea name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || ""} /> : field.type === "select" ? <select name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || field.options?.[0]}>{field.options?.map((option) => <option key={option} value={option}>{option === "confirmed" ? "已确认" : option === "draft" ? "待补充" : option}</option>)}</select> : field.type === "resume" ? <select name={field.key} defaultValue={currentEditor.item?.data[field.key] || ""}><option value="">暂不关联</option>{resumes.map((file) => <option key={file.id} value={file.id}>{file.metadata.displayName || file.filename}</option>)}</select> : <Input name={field.key} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} max={field.key === "growth" || field.key === "platform" || field.key === "balance" || field.key === "outlook" ? 10 : undefined} defaultValue={currentEditor.item?.data[field.key] || (field.key === "months" ? 12 : "")} />}</Field>)}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <Save />}{saving ? "保存中…" : "保存"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function FilePreview({ file, onClose }: { file: StoredFile | null; onClose: () => void }) {
  if (!file) return null;
  const isPdf = file.mimeType === "application/pdf";
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="preview-dialog"><DialogHeader><DialogTitle>{file.metadata.displayName || file.filename}</DialogTitle><DialogDescription>{file.filename} · {fileSize(file.size)}</DialogDescription></DialogHeader>{isPdf ? <iframe title="简历预览" src={`/api/files/content?id=${file.id}`} /> : <div className="doc-preview-fallback"><FileText /><h3>{file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"} 原文件已安全保存</h3><p>当前浏览器无法保证 Word 排版与源文件完全一致。下载原件查看，或使用“AI 建议”读取文档内容并生成事实可追溯的修改建议。</p><Button asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载原文件</a></Button></div>}</DialogContent></Dialog>;
}
