const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const defaultApplications = [
  {id:1, company:'字节跳动', role:'产品经理 · 商业化', location:'北京', stage:'面试中', deadline:'09-16', priority:'高优先级', match:92},
  {id:2, company:'腾讯', role:'产品培训生', location:'深圳', stage:'已投递', deadline:'09-18', priority:'本周截止', match:86},
  {id:3, company:'美团', role:'用户增长产品经理', location:'上海', stage:'笔试中', deadline:'09-20', priority:'本周截止', match:78},
  {id:4, company:'小红书', role:'社区产品经理', location:'上海', stage:'待投递', deadline:'09-22', priority:'高优先级', match:89},
  {id:5, company:'阿里云', role:'产品运营', location:'杭州', stage:'已投递', deadline:'09-25', priority:'普通', match:75},
  {id:6, company:'云程科技', role:'商业化产品经理', location:'北京', stage:'OFFER', deadline:'09-28', priority:'高优先级', match:91},
  {id:7, company:'星河互娱', role:'策略产品经理', location:'上海', stage:'OFFER', deadline:'09-26', priority:'普通', match:84},
  {id:8, company:'快手', role:'增长产品经理', location:'北京', stage:'面试中', deadline:'09-24', priority:'普通', match:82}
];
let applications = JSON.parse(localStorage.getItem('offer-applications') || 'null') || defaultApplications;
let currentFilter = 'all';
const defaultEvidence = [
  {id:101,title:'新用户激活增长实验',source:'星桥科技 · 产品实习',context:'新用户完成注册后的核心功能使用率偏低，我负责定位流失节点并提出改版方案。',action:'分析 3.2 万条行为数据，访谈 18 名用户，设计两轮 A/B 测试并协调设计、研发上线。',result:'新用户次日激活率从 42% 提升至 54%，核心路径流失率下降 16%。',skills:['用户研究','数据分析','A/B 测试','用户增长'],status:'已确认'},
  {id:102,title:'跨团队版本推进',source:'知行校园 · 项目负责人',context:'项目需求频繁变化，研发与运营对优先级存在分歧。',action:'建立需求评分表和每周评审机制，拆分关键里程碑并同步风险清单。',result:'版本按期上线，平均需求确认周期缩短 30%。',skills:['项目管理','需求分析','跨团队协作'],status:'已确认'},
  {id:103,title:'商业化功能方案设计',source:'星桥科技 · 产品实习',context:'内容创作者缺少稳定的商业化工具，平台付费转化较低。',action:'完成竞品拆解、创作者分层和付费路径设计，输出 PRD 并推动灰度验证。',result:'首批 260 名创作者参与灰度，付费转化率提升 8.6%。',skills:['商业化策略','竞品分析','产品设计','数据分析'],status:'已确认'},
  {id:104,title:'校园社群运营项目',source:'校学生会 · 项目经历',context:'新生社群活跃度不足，需要重新设计内容与活动节奏。',action:'策划主题内容和线上活动，但个人贡献与结果数据尚未补齐。',result:'待补充可验证数据。',skills:['内容运营','沟通协作'],status:'待补充'}
];
let evidenceItems = JSON.parse(localStorage.getItem('offer-evidence') || 'null') || defaultEvidence;
let evidenceFilter = 'all';

function showToast(message){
  $('#toastText').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(()=>$('#toast').classList.remove('show'),2200);
}

function showView(id){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const target = $('#'+id) || $('#placeholder');
  target.classList.add('active');
  $$('.nav-item,.side-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  history.replaceState(null,'','#'+id);
  window.scrollTo(0,0);
  if(id==='offers') setTimeout(drawRadar,30);
}
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));

function escapeHTML(value){return String(value).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}

function renderKanban(){
  const stages=['待投递','已投递','笔试中','面试中','OFFER'];
  const query=($('#applicationSearch')?.value||'').trim().toLowerCase();
  const visible=applications.filter(item=>(currentFilter==='all'||item.priority===currentFilter)&&(!query||`${item.company}${item.role}`.toLowerCase().includes(query)));
  $('#kanbanBoard').innerHTML=stages.map(stage=>{
    const cards=visible.filter(item=>item.stage===stage);
    return `<section class="kanban-column" data-stage="${stage}"><div class="kanban-head"><strong>${stage}</strong><span>${cards.length}</span></div>${cards.map(item=>`<article class="job-card" draggable="true" data-id="${item.id}"><div class="job-card-top"><h3>${escapeHTML(item.company)}</h3><b class="match-pill">${item.match}%</b></div><p>${escapeHTML(item.role)}</p><div class="job-meta"><span>${escapeHTML(item.location)}</span><span class="${item.priority!=='普通'?'urgent':''}">${escapeHTML(item.priority)}</span><span>${escapeHTML(item.deadline)}</span></div></article>`).join('')||'<p style="color:#9aa1b1;font-size:13px;text-align:center;margin-top:40px">暂无记录</p>'}</section>`;
  }).join('');
  $$('.job-card').forEach(card=>card.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',card.dataset.id)));
  $$('.kanban-column').forEach(col=>{
    col.addEventListener('dragover',e=>e.preventDefault());
    col.addEventListener('drop',e=>{e.preventDefault();const item=applications.find(x=>String(x.id)===e.dataTransfer.getData('text/plain'));if(item){item.stage=col.dataset.stage;saveApplications();renderKanban();showToast(`已移动到「${item.stage}」`);}});
  });
}
function saveApplications(){localStorage.setItem('offer-applications',JSON.stringify(applications));}
$('#applicationSearch')?.addEventListener('input',renderKanban);
$$('.filter').forEach(button=>button.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));button.classList.add('active');currentFilter=button.dataset.filter;renderKanban();}));
const applicationDialog=$('#applicationDialog');
$('#addApplication')?.addEventListener('click',()=>applicationDialog.showModal());
$$('[data-open-application]').forEach(button=>button.addEventListener('click',()=>applicationDialog.showModal()));
$('#applicationForm')?.addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel') return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.currentTarget));
  applications.unshift({id:Date.now(),company:data.company,role:data.role,location:data.location,stage:data.stage,deadline:(data.deadline||'').slice(5),priority:data.priority,match:Math.floor(76+Math.random()*18)});
  saveApplications();renderKanban();applicationDialog.close();event.currentTarget.reset();showToast('投递记录已保存');showView('applications');
});

const resumeTitles={product:'产品经理通用版 v4',growth:'用户增长方向 v2',campus:'管培生方向 v3',english:'英文简历 v1'};
$$('.resume-item').forEach(button=>button.addEventListener('click',()=>{$$('.resume-item').forEach(x=>x.classList.remove('active'));button.classList.add('active');$('#resumeTitle').textContent=resumeTitles[button.dataset.resume];}));
$('#optimizeResume')?.addEventListener('click',()=>{showView('analysis');if(!$('#jdInput').value){$('#jdInput').value=sampleJD;updateCount();}showToast('请生成证据矩阵后审阅改写建议');});
$('#newResume')?.addEventListener('click',()=>showToast('已创建空白简历版本'));

function saveEvidence(){localStorage.setItem('offer-evidence',JSON.stringify(evidenceItems));}
function evidenceHasMetric(item){return /\d+(?:\.\d+)?\s*(?:%|万|千|人|条|次|天|小时)/.test(item.result);}
function renderEvidence(){
  if(!$('#evidenceList')) return;
  const visible=evidenceItems.filter(item=>evidenceFilter==='all'||item.status===evidenceFilter);
  $('#evidenceCount').textContent=evidenceItems.filter(x=>x.status==='已确认').length;
  $('#skillCount').textContent=new Set(evidenceItems.flatMap(x=>x.skills)).size;
  $('#metricCount').textContent=evidenceItems.filter(evidenceHasMetric).length;
  const confirmed=evidenceItems.filter(x=>x.status==='已确认').length;
  const readiness=Math.min(100,Math.round(54+confirmed*7+evidenceItems.filter(evidenceHasMetric).length*4));
  $('#readinessScore').textContent=`${readiness}%`;
  $('.readiness-bar i').style.width=`${readiness}%`;
  $('.readiness-card ul').innerHTML=`<li><b>${confirmed}</b> 条已确认经历</li><li><b>${new Set(evidenceItems.flatMap(x=>x.skills)).size}</b> 个能力标签</li><li><b>${evidenceItems.filter(evidenceHasMetric).length}</b> 项量化结果</li>`;
  $('#evidenceList').innerHTML=visible.map(item=>`<article class="evidence-card ${item.status==='待补充'?'pending':''}"><div class="evidence-card-head"><div><h3>${escapeHTML(item.title)}</h3><span class="evidence-source">${escapeHTML(item.source)}</span></div><span class="verify-pill ${item.status==='待补充'?'pending':''}">${item.status==='已确认'?'✓ 已确认':'! 待补充'}</span></div><dl><dt>背景</dt><dd>${escapeHTML(item.context)}</dd><dt>行动</dt><dd>${escapeHTML(item.action)}</dd><dt>结果</dt><dd class="result">${escapeHTML(item.result)}</dd></dl><div class="skill-tags">${item.skills.map(skill=>`<span class="skill-tag">${escapeHTML(skill)}</span>`).join('')}</div><div class="evidence-action"><small>事实编号 #${item.id}</small><button data-toggle-evidence="${item.id}">${item.status==='已确认'?'标记为待补充':'确认事实可使用'}</button></div></article>`).join('')||'<div class="empty-card"><span>○</span><h2>暂无相符事实</h2><p>切换筛选条件或添加新的经历证据。</p></div>';
  $$('[data-toggle-evidence]').forEach(button=>button.addEventListener('click',()=>{const item=evidenceItems.find(x=>String(x.id)===button.dataset.toggleEvidence);if(item){item.status=item.status==='已确认'?'待补充':'已确认';saveEvidence();renderEvidence();showToast('事实状态已更新');}}));
}
$$('.evidence-filter').forEach(button=>button.addEventListener('click',()=>{$$('.evidence-filter').forEach(x=>x.classList.remove('active'));button.classList.add('active');evidenceFilter=button.dataset.evidenceFilter;renderEvidence();}));
const evidenceDialog=$('#evidenceDialog');
$('#addEvidence')?.addEventListener('click',()=>evidenceDialog.showModal());
$('#evidenceForm')?.addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel') return;
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));
  evidenceItems.unshift({id:Date.now(),title:data.title,source:'用户手动添加',context:data.context,action:data.action,result:data.result,skills:data.skills.split(/[,，]/).map(x=>x.trim()).filter(Boolean),status:'已确认'});
  saveEvidence();renderEvidence();evidenceDialog.close();event.currentTarget.reset();showToast('经历证据已加入事实库');
});

const sampleJD=`岗位职责：\n1. 负责商业化产品的需求分析、方案设计和项目推进；\n2. 通过用户研究和数据分析发现增长机会，制定产品迭代策略；\n3. 协同研发、设计、运营团队推动项目落地，并对核心业务指标负责。\n\n任职要求：\n1. 本科及以上学历，有互联网产品实习经历；\n2. 具备用户洞察、数据分析和 A/B 测试能力；\n3. 熟练使用 SQL，具备良好的沟通协作和项目管理能力。`;
$('#fillSample')?.addEventListener('click',()=>{$('#jdInput').value=sampleJD;updateCount();});
function updateCount(){if($('#charCount')) $('#charCount').textContent=`${$('#jdInput').value.length} 字`;}
$('#jdInput')?.addEventListener('input',updateCount);

const competencyRules=[
  {label:'需求分析',terms:['需求分析','需求挖掘','需求判断','需求优先级']},
  {label:'用户研究',terms:['用户研究','用户洞察','用户访谈','用户调研']},
  {label:'数据分析',terms:['数据分析','数据驱动','指标分析','业务指标']},
  {label:'A/B 测试',terms:['a/b','ab测试','实验设计','对照实验']},
  {label:'项目推进',terms:['项目推进','项目管理','推动项目','推动落地','按期上线']},
  {label:'跨团队协作',terms:['跨团队','协同研发','沟通协作','协调资源']},
  {label:'商业化策略',terms:['商业化','变现','付费转化']},
  {label:'用户增长',terms:['用户增长','增长机会','增长策略','转化率']},
  {label:'产品设计',terms:['方案设计','产品设计','prd','原型设计']},
  {label:'SQL',terms:['sql','数据库查询']},
  {label:'英语能力',terms:['英语','英文','cet-6','六级']}
];
function extractRequirements(text){
  const sentences=text.split(/[\n。；;]/).map(x=>x.replace(/^\s*\d+[.、)]?\s*/, '').trim()).filter(x=>x.length>5);
  const found=[];
  competencyRules.forEach(rule=>{
    const sentence=sentences.find(line=>rule.terms.some(term=>line.toLowerCase().includes(term.toLowerCase())));
    if(sentence) found.push({...rule,sentence,importance:/必须|熟练|具备|任职要求|负责/.test(sentence)?'必备':'重要'});
  });
  return found.slice(0,9);
}
function matchRequirement(requirement){
  const candidates=evidenceItems.filter(x=>x.status==='已确认').map(item=>{
    const haystack=`${item.title} ${item.context} ${item.action} ${item.result} ${item.skills.join(' ')}`.toLowerCase();
    const hits=requirement.terms.filter(term=>haystack.includes(term.toLowerCase()));
    const labelHit=haystack.includes(requirement.label.toLowerCase());
    return {item,hits:Math.max(hits.length,labelHit?1:0)};
  }).sort((a,b)=>b.hits-a.hits);
  const best=candidates[0];
  if(!best||best.hits===0)return {level:'missing',label:'缺少证据',score:0,item:null};
  const strong=best.hits>=2||best.item.skills.some(skill=>skill.toLowerCase()===requirement.label.toLowerCase());
  return {level:strong?'strong':'partial',label:strong?'强匹配':'部分匹配',score:strong?1:.55,item:best.item};
}
function buildSuggestion(match,requirement){
  if(!match.item)return `事实库中未找到「${requirement.label}」经历。若确实做过，请先补充背景、行动和结果；没有则保留为真实差距。`;
  if(match.level==='partial')return `已有相关经历但证据不足。补充你在「${match.item.title}」中的个人判断和可验证结果。`;
  return `将「${match.item.title}」放在相关经历前部，并优先呈现行动与量化结果。`;
}
function renderMatrix(requirements){
  const matches=requirements.map(req=>({req,match:matchRequirement(req)}));
  const total=matches.reduce((sum,row)=>sum+row.match.score*(row.req.importance==='必备'?2:1),0);
  const weight=matches.reduce((sum,row)=>sum+(row.req.importance==='必备'?2:1),0)||1;
  const score=Math.round(total/weight*100);
  const counts={strong:matches.filter(x=>x.match.level==='strong').length,partial:matches.filter(x=>x.match.level==='partial').length,missing:matches.filter(x=>x.match.level==='missing').length};
  const result=$('#analysisResult');
  result.innerHTML=`<div class="matrix-head"><div class="matrix-score"><strong>${score}%</strong><div><h2>${score>=80?'证据覆盖良好':score>=60?'具备基础匹配':'存在关键证据缺口'}</h2><p>分数由岗位要求的重要度与事实覆盖强度计算</p></div></div><div class="matrix-summary"><span><b>${counts.strong}</b> 强匹配</span><span><b>${counts.partial}</b> 部分匹配</span><span><b>${counts.missing}</b> 缺少证据</span></div></div><div class="matrix-wrap"><table class="evidence-matrix"><thead><tr><th>岗位要求</th><th>重要度</th><th>覆盖</th><th>事实依据</th><th>下一步动作</th></tr></thead><tbody>${matches.map(({req,match})=>`<tr><td class="requirement-cell"><strong>${escapeHTML(req.label)}</strong><small>${escapeHTML(req.sentence)}</small></td><td><span class="importance ${req.importance==='必备'?'must':''}">${req.importance}</span></td><td><span class="coverage ${match.level}">${match.label}</span></td><td><div class="evidence-quote">${match.item?`<b>${escapeHTML(match.item.title)}</b>${escapeHTML(match.item.result)}`:'未找到已确认事实'}</div></td><td><div class="next-action">${escapeHTML(buildSuggestion(match,req))}${match.level==='missing'?'<button data-view="evidence">＋ 补充真实经历</button>':''}</div></td></tr>`).join('')}</tbody></table></div><div class="suggestion-board">${matches.filter(x=>x.match.item).slice(0,2).map(({req,match},index)=>`<article class="suggestion-card"><h3>建议 ${index+1} · ${escapeHTML(req.label)}</h3><p class="before">负责相关工作并推动项目落地。</p><p class="after">${escapeHTML(match.item.action)}${escapeHTML(match.item.result)}</p><footer><small>来源：事实 #${match.item.id}</small><button data-accept-suggestion>采纳建议</button></footer></article>`).join('')}<article class="suggestion-card"><h3>严格事实检查</h3><p>本次分析未新增候选人事实。${counts.missing?`有 ${counts.missing} 项缺口需要你确认，不会自动写入简历。`:'所有表达均可回溯到已确认经历。'}</p><footer><small>事实一致性保护已开启</small><button data-view="resumes">进入简历库</button></footer></article></div>`;
  $$('[data-view]',result).forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $$('[data-accept-suggestion]',result).forEach(button=>button.addEventListener('click',()=>{button.textContent='✓ 已采纳';button.classList.add('accepted');showToast('建议已加入当前优化清单');}));
  return {score,counts,requirements:matches.map(({req,match})=>({requirement:req.label,importance:req.importance,coverage:match.label,evidence:match.item?.title||null}))};
}
function analyzeCurrentJD(){
  const text=$('#jdInput').value.trim();
  if(text.length<20){showToast('请先粘贴完整的职位描述');return null;}
  const requirements=extractRequirements(text);
  if(!requirements.length){showToast('未识别到明确能力要求，请补充岗位职责与任职要求');return null;}
  const result=$('#analysisResult');result.innerHTML='<div class="analysis-empty"><div class="spark">✦</div><h2>正在建立证据对应关系…</h2><p>只检索已确认事实，不补写未知经历</p></div>';
  setTimeout(()=>renderMatrix(requirements),520);
  return {requirements:requirements.map(x=>x.label)};
}
$('#runAnalysis')?.addEventListener('click',analyzeCurrentJD);

$('#companyForm')?.addEventListener('submit',event=>{
  event.preventDefault();const name=$('#companyInput').value.trim();if(!name){showToast('请输入公司名称');return;}
  $$('.intel-card').forEach((card,index)=>{card.style.opacity='.3';card.style.transform='translateY(8px)';setTimeout(()=>{card.style.transition='.35s';card.style.opacity='1';card.style.transform='none';},220+index*120)});showToast(`已生成「${name}」背调速览`);
});

let timerHandle=null,timerSeconds=0;
$('#startTimer')?.addEventListener('click',event=>{
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;event.currentTarget.textContent='◉ 继续计时';return;}
  timerHandle=setInterval(()=>{timerSeconds++;event.currentTarget.textContent=`Ⅱ ${String(Math.floor(timerSeconds/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`;},1000);
});
$('#interviewNotes').value=localStorage.getItem('offer-interview-notes')||'';
$('#saveInterview')?.addEventListener('click',()=>{localStorage.setItem('offer-interview-notes',$('#interviewNotes').value);showToast('面试复盘已保存');});
$$('.questions li').forEach((item,index)=>item.addEventListener('click',()=>{$$('.questions li').forEach(x=>x.classList.remove('active'));item.classList.add('active');$('.answer-panel>h2').textContent=item.textContent.trim();$('.answer-head>span').textContent=`问题 ${index+1} / 5`;}));

const offerData=[
  {name:'云程科技',role:'商业化产品经理',salary:'32K × 15',city:'北京',scores:[86,82,76,68,80]},
  {name:'星河互娱',role:'策略产品经理',salary:'30K × 16',city:'上海',scores:[78,74,88,82,72]}
];
const dimensions=['薪资待遇','成长空间','公司平台','工作生活','行业前景'];
let weights=[30,25,18,15,12];
function totalScore(item){const total=weights.reduce((a,b)=>a+b,0);return Math.round(item.scores.reduce((sum,v,i)=>sum+v*weights[i],0)/total);}
function renderWeights(){
  $('#weightControls').innerHTML=dimensions.map((d,i)=>`<div class="weight-row"><div class="weight-label"><span>${d}</span><b>${weights[i]}</b></div><input type="range" min="5" max="50" value="${weights[i]}" data-weight="${i}" aria-label="${d}权重"></div>`).join('');
  $$('[data-weight]').forEach(input=>input.addEventListener('input',()=>{weights[+input.dataset.weight]=+input.value;input.previousElementSibling.querySelector('b').textContent=input.value;renderOffers();drawRadar();}));
}
function renderOffers(){
  const scores=offerData.map(totalScore),max=Math.max(...scores);
  $('#offerCards').innerHTML=offerData.map((item,i)=>`<article class="offer-card ${scores[i]===max?'winner':''}"><div><h3>${item.name} ${scores[i]===max?'<span class="tag tag-blue">当前更优</span>':''}</h3><p>${item.role}</p></div><div class="offer-card-score">${scores[i]}</div><dl><div><dt>总包</dt><dd>${item.salary}</dd></div><div><dt>地点</dt><dd>${item.city}</dd></div><div><dt>接受截止</dt><dd>09-${i?28:26}</dd></div></dl></article>`).join('');
}
function drawRadar(){
  const canvas=$('#radarCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2+8,R=130,n=dimensions.length;ctx.clearRect(0,0,w,h);ctx.font='13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let level=1;level<=5;level++){ctx.beginPath();for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n,r=R*level/5,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.strokeStyle='#dfe4ee';ctx.stroke();}
  for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);ctx.strokeStyle='#e6eaf2';ctx.stroke();ctx.fillStyle='#687187';ctx.fillText(dimensions[i],cx+Math.cos(a)*(R+28),cy+Math.sin(a)*(R+22));}
  const colors=[['rgba(47,100,233,.22)','#2f64e9'],['rgba(240,139,62,.18)','#f08b3e']];offerData.forEach((item,j)=>{ctx.beginPath();item.scores.forEach((v,i)=>{const a=-Math.PI/2+i*2*Math.PI/n,r=R*v/100,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fillStyle=colors[j][0];ctx.fill();ctx.strokeStyle=colors[j][1];ctx.lineWidth=2.5;ctx.stroke();});
}
$('#addOffer')?.addEventListener('click',()=>showToast('已新增一个待编辑的 OFFER 对比位'));

function renderCalendar(){
  const cells=[];cells.push('<span class="calendar-day muted">31</span>');for(let day=1;day<=30;day++)cells.push(`<button class="calendar-day ${day===16?'selected ':''}${[10,12,16,18,20,24,28].includes(day)?'has-event':''}" aria-label="9月${day}日">${day}</button>`);for(let day=1;day<=4;day++)cells.push(`<span class="calendar-day muted">${day}</span>`);$('#calendarDays').innerHTML=cells.join('');
}

function registerWebMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const tools=[
    {name:'list_applications',title:'查看投递记录',description:'读取当前秋招投递看板中的所有记录。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({count:applications.length,applications})},
    {name:'create_application',title:'新增投递记录',description:'向秋招投递看板新增一条公司岗位记录。',inputSchema:{type:'object',properties:{company:{type:'string'},role:{type:'string'},location:{type:'string'},stage:{type:'string',enum:['待投递','已投递','笔试中','面试中','OFFER']}},required:['company','role'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input.company?.trim()||!input.role?.trim())throw new Error('公司和岗位不能为空');const item={id:Date.now(),company:input.company.trim(),role:input.role.trim(),location:input.location||'待确认',stage:input.stage||'待投递',deadline:'待确认',priority:'普通',match:80};applications.unshift(item);saveApplications();renderKanban();return {created:true,id:item.id,stage:item.stage};}},
    {name:'list_evidence',title:'查看候选人事实',description:'读取候选人事实库中已确认和待补充的经历证据。',inputSchema:{type:'object',properties:{confirmedOnly:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:input=>{const items=input.confirmedOnly?evidenceItems.filter(x=>x.status==='已确认'):evidenceItems;return {count:items.length,evidence:items};}},
    {name:'create_evidence',title:'添加经历证据',description:'把用户明确提供的真实经历加入候选人事实库。',inputSchema:{type:'object',properties:{title:{type:'string'},context:{type:'string'},action:{type:'string'},result:{type:'string'},skills:{type:'array',items:{type:'string'}}},required:['title','context','action','result','skills'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input.title?.trim()||!input.action?.trim())throw new Error('标题和行动不能为空');const item={id:Date.now(),title:input.title.trim(),source:'工具添加',context:input.context.trim(),action:input.action.trim(),result:input.result.trim(),skills:input.skills.map(x=>String(x).trim()).filter(Boolean),status:'已确认'};evidenceItems.unshift(item);saveEvidence();renderEvidence();return {created:true,id:item.id};}},
    {name:'analyze_job_evidence',title:'生成岗位证据矩阵',description:'用已确认的候选人事实分析职位描述，返回可解释的要求覆盖结果。',inputSchema:{type:'object',properties:{jobDescription:{type:'string'}},required:['jobDescription'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(input.jobDescription.trim().length<20)throw new Error('职位描述至少需要20个字符');showView('analysis');$('#jdInput').value=input.jobDescription;updateCount();const requirements=extractRequirements(input.jobDescription);if(!requirements.length)throw new Error('未识别到明确能力要求');const output=renderMatrix(requirements);return {score:output.score,counts:output.counts,requirements:output.requirements};}}
  ];tools.forEach(tool=>Promise.resolve(context.registerTool(tool)).catch(()=>{}));
}

renderKanban();renderEvidence();renderWeights();renderOffers();renderCalendar();registerWebMCP();
const initial=location.hash.slice(1);if(initial&&$('#'+initial))showView(initial);
