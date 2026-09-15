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
$('#optimizeResume')?.addEventListener('click',()=>{const button=$('#optimizeResume');button.textContent='正在分析…';button.disabled=true;setTimeout(()=>{button.textContent='再次优化';button.disabled=false;showToast('AI 优化建议已更新');},900);});
$('#newResume')?.addEventListener('click',()=>showToast('已创建空白简历版本'));

const sampleJD=`岗位职责：\n1. 负责商业化产品的需求分析、方案设计和项目推进；\n2. 通过用户研究和数据分析发现增长机会，制定产品迭代策略；\n3. 协同研发、设计、运营团队推动项目落地，并对核心业务指标负责。\n\n任职要求：\n1. 本科及以上学历，有互联网产品实习经历；\n2. 具备用户洞察、数据分析和 A/B 测试能力；\n3. 良好的逻辑思维、沟通协作和项目管理能力。`;
$('#fillSample')?.addEventListener('click',()=>{$('#jdInput').value=sampleJD;updateCount();});
function updateCount(){if($('#charCount')) $('#charCount').textContent=`${$('#jdInput').value.length} 字`;}
$('#jdInput')?.addEventListener('input',updateCount);
$('#runAnalysis')?.addEventListener('click',()=>{
  const text=$('#jdInput').value.trim();
  if(text.length<20){showToast('请先粘贴完整的职位描述');return;}
  const result=$('#analysisResult');
  result.innerHTML='<div class="analysis-empty"><div class="spark">✦</div><h2>正在拆解岗位要求…</h2><p>识别关键词与经历匹配关系</p></div>';
  setTimeout(()=>{
    result.innerHTML=`<div class="result-inner"><div class="match-score"><strong>87%</strong><div><h3>匹配度较高</h3><p>核心经历符合，补齐 2 处表达后更有竞争力</p></div></div><div class="result-section"><h3>岗位核心关键词</h3><div class="keyword-cloud"><span>需求分析</span><span>项目推进</span><span>数据分析</span><span>A/B 测试</span><span>用户洞察</span><span class="missing">商业化策略 · 待补充</span></div></div><div class="result-section"><h3>优势匹配</h3><ul><li>已有从需求洞察到项目上线的完整项目经历。</li><li>简历中的增长实验数据能直接支撑岗位要求。</li><li>跨团队协作经验与岗位工作方式吻合。</li></ul></div><div class="result-section"><h3>简历调整建议</h3><ul><li>将项目标题改为“商业化增长实验”，强化业务方向。</li><li>在首段加入 A/B 测试方法和最终转化提升数据。</li><li>补充你在需求优先级判断中的具体决策依据。</li></ul></div><button class="primary" data-view="resumes">带着建议去优化简历 →</button></div>`;
    result.querySelector('[data-view]').addEventListener('click',()=>showView('resumes'));
  },850);
});

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
    {name:'start_job_analysis',title:'开始岗位分析',description:'打开岗位分析页面并填入要分析的职位描述。',inputSchema:{type:'object',properties:{jobDescription:{type:'string'}},required:['jobDescription'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(input.jobDescription.trim().length<20)throw new Error('职位描述至少需要20个字符');showView('analysis');$('#jdInput').value=input.jobDescription;updateCount();return {ready:true,characters:input.jobDescription.length};}}
  ];tools.forEach(tool=>Promise.resolve(context.registerTool(tool)).catch(()=>{}));
}

renderKanban();renderWeights();renderOffers();renderCalendar();registerWebMCP();
const initial=location.hash.slice(1);if(initial&&$('#'+initial))showView(initial);
