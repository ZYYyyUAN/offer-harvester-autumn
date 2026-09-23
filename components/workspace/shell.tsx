"use client";

import type { ReactNode } from "react";
import { Bookmark, BookOpen, BriefcaseBusiness, Building2, CalendarDays, Database, FileText, Globe2, LayoutDashboard, ListChecks, Menu, MessagesSquare, RefreshCw, Scale, Search, Sparkles, Timer, Trash2, UserRound, X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import type { View } from "@/components/workspace/types";

const navigation = [
  ["dashboard", "数据总览", LayoutDashboard], ["today", "今日行动", Timer], ["profile", "个人资料", UserRound], ["feishu", "飞书同步", RefreshCw],
  ["resumes", "简历库", FileText], ["savedJobs", "收藏岗位", Bookmark], ["applications", "投递看板", BriefcaseBusiness], ["tasks", "行动清单", ListChecks],
  ["evidence", "事实库", Database], ["analysis", "岗位分析", Sparkles], ["aiCenter", "AI 任务中心", ListChecks], ["company", "公司背调", Building2],
  ["interviews", "面试复盘", MessagesSquare], ["foreignPrep", "外企准备", Globe2], ["offers", "OFFER 决策", Scale], ["calendar", "日程提醒", CalendarDays],
  ["knowledge", "求职知识库", BookOpen], ["resources", "寻找岗位", Search], ["trash", "回收站", Trash2],
] as const;

export function WorkspaceShell({ children, view, onNavigate, mobileNav, setMobileNav, profile, displayName, saveState, totalApplications }: { children: ReactNode; view: View; onNavigate: (view: View) => void; mobileNav: boolean; setMobileNav: (open: boolean) => void; profile: Record<string, any>; displayName: string; saveState: string; totalApplications: number }) {
  const navigate = (next: View) => { onNavigate(next); setMobileNav(false); };
  return <div className="app-shell">
    <Toaster position="top-center" richColors />
    <header className="topbar"><button className="mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu /></button><button className="brand" onClick={() => navigate("dashboard")}><span className="brand-mark">O</span><b>OFFER 收割机</b></button><div className="topbar-status"><span className="privacy-dot" /> 私人云端工作台</div><button className="user-chip" onClick={() => navigate("profile")}><span>{(profile.name || displayName || "我").slice(0, 1)}</span><div><b>{profile.name || "完善个人资料"}</b><small>{saveState}</small></div></button></header>
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}><div className="sidebar-head"><span>求职全流程</span><button onClick={() => setMobileNav(false)} aria-label="关闭导航"><X /></button></div><nav>{navigation.map(([id, label, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon /><span>{label}</span>{id === "applications" && totalApplications > 0 ? <em>{totalApplications}</em> : null}</button>)}</nav><div className="sidebar-foot"><b>数据归你所有</b><p>文件私有保存，AI 仅在你主动分析时读取。</p></div></aside>
    {mobileNav && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <main className="workspace">{children}</main>
  </div>;
}
