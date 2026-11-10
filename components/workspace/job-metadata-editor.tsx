"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, Field } from "./shared";
import { applyMetadataSuggestions, canonicalCompanyTag, channelLabels, discoveryLabels, platformLabels, decideMetadataSuggestion, employmentLabels, JobMetadataSchema, manualMetadataEdit, metadataContext, natureLabels, tagLabels, type JobMetadata, type MetadataField } from "@/lib/job-metadata";

const sourceLabels = { manual: "你填写", confirmed_profile: "已确认公司资料", url_rule: "链接规则建议", page_explicit: "页面明确记载", ocr_explicit: "截图可见文字", ai_inference: "AI 待核实建议", legacy: "旧值待核实" };
export function confirmMetadataReview(metadata: JobMetadata, company: string, sourceUrl: string) {
  let next = metadata;
  const contextKey = metadataContext(company, sourceUrl), now = new Date().toISOString();
  metadata.suggestions.forEach((suggestion, index) => { if (suggestion.status === "suggested" && suggestion.evidence.contextKey === contextKey && metadata.fieldStates[suggestion.field]?.status === "suggested" && JSON.stringify(metadata[suggestion.field]) === JSON.stringify(suggestion.value)) next = decideMetadataSuggestion(next, index, true, contextKey, now); });
  return next;
}
export function JobMetadataEditor({ value, company, sourceUrl, onChange, submission = false }: { value?: JobMetadata; company: string; sourceUrl: string; onChange: (value: JobMetadata) => void; submission?: boolean }) {
  const metadata = value || JobMetadataSchema.parse({}), contextKey = metadataContext(company, sourceUrl);
  const live = useRef({ metadata, contextKey }), requestSequence = useRef(0);
  useEffect(() => { live.current = { metadata, contextKey }; }, [metadata, contextKey]);
  const [busy, setBusy] = useState(false), [profiles, setProfiles] = useState<Array<{ id: string; version: number; data: Record<string, any> }>>([]), [profileOpen, setProfileOpen] = useState(false), [registryId, setRegistryId] = useState("");
  const [research, setResearch] = useState<Array<{ id: string; title: string; data: Record<string, any> }>>([]), [researchId, setResearchId] = useState("");
  useEffect(() => { if (profileOpen) api<any>("/api/records?kind=research").then((result) => setResearch(result.records)).catch((error) => toast.error(error.message)); }, [profileOpen]);
  const [tagsText, setTagsText] = useState(metadata.companyTags.map((tag) => tagLabels[tag as keyof typeof tagLabels] || tag).join("、"));
  useEffect(() => {
    const parsed = tagsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean).map((s) => Object.keys(tagLabels).find((key) => tagLabels[key as keyof typeof tagLabels] === s) || canonicalCompanyTag(s));
    if (JSON.stringify(parsed) !== JSON.stringify(metadata.companyTags)) setTagsText(metadata.companyTags.map((tag) => tagLabels[tag as keyof typeof tagLabels] || tag).join("、"));
  }, [tagsText, metadata.companyTags]);
  useEffect(() => { api<any>("/api/company-profiles").then((result) => setProfiles(result.records)).catch((error) => toast.error(error.message)); }, []);
  useEffect(() => {
    if (!value) return;
    const profile = profiles.find((p) => p.id === value.companyProfileId);
    if (profile && ![profile.data.legalName, ...(profile.data.confirmedAliases || [])].includes(company.trim())) { onChange({ ...applyMetadataSuggestions(value, [], contextKey), companyProfileId: null }); return; }
    if (Object.values(value.fieldStates).some((state) => state.contextKey !== contextKey && !["needs_review", "unset"].includes(state.status)) || value.suggestions.some((s) => s.status !== "stale" && s.evidence.contextKey !== contextKey)) onChange(applyMetadataSuggestions(value, [], contextKey));
  }, [contextKey, value, onChange, profiles, company]);
  const edit = (field: MetadataField, next: string | string[]) => onChange(manualMetadataEdit(metadata, field, next, contextKey, new Date().toISOString()));
  async function identify(profileId = metadata.companyProfileId) {
    const requestId = ++requestSequence.current;
    setBusy(true);
    try {
      const result = await api<any>("/api/job-metadata/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company, sourceUrl, jobMetadata: { ...metadata, companyProfileId: profileId } }) });
      if (requestId !== requestSequence.current || live.current.contextKey !== contextKey) return;
      onChange({ ...applyMetadataSuggestions(live.current.metadata, result.metadata.suggestions, contextKey), companyProfileId: result.metadata.companyProfileId, companyProfileCandidate: result.metadata.companyProfileCandidate });
      toast.success("建议已更新，请与当前值一起核对");
    }
    catch (error) { toast.error((error as Error).message); } finally { if (requestId === requestSequence.current) setBusy(false); }
  }
  async function saveProfile() {
    setBusy(true);
    try {
      const existing = profiles.find((p) => p.id === metadata.companyProfileId);
      const data = { legalName: existing?.data.legalName || company, registryId, confirmedAliases: existing?.data.confirmedAliases || [], companyNature: metadata.companyNature, companyTags: metadata.companyTags,
        researchRecordId: researchId || existing?.data.researchRecordId || "",
        evidence: [{ sourceType: "manual", sourceRef: "user", quote: "用户核对公司主体及分类", obtainedAt: new Date().toISOString(), version: "job-metadata-v1", contextKey }] };
      const result = await api<any>("/api/company-profiles", { method: existing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(existing ? { id: existing.id, version: existing.version, data } : data) });
      const next = structuredClone(metadata); next.companyProfileId = result.record.id;
      for (const state of Object.values(next.fieldStates)) if (state.evidence?.sourceType === "confirmed_profile" && state.evidence.sourceRef === result.record.id) state.evidence.profileVersion = result.record.version;
      setProfiles((items) => [...items.filter((p) => p.id !== result.record.id), result.record]); onChange(next); setProfileOpen(false); toast.success("已保存公司资料；不会修改历史投递分类");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  }
  function rejectProfile() {
    requestSequence.current++;
    setBusy(false);
    const id = metadata.companyProfileCandidate?.id || metadata.companyProfileId;
    if (!id) return;
    let next = metadata;
    metadata.suggestions.forEach((suggestion, index) => { if (suggestion.status === "suggested" && suggestion.evidence.sourceRef === id) next = decideMetadataSuggestion(next, index, false, contextKey, new Date().toISOString()); });
    onChange({ ...next, companyProfileId: null, companyProfileCandidate: null, profileRejections: [...next.profileRejections, { id, contextKey }] });
  }
  const fields: Array<[MetadataField, string, Record<string, string>]> = [["companyNature", "公司性质", natureLabels], ["employmentType", "岗位用工类型", employmentLabels], ["discoverySource", "最初发现来源", discoveryLabels], ["submissionChannel", "计划投递渠道", channelLabels], ["referralStatus", "是否内推", { unknown: "未知", yes: "是", no: "否" }]];
  const display = (field: MetadataField, v: unknown) => field === "companyTags" ? (v as string[]).map((tag) => tagLabels[tag as keyof typeof tagLabels] || tag).join("、") : (fields.find(([key]) => key === field)?.[2] || {})[String(v)] || String(v);
  return <section className="metadata-editor" aria-label="公司分类与渠道核对">
    <div className="card-actions"><h3>公司分类与求职渠道</h3><Button type="button" variant="outline" onClick={() => identify()} disabled={busy}>{busy ? "识别中…" : "识别渠道与复用资料"}</Button></div>
    <p>当前链接平台：{platformLabels[metadata.linkPlatform] || metadata.linkPlatform}。承载系统不等于投递渠道，也不证明最初发现来源。</p>
    {metadata.companyProfileCandidate && <div className="capture-warnings"><b>可复用的公司资料候选：{metadata.companyProfileCandidate.legalName}</b><p>{metadata.companyProfileCandidate.identityBasis === "exact_name" ? "名称与已确认主体完全相同" : "匹配你此前确认的同一主体别名"}；核对并保存后才采用，不合并公司档案。</p><div className="card-actions"><Button type="button" variant="outline" onClick={() => identify(metadata.companyProfileCandidate!.id)}>采用公司主体关联</Button><Button type="button" variant="ghost" onClick={rejectProfile}>不复用此候选</Button></div></div>}
    <p className="muted">识别渠道不调用 AI。公司性质不根据名称猜测；未知可以留空。下列选择随“核对并保存”确认，计划渠道不代表已经投递。</p>
    <div className="editor-grid">{fields.map(([field, label, options]) => <Field key={field} label={label}><select aria-label={label} value={String(metadata[field])} onChange={(event) => edit(field, event.target.value)}>{Object.entries(options).filter(([key]) => field !== "submissionChannel" || !["friend", "xiaohongshu", "maimai"].includes(key)).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select><small>{metadata.fieldStates[field]?.status === "needs_review" ? "公司或链接已改变，请重新核对当前选择" : metadata.fieldStates[field]?.evidence ? sourceLabels[metadata.fieldStates[field]!.evidence!.sourceType] : "尚未确认"}</small>{metadata.fieldStates[field]?.status === "needs_review" && <Button type="button" variant="outline" onClick={() => edit(field, metadata[field])}>确认保留当前值</Button>}</Field>)}
      <Field label="公司辅助标签（多选，可自定义）"><Input aria-label="公司辅助标签" value={tagsText} placeholder="银行、制造、初创…" onChange={(event) => { setTagsText(event.target.value); edit("companyTags", event.target.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean).map((s) => Object.keys(tagLabels).find((key) => tagLabels[key as keyof typeof tagLabels] === s) || canonicalCompanyTag(s))); }} /><small>大厂、中厂为个人标签，不能证明公司性质。</small></Field>
      {(["discoverySource", "submissionChannel"] as const).map((field) => metadata[field] === "other" && <Field key={field} label={field === "discoverySource" ? "其他发现来源" : "其他计划渠道"}><Input value={metadata.customLabels[field]} onChange={(event) => onChange({ ...metadata, customLabels: { ...metadata.customLabels, [field]: event.target.value } })} /></Field>)}
      <Field label="内推码（可选）"><Input value={metadata.referralCode} onChange={(event) => edit("referralCode", event.target.value)} /><small>分享码、spread 参数不会自动认定为内推。</small></Field>
      <Field label="已确认公司主体"><select aria-label="已确认公司主体" value={metadata.companyProfileId || ""} onChange={(event) => { const id = event.target.value; if (id) identify(id); else rejectProfile(); }}><option value="">不关联公司档案</option>{profiles.filter((p) => [p.data.legalName, ...(p.data.confirmedAliases || [])].includes(company.trim())).map((p) => <option key={p.id} value={p.id}>{p.data.legalName} · v{p.version}</option>)}</select><small>品牌、子公司不会自动套用其他主体资料。</small></Field>
    </div>
    {metadata.suggestions.some((s) => s.status === "suggested" && s.evidence.contextKey === contextKey) && <div className="capture-conflicts"><b>识别依据与建议</b>{metadata.suggestions.map((s, index) => s.status === "suggested" && s.evidence.contextKey === contextKey && <article key={index}><p>{sourceLabels[s.evidence.sourceType]}：{display(s.field, s.value)}</p><small>{[s.evidence.quote, ...(s.evidence.additionalQuotes || [])].join("；")} · {s.evidence.version} · {new Date(s.evidence.obtainedAt).toLocaleString()}</small>{metadata.fieldStates[s.field]?.status !== "suggested" && <p>当前：{display(s.field, metadata[s.field])}，保留你的选择</p>}<div className="card-actions"><Button type="button" variant="outline" onClick={() => onChange(decideMetadataSuggestion(metadata, index, true, contextKey, new Date().toISOString()))}>采用此建议</Button><Button type="button" variant="ghost" onClick={() => onChange(decideMetadataSuggestion(metadata, index, false, contextKey, new Date().toISOString()))}>拒绝此建议</Button></div></article>)}</div>}
    <div className="card-actions"><Button type="button" variant="ghost" disabled={!company.trim()} onClick={() => { setRegistryId(profiles.find((p) => p.id === metadata.companyProfileId)?.data.registryId || ""); setProfileOpen(!profileOpen); }}>{metadata.companyProfileId ? "修订已关联公司资料" : "保存已核对的公司资料供复用"}</Button><a href="/?view=company" target="_blank" rel="noreferrer">前往公司背调核实</a></div>
    {profileOpen && <div><p>请确认“{company}”是本次招聘的准确主体。保存仅供以后选择复用，不改写历史。</p><Field label="统一社会信用代码（可选）"><Input value={registryId} onChange={(event) => setRegistryId(event.target.value)} /></Field><Field label="参考公司背调（可选，报告不自动成为已确认事实）"><select value={researchId} onChange={(event) => setResearchId(event.target.value)}><option value="">不增加参考报告</option>{research.filter((r) => r.data.company === company.trim()).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>{researchId && <p>{research.find((r) => r.id === researchId)?.data.overview || "请在公司背调页面核对原报告、来源和主体后确认分类。"}</p>}<Button type="button" onClick={saveProfile} disabled={busy}>确认公司主体与当前分类</Button></div>}
    {submission && <div className="capture-warnings"><h4>确认实际投递</h4><p>只在已经真实提交后核对。留作未知也可以完成投递，不根据计划渠道推测。</p>{metadata.submissionChannel !== "unknown" && <Button type="button" variant="outline" onClick={() => onChange({ ...metadata, actualSubmission: { channel: metadata.submissionChannel, customLabel: metadata.customLabels.submissionChannel, contextKey, confirmedAt: new Date().toISOString() } })}>确认沿用计划渠道：{channelLabels[metadata.submissionChannel]}</Button>}<Field label="本次实际提交渠道"><select aria-label="本次实际提交渠道" value={metadata.actualSubmission?.channel || "unknown"} onChange={(event) => onChange({ ...metadata, actualSubmission: { channel: event.target.value as JobMetadata["submissionChannel"], customLabel: "", contextKey, confirmedAt: new Date().toISOString() } })}>{Object.entries(channelLabels).filter(([key]) => !["friend", "xiaohongshu", "maimai"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>{metadata.actualSubmission?.channel === "other" && <Field label="其他实际渠道"><Input value={metadata.actualSubmission.customLabel} onChange={(event) => onChange({ ...metadata, actualSubmission: { ...metadata.actualSubmission!, customLabel: event.target.value } })} /></Field>}</div>}
  </section>;
}
