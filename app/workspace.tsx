"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Download,
  Eye,
  FileText,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Sparkles,
  Square,
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

type View = "dashboard" | "profile" | "resumes" | "applications" | "evidence" | "analysis" | "company" | "interviews" | "offers" | "calendar";
type Kind = "applications" | "evidence" | "interviews" | "offers" | "reminders" | "analyses" | "research";
type RecordItem = { id: string; kind: Kind; title: string; data: Record<string, any>; version: number; createdAt: string; updatedAt: string; deletedAt: string | null };
type StoredFile = { id: string; filename: string; mimeType: string; size: number; metadata: Record<string, any>; version: number; createdAt: string };
type Dashboard = { totalApplications: number; interviewCount: number; offerCount: number; invitationRate: number; stageCounts: Record<string, number>; upcoming: Array<{ data: Record<string, any> }>; recentApplications: Array<{ data: Record<string, any>; updatedAt: string }> };

const emptyDashboard: Dashboard = { totalApplications: 0, interviewCount: 0, offerCount: 0, invitationRate: 0, stageCounts: {}, upcoming: [], recentApplications: [] };
const stageOrder = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"];

const nav = [
  { id: "dashboard" as View, label: "数据总览", icon: LayoutDashboard },
  { id: "profile" as View, label: "个人资料", icon: UserRound },
  { id: "resumes" as View, label: "简历库", icon: FileText },
  { id: "applications" as View, label: "投递看板", icon: BriefcaseBusiness },
  { id: "evidence" as View, label: "事实库", icon: Database },
  { id: "analysis" as View, label: "岗位分析", icon: Sparkles },
  { id: "company" as View, label: "公司背调", icon: Building2 },
  { id: "interviews" as View, label: "面试复盘", icon: MessagesSquare },
  { id: "offers" as View, label: "OFFER 决策", icon: Scale },
  { id: "calendar" as View, label: "日程提醒", icon: CalendarDays },
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
  const [records, setRecords] = useState<Record<Kind, RecordItem[]>>({ applications: [], evidence: [], interviews: [], offers: [], reminders: [], analyses: [], research: [] });
  const [resumes, setResumes] = useState<StoredFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<StoredFile[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const kinds: Kind[] = ["applications", "evidence", "interviews", "offers", "reminders", "analyses", "research"];
      const [profileResult, dashboardResult, resumeResult, audioResult, ...recordResults] = await Promise.all([
        api<{ profile: Record<string, any> }>("/api/profile"),
        api<{ dashboard: Dashboard }>("/api/dashboard"),
        api<{ files: StoredFile[] }>("/api/files?purpose=resume"),
        api<{ files: StoredFile[] }>("/api/files?purpose=audio"),
        ...kinds.map((kind) => api<{ records: RecordItem[] }>(`/api/records?kind=${kind}`)),
      ]);
      setProfile(profileResult.profile);
      setDashboard(dashboardResult.dashboard);
      setResumes(resumeResult.files);
      setAudioFiles(audioResult.files);
      setRecords(Object.fromEntries(kinds.map((kind, index) => [kind, recordResults[index].records])) as Record<Kind, RecordItem[]>);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  async function uploadFile(file: File, purpose: "resume" | "avatar" | "audio", metadata: Record<string, string> = {}) {
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
      const response = await api<{ result: Record<string, any> }>("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "jobAnalysis", jobTitle: analysisInput.title, jd: analysisInput.jd }) });
      setAnalysisResult(response.result);
      refresh("analyses");
      toast.success("证据矩阵已生成");
    } catch (error) { toast.error((error as Error).message); }
    finally { setAnalysisBusy(false); }
  }

  async function analyzeResume(file: StoredFile) {
    const jd = window.prompt("可粘贴目标岗位 JD；留空则做通用事实检查", analysisInput.jd) ?? "";
    const toastId = toast.loading("正在读取并分析简历，完成后会删除供应商临时文件…");
    try {
      const response = await api<{ result: Record<string, any> }>("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resumeSuggestions", fileId: file.id, jd }) });
      setAnalysisResult({ ...response.result, sourceResume: file.metadata.displayName || file.filename });
      setView("analysis");
      toast.success("简历建议已生成", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function runResearch() {
    if (!company.trim()) return;
    setResearchBusy(true);
    try {
      await api("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "companyResearch", company }) });
      await refresh("research");
      toast.success("背调报告已生成并保存");
    } catch (error) { toast.error((error as Error).message); }
    finally { setResearchBusy(false); }
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

  async function uploadInterviewAudio(file: File) {
    if (!activeInterview) return;
    const toastId = toast.loading("正在保存录音…");
    try {
      const saved = await uploadFile(file, "audio", { displayName: `${activeInterview.data.company || "面试"}录音` });
      setAudioFiles((items) => [saved, ...items]);
      await updateInterview({ audioFileId: saved.id });
      toast.success("录音已保存", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function startRecording() {
    if (!activeInterview) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined });
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const file = new File([blob], `interview-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadInterviewAudio(file);
      };
      mediaRecorder.start(1000);
      recorder.current = mediaRecorder;
      setRecording(true);
      recordingTimer.current = setTimeout(() => stopRecording(), 4 * 60 * 1000);
    } catch { toast.error("无法使用麦克风，请检查浏览器权限"); }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    setRecording(false);
  }

  async function transcribeInterview() {
    if (!activeInterview?.data.audioFileId) return toast.error("请先录音或上传音频");
    const toastId = toast.loading("正在转写录音…");
    try {
      const response = await api<{ result: { text: string } }>("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transcribeAudio", fileId: activeInterview.data.audioFileId }) });
      await updateInterview({ transcript: response.result.text });
      toast.success("录音已转写", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  async function reviewInterview(transcriptOverride?: string) {
    if (!activeInterview) return;
    const toastId = toast.loading("正在生成面试复盘…");
    try {
      const transcript = transcriptOverride ?? activeInterview.data.transcript ?? "";
      const response = await api<{ result: Record<string, any> }>("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "interviewReview", role: activeInterview.data.role, jd: activeInterview.data.jd, transcript }) });
      await updateInterview({ transcript, review: response.result });
      toast.success("复盘报告已生成", { id: toastId });
    } catch (error) { toast.error((error as Error).message, { id: toastId }); }
  }

  function exportIcs() {
    const events = records.reminders.map((item) => {
      const date = new Date(item.data.dueAt || item.data.date);
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
        {view === "dashboard" && <DashboardView dashboard={dashboard} name={profile.name} onNavigate={setView} onAdd={() => setEditor({ kind: "applications" })} />}
        {view === "profile" && <ProfileView profile={profile} saveState={saveState} onChange={updateProfile} onSave={() => saveProfile(profile)} onAvatar={async (file) => { const saved = await uploadFile(file, "avatar"); updateProfile("avatarFileId", saved.id); }} />}
        {view === "resumes" && <ResumeView resumes={resumes} applications={records.applications} onUpload={uploadResume} onPreview={setPreview} onDelete={deleteFile} onAnalyze={analyzeResume} />}
        {view === "applications" && <ApplicationsView items={records.applications} resumes={resumes} onAdd={() => setEditor({ kind: "applications" })} onEdit={(item) => setEditor({ kind: "applications", item })} onDelete={(id) => deleteRecord("applications", id)} onMove={moveApplication} />}
        {view === "evidence" && <EvidenceView items={records.evidence} onAdd={() => setEditor({ kind: "evidence" })} onEdit={(item) => setEditor({ kind: "evidence", item })} onDelete={(id) => deleteRecord("evidence", id)} />}
        {view === "analysis" && <AnalysisView input={analysisInput} setInput={setAnalysisInput} busy={analysisBusy} result={analysisResult || records.analyses[0]?.data || null} onRun={runAnalysis} onEvidence={() => setView("evidence")} />}
        {view === "company" && <ResearchView company={company} setCompany={setCompany} busy={researchBusy} reports={records.research} onRun={runResearch} onDelete={(id) => deleteRecord("research", id)} />}
        {view === "interviews" && <InterviewView items={records.interviews} active={activeInterview} audioFiles={audioFiles} recording={recording} onSelect={setSelectedInterview} onAdd={() => setEditor({ kind: "interviews" })} onEdit={(item) => setEditor({ kind: "interviews", item })} onDelete={(id) => deleteRecord("interviews", id)} onSave={updateInterview} onRecord={recording ? stopRecording : startRecording} onAudio={uploadInterviewAudio} onTranscribe={transcribeInterview} onReview={reviewInterview} />}
        {view === "offers" && <OffersView items={records.offers} weights={weights} setWeights={setWeights} onAdd={() => setEditor({ kind: "offers" })} onEdit={(item) => setEditor({ kind: "offers", item })} onDelete={(id) => deleteRecord("offers", id)} />}
        {view === "calendar" && <CalendarView items={records.reminders} onAdd={() => setEditor({ kind: "reminders" })} onEdit={(item) => setEditor({ kind: "reminders", item })} onDelete={(id) => deleteRecord("reminders", id)} onExport={exportIcs} />}
      </main>

      <RecordEditor editor={editor} resumes={resumes} onClose={() => setEditor(null)} onSaved={async (kind) => { setEditor(null); await refresh(kind); toast.success("记录已保存"); }} />
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardView({ dashboard, name, onNavigate, onAdd }: { dashboard: Dashboard; name?: string; onNavigate: (view: View) => void; onAdd: () => void }) {
  const hasData = dashboard.totalApplications > 0;
  return <>
    <PageHead eyebrow="今天的求职节奏" title={`${name ? `${name}，` : ""}把每一步变得可追踪`} description="数据来自你的真实记录；没有投递时，所有指标保持为零。" action={<Button onClick={onAdd}><Plus />新增投递</Button>} />
    <section className="metric-grid">
      <article><span>累计投递</span><strong>{dashboard.totalApplications}</strong><small>全部真实记录</small></article>
      <article><span>进入面试</span><strong>{dashboard.interviewCount}</strong><small>邀约率 {dashboard.invitationRate}%</small></article>
      <article><span>收到 OFFER</span><strong>{dashboard.offerCount}</strong><small>等待比较与决策</small></article>
      <article><span>七日内日程</span><strong>{dashboard.upcoming.length}</strong><small>截止与面试提醒</small></article>
    </section>
    {!hasData ? <section className="onboarding panel"><div><span>从第一条真实机会开始</span><h2>建立你的秋招闭环</h2><p>先保存个人资料和简历，再添加目标岗位。后续分析、面试和 OFFER 都会围绕同一条记录展开。</p></div><ol><li><button onClick={() => onNavigate("profile")}><b>01</b><span>完善个人资料<small>用于分析与面试上下文</small></span></button></li><li><button onClick={() => onNavigate("resumes")}><b>02</b><span>上传简历版本<small>保存原文件与投递关联</small></span></button></li><li><button onClick={onAdd}><b>03</b><span>新增目标岗位<small>粘贴 JD 并开始投递</small></span></button></li></ol></section> : <div className="dashboard-grid"><section className="panel"><div className="panel-title"><div><h2>求职进展</h2><p>按当前阶段实时统计</p></div><button onClick={() => onNavigate("applications")}>打开看板</button></div><div className="stage-chart">{stageOrder.slice(0, 5).map((stage) => { const count = dashboard.stageCounts[stage] || 0; const max = Math.max(...Object.values(dashboard.stageCounts), 1); return <div key={stage}><strong>{count}</strong><i><b style={{ height: `${Math.max(8, count / max * 100)}%` }} /></i><span>{stage}</span></div>; })}</div></section><section className="panel"><div className="panel-title"><div><h2>七日内日程</h2><p>关键节点别错过</p></div><button onClick={() => onNavigate("calendar")}>查看全部</button></div><div className="agenda-list">{dashboard.upcoming.length ? dashboard.upcoming.map((item, index) => <article key={index}><time>{formatDate(item.data.dueAt, true)}</time><div><b>{item.data.title}</b><p>{item.data.type || "提醒"}</p></div></article>) : <p className="muted">未来七天没有安排</p>}</div></section></div>}
  </>;
}

function ProfileView({ profile, saveState, onChange, onSave, onAvatar }: { profile: Record<string, any>; saveState: string; onChange: (key: string, value: any) => void; onSave: () => void; onAvatar: (file: File) => void }) {
  return <><PageHead eyebrow="个人中心" title="你的求职底稿" description="所有字段都可以修改，更新会自动保存并用于后续分析。" action={<div className="save-state"><CheckCircle2 />{saveState}<Button variant="outline" onClick={onSave}><Save />立即保存</Button></div>} />
    <div className="profile-layout"><section className="panel profile-card"><div className="profile-avatar">{profile.avatarFileId ? <img src={`/api/files/content?id=${profile.avatarFileId}`} alt="个人头像" /> : <span>{(profile.name || "我").slice(0, 1)}</span>}<label><Upload />更换头像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && onAvatar(event.target.files[0])} /></label></div><h2>{profile.name || "尚未填写姓名"}</h2><p>{profile.targetRoles || "填写目标岗位后，AI 会更懂你的方向"}</p><StatusPill tone={profile.jobStatus ? "green" : "orange"}>{profile.jobStatus || "资料待完善"}</StatusPill></section>
      <section className="panel form-panel"><h2>基本信息</h2><div className="form-grid"><Field label="姓名"><Input value={profile.name || ""} onChange={(e) => onChange("name", e.target.value)} /></Field><Field label="手机"><Input value={profile.phone || ""} onChange={(e) => onChange("phone", e.target.value)} /></Field><Field label="邮箱"><Input type="email" value={profile.email || ""} onChange={(e) => onChange("email", e.target.value)} /></Field><Field label="当前城市"><Input value={profile.city || ""} onChange={(e) => onChange("city", e.target.value)} /></Field><Field label="求职状态"><select value={profile.jobStatus || ""} onChange={(e) => onChange("jobStatus", e.target.value)}><option value="">请选择</option><option>准备中</option><option>积极投递</option><option>面试中</option><option>已有 OFFER</option><option>暂缓求职</option></select></Field><Field label="到岗时间"><Input type="date" value={profile.availableDate || ""} onChange={(e) => onChange("availableDate", e.target.value)} /></Field></div><h2>目标与偏好</h2><div className="form-grid"><Field label="目标岗位"><Input value={profile.targetRoles || ""} placeholder="产品经理、策略产品" onChange={(e) => onChange("targetRoles", e.target.value)} /></Field><Field label="目标行业"><Input value={profile.targetIndustries || ""} onChange={(e) => onChange("targetIndustries", e.target.value)} /></Field><Field label="目标城市"><Input value={profile.targetCities || ""} onChange={(e) => onChange("targetCities", e.target.value)} /></Field><Field label="期望薪资"><Input value={profile.expectedSalary || ""} placeholder="例如 25K–35K × 15" onChange={(e) => onChange("expectedSalary", e.target.value)} /></Field></div><h2>经历与能力</h2><div className="form-stack"><Field label="教育经历"><Textarea value={profile.education || ""} placeholder="每行一段，写明学校、专业、时间" onChange={(e) => onChange("education", e.target.value)} /></Field><Field label="实习 / 工作经历"><Textarea value={profile.experience || ""} onChange={(e) => onChange("experience", e.target.value)} /></Field><Field label="项目经历"><Textarea value={profile.projects || ""} onChange={(e) => onChange("projects", e.target.value)} /></Field><Field label="技能标签"><Input value={profile.skills || ""} placeholder="SQL，用户研究，A/B 测试" onChange={(e) => onChange("skills", e.target.value)} /></Field><Field label="个人简介"><Textarea value={profile.bio || ""} onChange={(e) => onChange("bio", e.target.value)} /></Field></div></section></div></>;
}

function ResumeView({ resumes, applications, onUpload, onPreview, onDelete, onAnalyze }: { resumes: StoredFile[]; applications: RecordItem[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPreview: (file: StoredFile) => void; onDelete: (id: string) => void; onAnalyze: (file: StoredFile) => void }) {
  return <><PageHead eyebrow="多版本简历库" title="原文件私有保存，版本清晰可追踪" description="应用不会改写你的简历，只保存、预览、关联投递并生成可核验建议。" action={<label className="upload-button"><Upload />上传简历<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onUpload} /></label>} />
    {resumes.length ? <div className="resume-grid">{resumes.map((file) => { const linked = applications.filter((item) => item.data.resumeId === file.id); return <article className="resume-card" key={file.id}><div className="file-cover"><FileText /><span>{file.mimeType.includes("pdf") ? "PDF" : file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"}</span></div><div className="resume-body"><div><h2>{file.metadata.displayName || file.filename}</h2><p>{file.metadata.target || "未设置目标方向"}</p></div><dl><div><dt>源文件</dt><dd>{file.filename}</dd></div><div><dt>保存时间</dt><dd>{formatDate(file.createdAt, true)}</dd></div><div><dt>文件大小</dt><dd>{fileSize(file.size)}</dd></div><div><dt>已投岗位</dt><dd>{linked.length} 个</dd></div></dl>{file.metadata.note && <p className="resume-note">{file.metadata.note}</p>}<div className="tag-row">{(file.metadata.tags || []).map((tag: string) => <span key={tag}>{tag}</span>)}{linked.slice(0, 3).map((item) => <span key={item.id}>{item.data.company}</span>)}</div><div className="card-actions"><Button variant="outline" onClick={() => onPreview(file)}><Eye />预览</Button><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载</a></Button><Button onClick={() => onAnalyze(file)}><Sparkles />AI 建议</Button><Button variant="ghost" size="icon" aria-label="删除简历" onClick={() => onDelete(file.id)}><Trash2 /></Button></div></div></article>; })}</div> : <EmptyState icon={FileText} title="还没有简历版本" text="上传 PDF、DOCX 或 DOC，本地原文件会保存为你的私有云端副本。" action={<label className="upload-button"><Upload />上传第一份简历<input type="file" accept=".pdf,.doc,.docx" onChange={onUpload} /></label>} />}
  </>;
}

function ApplicationsView({ items, resumes, onAdd, onEdit, onDelete, onMove }: { items: RecordItem[]; resumes: StoredFile[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onMove: (item: RecordItem, stage: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.data.company} ${item.data.role}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHead eyebrow="投递管理" title="每个机会都有下一步" description="拖动卡片更新阶段，系统会自动保存阶段变更历史。" action={<Button onClick={onAdd}><Plus />新增投递</Button>} />
    <div className="toolbar"><div className="searchbox"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索公司或岗位" /></div><span><CheckCircle2 />云端已同步</span></div>
    {items.length ? <div className="kanban">{stageOrder.map((stage) => <section key={stage} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const item = items.find((candidate) => candidate.id === e.dataTransfer.getData("text/plain")); if (item) onMove(item, stage); }}><header><b>{stage}</b><span>{filtered.filter((item) => (item.data.stage || "待投递") === stage).length}</span></header><div>{filtered.filter((item) => (item.data.stage || "待投递") === stage).map((item) => { const resume = resumes.find((file) => file.id === item.data.resumeId); return <article draggable key={item.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}><div className="job-card-head"><span>{String(item.data.company || "?").slice(0, 1)}</span><div><h3>{item.data.company}</h3><p>{item.data.role}</p></div></div><div className="job-meta"><span>{item.data.location || "地点待定"}</span><span>{item.data.priority || "普通"}</span></div>{resume && <small>简历：{resume.metadata.displayName || resume.filename}</small>}{item.data.deadline && <small>截止：{formatDate(item.data.deadline)}</small>}<footer><button onClick={() => onEdit(item)}><Pencil />编辑</button><button onClick={() => onDelete(item.id)}><Trash2 />删除</button></footer></article>; })}</div></section>)}</div> : <EmptyState icon={BriefcaseBusiness} title="还没有投递记录" text="添加一个目标岗位，从 JD、简历到面试都可以围绕它持续积累。" action={<Button onClick={onAdd}><Plus />新增第一条投递</Button>} />}
  </>;
}

function EvidenceView({ items, onAdd, onEdit, onDelete }: { items: RecordItem[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void }) {
  const confirmed = items.filter((item) => item.data.status === "confirmed");
  const skills = new Set(items.flatMap((item) => Array.isArray(item.data.skills) ? item.data.skills : String(item.data.skills || "").split(/[,，]/)).filter(Boolean));
  return <><PageHead eyebrow="候选人事实库" title="AI 只使用你确认过的事实" description="每条事实都有来源、行动和结果；缺少证据时只标记缺口。" action={<Button onClick={onAdd}><Plus />添加事实</Button>} />
    <section className="mini-metrics"><article><span>已确认</span><strong>{confirmed.length}</strong></article><article><span>待补充</span><strong>{items.length - confirmed.length}</strong></article><article><span>能力标签</span><strong>{skills.size}</strong></article></section>
    {items.length ? <div className="evidence-grid">{items.map((item) => <article key={item.id} className={item.data.status === "confirmed" ? "confirmed" : "draft"}><header><div><h2>{item.data.title}</h2><p>{item.data.source || "手动添加"}</p></div><StatusPill tone={item.data.status === "confirmed" ? "green" : "orange"}>{item.data.status === "confirmed" ? "已确认" : "待补充"}</StatusPill></header><dl><div><dt>背景 / 任务</dt><dd>{item.data.context || "未填写"}</dd></div><div><dt>你的行动</dt><dd>{item.data.action || "未填写"}</dd></div><div><dt>结果 / 证据</dt><dd>{item.data.result || "未填写"}</dd></div></dl><div className="tag-row">{(Array.isArray(item.data.skills) ? item.data.skills : String(item.data.skills || "").split(/[,，]/)).filter(Boolean).map((skill: string) => <span key={skill}>{skill}</span>)}</div><footer><small>事实 ID：{item.id.slice(0, 8)}</small><div><button onClick={() => onEdit(item)}><Pencil />编辑</button><button onClick={() => onDelete(item.id)}><Trash2 />删除</button></div></footer></article>)}</div> : <EmptyState icon={Database} title="事实库还是空的" text="先添加一段可以在面试中解释和验证的经历，AI 才能安全地生成表达。" action={<Button onClick={onAdd}><Plus />添加第一条事实</Button>} />}
  </>;
}

function AnalysisView({ input, setInput, busy, result, onRun, onEvidence }: { input: { title: string; jd: string }; setInput: (next: { title: string; jd: string }) => void; busy: boolean; result: Record<string, any> | null; onRun: () => void; onEvidence: () => void }) {
  return <><PageHead eyebrow="岗位证据矩阵" title="每一个匹配结论都有依据" description="模型负责提取与映射，最终分数按公开权重公式计算。" />
    <div className="analysis-layout"><section className="panel form-panel"><Field label="岗位名称"><Input value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} placeholder="例如：字节跳动商业化产品经理" /></Field><Field label="完整职位描述"><Textarea className="jd-input" value={input.jd} onChange={(e) => setInput({ ...input, jd: e.target.value })} placeholder="粘贴岗位职责、任职要求和加分项…" /></Field><div className="privacy-note"><CheckCircle2 /><span><b>严格事实模式</b>仅匹配事实库中状态为“已确认”的内容。</span></div><Button size="lg" disabled={busy || input.jd.length < 40} onClick={onRun}>{busy ? <RefreshCw className="spin" /> : <Sparkles />}{busy ? "正在建立证据矩阵…" : "生成证据矩阵"}</Button></section><section className="panel analysis-summary">{result ? <><div className="score-ring" style={{ "--score": `${result.score || 0}%` } as React.CSSProperties}><strong>{result.score ?? "—"}</strong><span>证据覆盖</span></div><h2>{result.summary || "分析已完成"}</h2><p>必备项权重 3、重要项权重 2、加分项权重 1；强匹配计 100%，部分匹配计 55%。</p></> : <EmptyState icon={Sparkles} title="等待分析" text="输入 JD 后，系统会把要求、事实依据、缺口和下一步动作放在同一张表里。" />}</section></div>
    {result && <section className="panel matrix-panel"><div className="panel-title"><div><h2>要求与证据</h2><p>无引用的内容不会被标记为匹配</p></div><Button variant="outline" onClick={onEvidence}>管理事实库</Button></div>{Array.isArray(result.requirements) ? <div className="matrix-table"><div className="matrix-row head"><span>岗位要求</span><span>重要度</span><span>覆盖</span><span>依据与理由</span></div>{result.requirements.map((item: any, index: number) => <div className="matrix-row" key={index}><span><b>{item.label}</b></span><span>{item.importance === "must" ? "必备" : item.importance === "important" ? "重要" : "加分"}</span><span><StatusPill tone={item.coverage === "strong" ? "green" : item.coverage === "partial" ? "orange" : "red"}>{item.coverage === "strong" ? "强匹配" : item.coverage === "partial" ? "部分匹配" : "缺少证据"}</StatusPill></span><span><p>{item.reason}</p><small>{(item.evidenceIds || []).map((id: string) => `#${id.slice(0, 8)}`).join("、") || "没有可引用事实"}</small></span></div>)}</div> : null}{Array.isArray(result.suggestions) && <div className="suggestion-grid">{result.suggestions.map((item: any, index: number) => <article key={index}><span>建议 {index + 1}</span><h3>{item.issue}</h3><p>{item.suggestion}</p><small>风险：{item.risk || "无"}</small></article>)}</div>}</section>}
  </>;
}

function ResearchView({ company, setCompany, busy, reports, onRun, onDelete }: { company: string; setCompany: (value: string) => void; busy: boolean; reports: RecordItem[]; onRun: () => void; onDelete: (id: string) => void }) {
  return <><PageHead eyebrow="公司背调" title="来源不足，就不下结论" description="联网检索公开信息，保留来源、生成时间和置信度。" />
    <section className="research-bar"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="输入完整公司名称" onKeyDown={(e) => e.key === "Enter" && onRun()} /><Button disabled={busy || !company.trim()} onClick={onRun}>{busy ? <RefreshCw className="spin" /> : <Building2 />}{busy ? "正在交叉检索…" : "生成背调报告"}</Button></section>
    {reports.length ? <div className="report-list">{reports.map((report) => <article className="panel report" key={report.id}><header><div><h2>{report.data.company || report.title}</h2><p>{formatDate(report.data.generatedAt, true)} · 置信度 {report.data.confidence === "high" ? "高" : report.data.confidence === "medium" ? "中" : "低"}</p></div><button onClick={() => onDelete(report.id)}><Trash2 /></button></header><p className="report-overview">{report.data.overview}</p><div className="report-columns"><section><h3>已核实线索</h3><ul>{(report.data.facts || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>风险与不确定性</h3><ul>{(report.data.risks || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>面试建议确认</h3><ul>{(report.data.questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section></div><footer><h3>来源</h3><div className="source-list">{(report.data.sources || []).map((source: any, index: number) => <a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title}<small>{source.publishedAt || "日期未知"}</small></a>)}</div></footer></article>)}</div> : <EmptyState icon={Building2} title="还没有背调报告" text="输入公司名称后才会联网检索；不会展示预设或虚构报告。" />}
  </>;
}

function InterviewView({ items, active, recording, onSelect, onAdd, onEdit, onDelete, onSave, onRecord, onAudio, onTranscribe, onReview }: { items: RecordItem[]; active?: RecordItem; audioFiles: StoredFile[]; recording: boolean; onSelect: (id: string) => void; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onSave: (data: Record<string, any>) => void; onRecord: () => void; onAudio: (file: File) => void; onTranscribe: () => void; onReview: (transcript?: string) => void }) {
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(active?.data.transcript || ""), [active?.id, active?.data.transcript]);
  return <><PageHead eyebrow="面试辅导" title="准备、录音、转写、复盘" description="点评引用你的原话，不把 AI 生成内容当成真实经历。" action={<Button onClick={onAdd}><Plus />新建面试</Button>} />
    {items.length ? <div className="interview-layout"><aside className="panel interview-list">{items.map((item) => <button className={active?.id === item.id ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}><b>{item.data.company || "未命名公司"}</b><span>{item.data.role} · {item.data.round || "面试"}</span><small>{formatDate(item.data.scheduledAt, true)}</small></button>)}</aside>{active && <section className="panel interview-detail"><header><div><span>{active.data.round || "面试记录"}</span><h2>{active.data.company} · {active.data.role}</h2><p>{formatDate(active.data.scheduledAt, true)}</p></div><div><Button variant="outline" onClick={() => onEdit(active)}><Pencil />编辑</Button><Button variant="ghost" size="icon" onClick={() => onDelete(active.id)}><Trash2 /></Button></div></header><div className="recording-actions"><Button variant={recording ? "destructive" : "outline"} onClick={onRecord}>{recording ? <Square /> : <Mic />}{recording ? "停止并保存" : "开始录音"}</Button><label className="secondary-upload"><Upload />上传音频<input type="file" accept="audio/*,video/webm,video/mp4" onChange={(e) => e.target.files?.[0] && onAudio(e.target.files[0])} /></label><Button variant="outline" disabled={!active.data.audioFileId} onClick={onTranscribe}><Sparkles />转写录音</Button></div><Field label="转写或复盘文本"><Textarea className="transcript" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="录音转写会出现在这里，也可以手动粘贴面试记录。" /></Field><div className="detail-actions"><Button variant="outline" onClick={() => onSave({ transcript: draft })}><Save />保存文本</Button><Button disabled={draft.length < 30} onClick={() => onReview(draft)}><Sparkles />生成 AI 复盘</Button></div>{active.data.review && <div className="review-board"><div><h3>复盘摘要</h3><p>{active.data.review.summary}</p></div><div className="review-columns"><section><h3>做得较好</h3><ul>{(active.data.review.strengths || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>需要补强</h3><ul>{(active.data.review.gaps || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section><section><h3>下一步行动</h3><ul>{(active.data.review.actions || []).map((item: string) => <li key={item}>{item}</li>)}</ul></section></div>{active.data.review.quotes?.length ? <blockquote>“{active.data.review.quotes[0]}”<small>点评依据的原话</small></blockquote> : null}</div>}</section>}</div> : <EmptyState icon={MessagesSquare} title="还没有面试记录" text="新建面试后可以录音、上传音频、编辑转写并生成复盘。" action={<Button onClick={onAdd}><Plus />新建第一次面试</Button>} />}
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

function CalendarView({ items, onAdd, onEdit, onDelete, onExport }: { items: RecordItem[]; onAdd: () => void; onEdit: (item: RecordItem) => void; onDelete: (id: string) => void; onExport: () => void }) {
  const sorted = [...items].sort((a, b) => new Date(a.data.dueAt || 0).getTime() - new Date(b.data.dueAt || 0).getTime());
  return <><PageHead eyebrow="日程提醒" title="截止、笔试和面试集中查看" description="日程来自你的真实记录，可导出到系统日历。" action={<div className="head-actions"><Button variant="outline" disabled={!items.length} onClick={onExport}><Download />导出 ICS</Button><Button onClick={onAdd}><Plus />添加日程</Button></div>} />
    {items.length ? <div className="timeline">{sorted.map((item) => <article key={item.id}><time><b>{new Date(item.data.dueAt).getDate()}</b><span>{new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(new Date(item.data.dueAt))}</span></time><div><StatusPill>{item.data.type || "提醒"}</StatusPill><h2>{item.data.title}</h2><p>{formatDate(item.data.dueAt, true)} · {item.data.notes || "无备注"}</p></div><footer><button onClick={() => onEdit(item)}><Pencil /></button><button onClick={() => onDelete(item.id)}><Trash2 /></button></footer></article>)}</div> : <EmptyState icon={CalendarDays} title="日历还是空的" text="添加面试、笔试、网申截止或 OFFER 接受期限。" action={<Button onClick={onAdd}><Plus />添加第一个提醒</Button>} />}
  </>;
}

const editorFields: Record<Kind, Array<{ key: string; label: string; type?: string; options?: string[]; required?: boolean }>> = {
  applications: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "location", label: "工作地点" }, { key: "stage", label: "当前阶段", type: "select", options: stageOrder }, { key: "priority", label: "优先级", type: "select", options: ["高", "普通", "低"] }, { key: "deadline", label: "截止日期", type: "date" }, { key: "salary", label: "薪资范围" }, { key: "sourceUrl", label: "岗位链接", type: "url" }, { key: "contact", label: "联系人" }, { key: "resumeId", label: "关联简历", type: "resume" }, { key: "jd", label: "职位描述", type: "textarea" }, { key: "notes", label: "备注", type: "textarea" },
  ],
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
  analyses: [], research: [],
};

function RecordEditor({ editor, resumes, onClose, onSaved }: { editor: { kind: Kind; item?: RecordItem } | null; resumes: StoredFile[]; onClose: () => void; onSaved: (kind: Kind) => void }) {
  const [saving, setSaving] = useState(false);
  if (!editor) return null;
  const currentEditor = editor;
  const labels: Record<Kind, string> = { applications: "投递", evidence: "事实", interviews: "面试", offers: "OFFER", reminders: "日程", analyses: "分析", research: "背调" };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget); const data: Record<string, any> = { ...(currentEditor.item?.data || {}) };
    for (const field of editorFields[currentEditor.kind]) { const value = form.get(field.key); data[field.key] = field.type === "number" ? Number(value || 0) : String(value || ""); }
    if (currentEditor.kind === "evidence") data.skills = String(data.skills || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
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
