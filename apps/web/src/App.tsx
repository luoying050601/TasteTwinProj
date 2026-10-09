import {useState, useRef} from 'react';
import {api} from './api';
import type {ApiError, Interpretation, Results, Selection, Stage, Constraints} from './types';
import MealRow, {MealFacts} from './components/MealRow';
import PixelTwin from './components/PixelTwin';

const example = '我想吃日式，安静，一个人，1000 日元以内，附近';
const busyStages: Stage[] = ['PARSING','SEARCHING','REFINING'];
function chips(c: Constraints) {
 return [...c.cuisines, ...c.ambience, ...(c.partySize ? [`${c.partySize} 人`] : []), ...(c.budgetMax ? [`≤ ${c.budgetMax} ${c.currency || '?'}`] : []), ...(c.maxWalkMinutes ? [`≤ ${c.maxWalkMinutes} min`] : []), ...(c.excludeSpicy ? ['不要辣'] : []), ...c.allergens.map(x=>`排除 ${x}`)];
}
export default function App() {
 const [sessionId,setSessionId]=useState(()=>crypto.randomUUID());
 const [message,setMessage]=useState(example);
 const [city,setCity]=useState('Tokyo');
 const [allergens,setAllergens]=useState('');
 const [summaryMode,setSummaryMode]=useState<'fixture'|'manual'|'none'>('fixture');
 const [actual,setActual]=useState('42'); const [target,setTarget]=useState('65');
 const [stage,setStage]=useState<Stage>('START');
 const [parsed,setParsed]=useState<Interpretation|null>(null);
 const [results,setResults]=useState<Results|null>(null);
 const [selection,setSelection]=useState<Selection|null>(null);
 const [refinement,setRefinement]=useState('');
 const [enabled,setEnabled]=useState(true);
 const [error,setError]=useState<ApiError|null>(null);
 const [working,setWorking]=useState(false);
 const retry = useRef<null|(()=>void)>(null);
 const lock = useRef(false);
 const busy = working || busyStages.includes(stage);
 const mode = results?.dataMode || 'fixture';
 const activeConstraints=results?.constraints || parsed?.constraints;

 async function run(next: Stage, success: Stage, action:()=>Promise<void>, retryAction:()=>void) {
   if(lock.current) return;
   lock.current=true;setWorking(true);setError(null); const previous=stage;setStage(next);retry.current=retryAction;
   try {await action();setStage(success);} catch(e){setError(e as ApiError);setStage(previous);} finally{lock.current=false;setWorking(false);}
 }
 async function interpret() {
  if(!message.trim() || message.length>500){setError({code:'VALIDATION_ERROR',message:'请输入 1–500 字的需求',retryable:false});return;}
  if(summaryMode==='manual' && (!actual.trim() || !target.trim() || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || Number(actual)<0 || Number(target)<=0)) {setError({code:'VALIDATION_ERROR',message:'摄入须为非负数，目标须大于 0',retryable:false});return;}
  await run('PARSING','CONFIRM',async()=>{
   const dailySummary=summaryMode==='none' ? null : {proteinG:summaryMode==='fixture'?42:Number(actual),targetProteinG:summaryMode==='fixture'?65:Number(target),sourceType:summaryMode};
   const data=await api<Interpretation>('/api/interpret',{sessionId,message,locale:'zh-CN',location:{city},dailySummary,allergens:allergens.split(',').map(x=>x.trim()).filter(Boolean)});
   setParsed(data);setResults(null);setSelection(null);
  },()=>void interpret());
 }
 async function recommend(tasteEnabled=enabled) {
  await run('SEARCHING',results?.appliedChanges.length?'REFINED':'RESULTS',async()=>{
   const data=await api<Results>('/api/recommend',{sessionId,qlooEnabled:tasteEnabled,limit:results?.appliedChanges.length?2:3});
   setResults(data);setEnabled(tasteEnabled);setSelection(null);
  },()=>void recommend(tasteEnabled));
 }
 async function refine(text=refinement) {
  if(!text.trim()) return;
  await run('REFINING','REFINED',async()=>{setResults(await api<Results>('/api/refine',{sessionId,refinement:text}));setRefinement('');},()=>void refine(text));
 }
 async function select(candidateId: string) {
  await run('SEARCHING','SELECTED',async()=>setSelection(await api<Selection>('/api/select',{sessionId,candidateId})),()=>void select(candidateId));
 }
 async function reset() {
  await run(stage,'START',async()=>{
    await api(`/api/sessions/${sessionId}`,undefined,'DELETE');
    setSessionId(crypto.randomUUID());setParsed(null);setResults(null);setSelection(null);setRefinement('');setMessage(example);setCity('Tokyo');setAllergens('');setSummaryMode('fixture');setActual('42');setTarget('65');setEnabled(true);
  },()=>void reset());
 }
 const step=stage==='SELECTED'?4:['RESULTS','REFINED','REFINING'].includes(stage)?3:stage==='CONFIRM'||stage==='SEARCHING'?2:1;
 return <div className="shell">
  <header className="topbar"><a className="brand" href="#top"><span className="brand-icon">✿</span>Taste<span>Twin</span><small>YOUR NEXT MEAL, MORE YOU.</small></a><div className="header-actions"><span className="mode">● {mode==='baseline'?'WITHOUT QLOO · FIXTURE CANDIDATES':'DESIGN PROTOTYPE · QLOO FIXTURE'}</span><button className="text-button" disabled={busy} onClick={()=>void reset()}>重新开始 ↺</button></div></header>
  <main id="top">
   <section className="hero"><div className="hero-copy"><p className="eyebrow">NUTRITION MATCH × TASTE MATCH</p><h1>下一餐，<br/>更合你的<span>心意。</span></h1><p className="intro">把今天想吃的、需要补充的，<br/>和愿意走的距离，放在同一次选择里。</p><a href="#flow" className="hero-link">从一句话开始 <span>↓</span></a><div className="hero-note">框架预览 · React + FastAPI<br/>Qloo 与 Agent 框架尚未连接</div></div><div className="hero-art"><img src="/tastetwin-hero.png" alt="TasteTwin 像素厨房中的数字伙伴与餐食"/><span className="art-caption">A small choice. A little closer to you.</span></div></section>
   <div className="prototype-warning" role="note"><span>DEMO DATA</span><p>所有餐厅、菜单、营养、价格、步行与口味排序均为虚构 fixture。这个版本用于验证框架，尚不能作为真实 Qloo 集成提交。</p></div>
   <nav className="steps" aria-label="流程进度">{['说说需求','确认条件','挑选下一餐','餐食 Preview'].map((label,i)=><div className={step===i+1?'active':''} aria-current={step===i+1?'step':undefined} key={label}><span>0{i+1}</span>{label}</div>)}</nav>
   <div className="workspace" id="flow"><aside className="companion"><PixelTwin state={stage==='SELECTED'?'happy':busy?'thinking':'idle'}/><p className="eyebrow">YOUR TASTE COMPANION</p><h2>{stage==='SELECTED'?'选好啦。':'先找到，你愿意吃的一餐。'}</h2><p>{selection?.twinMessage || '先确认你的条件，再按营养、演示口味信号和便利性比较。未知数据会如实显示。'}</p><div className="sidebar-divider"/><small>今日营养摘要</small><strong>{summaryMode==='none'?'尚未提供':`${summaryMode==='fixture'?'42':actual} / ${summaryMode==='fixture'?'65':target} g`}</strong><p className="caption">蛋白质 · {summaryMode==='fixture'?'演示目标，非通用建议':summaryMode==='manual'?'用户手动输入':'仍可按口味和地点搜索'}</p>{parsed&&<p className="gap">{parsed.nutritionGap.level==='unavailable'?'营养缺口不可用':parsed.nutritionGap.nutrient==='none'?'接近本次配置目标':`本次目标下还差 ${parsed.nutritionGap.missingAmount} ${parsed.nutritionGap.unit} ${parsed.nutritionGap.nutrient}`}</p>}</aside>
    <section className="flow-content" aria-live="polite">
     {error&&<div className="error" role="alert"><strong>{error.message}</strong><small>{error.code} {error.requestId}</small><div>{error.retryable&&<button disabled={busy} onClick={()=>retry.current?.()}>重试</button>}<button disabled={busy} onClick={()=>{setError(null);setStage('START');}}>修改输入</button></div></div>}
     {(stage==='START'||stage==='PARSING')&&<section className="panel"><p className="eyebrow">01 / TELL US WHAT YOU NEED</p><h2>今天，想吃点什么？</h2><p className="muted">菜系、预算、氛围和距离，都可以写在一句话里。</p><form onSubmit={e=>{e.preventDefault();void interpret();}}><label htmlFor="message">你的需求</label><textarea id="message" rows={4} value={message} maxLength={500} onChange={e=>setMessage(e.target.value)} disabled={busy} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void interpret();}}}/><div className="input-bottom"><button type="button" className="text-button" disabled={busy} onClick={()=>setMessage(example)}>使用示例句</button><small>{message.length}/500 · Shift + Enter 换行</small></div><div className="form-grid"><div><label htmlFor="city">搜索区域</label><input id="city" value={city} onChange={e=>setCity(e.target.value)} maxLength={80} disabled={busy}/><small>fixture 仅覆盖 Tokyo 虚构场景</small></div><div><label htmlFor="allergens">过敏原代码（逗号分隔）</label><input id="allergens" placeholder="例如 peanut, soy" value={allergens} onChange={e=>setAllergens(e.target.value)} disabled={busy}/><small>未知成分在有过敏限制时被排除</small></div></div><details className="nutrition-input"><summary>营养摘要与目标来源</summary><label htmlFor="summary">选择数据来源</label><select id="summary" value={summaryMode} onChange={e=>setSummaryMode(e.target.value as typeof summaryMode)} disabled={busy}><option value="fixture">Demo fixture：蛋白质 42 / 65 g</option><option value="manual">手动输入蛋白质日汇总</option><option value="none">暂不提供营养数据</option></select>{summaryMode==='manual'&&<div className="form-grid"><div><label htmlFor="actual">今日摄入（g）</label><input id="actual" type="number" min="0" step="any" value={actual} onChange={e=>setActual(e.target.value)} disabled={busy}/></div><div><label htmlFor="target">你的配置目标（g）</label><input id="target" type="number" min="0.01" step="any" value={target} onChange={e=>setTarget(e.target.value)} disabled={busy}/></div></div>}</details><button className="primary" disabled={busy||!message.trim()}>{stage==='PARSING'?'解析中…':'Ask TasteTwin →'}</button></form></section>}
     {stage==='CONFIRM'&&parsed&&<section className="panel"><p className="eyebrow">02 / CHECK THE DETAILS</p><h2>我们理解得对吗？</h2><p className="confirmation">{parsed.confirmationText}</p><div className="chips">{chips(parsed.constraints).map(x=><span key={x}>{x}</span>)}</div><p className="caption">{parsed.notice}</p>{parsed.needsClarification&&<p className="clarification">{parsed.clarificationQuestion}。点「修改输入」补充后重新解析。</p>}<div className="actions"><button className="primary" disabled={busy||parsed.needsClarification} onClick={()=>void recommend()}>确认并查找 →</button><button disabled={busy} onClick={()=>setStage('START')}>修改输入</button></div></section>}
     {(stage==='SEARCHING'||stage==='REFINING')&&<div className="loading" role="status"><PixelTwin state="thinking"/><h2>{stage==='REFINING'?'重新应用你的条件…':'正在处理…'}</h2><p>营养计算 · 成分过滤 · fixture 匹配 · 排序</p></div>}
     {results&&['RESULTS','REFINED'].includes(stage)&&<section className="panel result-panel"><div className="result-heading"><div><p className="eyebrow">03 / YOUR NEXT MEAL</p><h2>{results.recommendations.length} 个可比较的选择</h2></div><label className="toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>void recommend(e.target.checked)}/><span>演示口味信号 {enabled?'ON':'OFF'}</span></label></div><p className="caption">这是 fixture 的同候选集重排，用于预演未来的 Qloo ON / OFF 功能。</p><div className="chips">{activeConstraints&&chips(activeConstraints).map(x=><span key={x}>{x}</span>)}</div><div className="trace">{results.trace.map((x,i)=><span key={x.tool}>{i+1}. {x.tool} ✓</span>)}</div>{results.recommendations.length?results.recommendations.map(item=><MealRow key={item.candidateId} item={item} disabled={busy} onSelect={id=>void select(id)}/>):<div className="empty"><h3>还没有合适选项</h3><p>{results.emptyMessage}</p><button onClick={()=>setStage('START')} disabled={busy}>修改预算或距离</button></div>}<div className="refinement"><h3>再调整一下？</h3><div className="quick-actions">{['再近一点','更便宜','不要辣'].map(x=><button key={x} disabled={busy} onClick={()=>void refine(x)}>{x} ↗</button>)}</div><form onSubmit={e=>{e.preventDefault();void refine();}}><label className="sr-only" htmlFor="refinement">修正需求</label><input id="refinement" value={refinement} maxLength={200} placeholder="框架版支持：再近一点、更便宜、不要辣" disabled={busy} onChange={e=>setRefinement(e.target.value)}/><button disabled={busy||!refinement.trim()}>更新结果 →</button></form>{results.appliedChanges.length>0&&<p className="caption">已应用：{results.appliedChanges.map(x=>`${x.field}: ${String(x.from)} → ${String(x.to)}`).join('；')}</p>}</div><details className="judge"><summary>查看框架与同候选集比较</summary><p>{results.comparison.label}</p><p>ON：{results.comparison.withTaste.join(' → ')}</p><p>OFF：{results.comparison.withoutTaste.join(' → ')}</p><p>React → FastAPI → nutrition / safety / fixture adapter / ranker。当前规则工具轨迹不代表已接入 Agent 框架。</p></details></section>}
     {stage==='SELECTED'&&selection&&<section className="panel preview"><p className="eyebrow">04 / MEAL PREVIEW</p><PixelTwin state="happy"/><h2>把这餐，放进今天。</h2><p className="muted">{selection.recommendation.placeName}</p><h3>{selection.recommendation.menuName}</h3><MealFacts item={selection.recommendation}/><p className="taste">Taste fit · {selection.recommendation.tasteFit} · fixture</p><p className="twin-message">“{selection.twinMessage}”</p><p className="caption">这是选中餐食的演示 Preview，数值来自同一 candidateId；尚未记录实际食用。</p><button className="primary" disabled={busy} onClick={()=>void reset()}>开始新的一次选择 ↺</button></section>}
    </section></div>
   <footer><strong>TasteTwin</strong><p>一般饮食与偏好辅助，不诊断疾病。演示会话仅保存在后端单进程内存中，1 小时过期；重新开始会删除会话。页面刷新不恢复输入。健康和过敏数据不会发给 Qloo；当前未调用外部 AI 服务。</p><span>LOCAL FRAMEWORK · v0.1</span></footer>
  </main>
 </div>;
}
