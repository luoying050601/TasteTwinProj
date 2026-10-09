import {useState, useRef, useEffect} from 'react';
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
 const [view,setView]=useState<'home'|'profile'|'today'|'discover'|'twin'>('home');
 const [saved,setSaved]=useState('');
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
  await run('SEARCHING','SELECTED',async()=>{setSelection(await api<Selection>('/api/select',{sessionId,candidateId}));setView('twin');},()=>void select(candidateId));
 }
 async function reset() {
  await run(stage,'START',async()=>{
    await api(`/api/sessions/${sessionId}`,undefined,'DELETE');
    setView('home');setSaved('');setSessionId(crypto.randomUUID());setParsed(null);setResults(null);setSelection(null);setRefinement('');setMessage(example);setCity('Tokyo');setAllergens('');setSummaryMode('fixture');setActual('42');setTarget('65');setEnabled(true);
  },()=>void reset());
 }

 useEffect(()=>{window.scrollTo({top:0,behavior:'auto'});},[view]);
 useEffect(()=>{setParsed(null);setResults(null);setSelection(null);setStage('START');},[city,allergens,summaryMode,actual,target]);
 function saveSettings() {
   if(summaryMode==='manual'&&(!actual.trim()||!target.trim()||!Number.isFinite(Number(actual))||!Number.isFinite(Number(target))||Number(actual)<0||Number(target)<=0)) {
     setError({code:'VALIDATION_ERROR',message:'摄入须为非负数，目标须大于 0',retryable:false});return false;
   }
   setParsed(null);setResults(null);setSelection(null);setStage('START');setError(null);setSaved('已更新');return true;
 }
 const areas = [
  {id:'profile' as const,num:'01',title:'你的口味',english:'YOU',icon:'sprout',hint:'偏好 · 地点'},
  {id:'today' as const,num:'02',title:'今天的餐',english:'TODAY',icon:'bowl',hint:'摄入 · 营养'},
  {id:'discover' as const,num:'03',title:'下一餐去哪里',english:'DISCOVER',icon:'map',hint:'搜索 · 推荐'},
  {id:'twin' as const,num:'04',title:'我的伙伴',english:'TWIN',icon:'heart',hint:'小人 · 餐食预览'},
 ];
 function openArea(id: typeof view) {setView(id);setSaved('');setError(null);}
 const errorPanel = error&&<div className="error" role="alert"><strong>{error.message}</strong><small>{error.code} {error.requestId}</small><div>{error.retryable&&<button disabled={busy} onClick={()=>retry.current?.()}>重试</button>}<button disabled={busy} onClick={()=>{setError(null);setStage('START');setView('discover');}}>修改需求</button></div></div>;
 return <div className="shell interactive-shell">
  <header className="topbar"><button className="brand brand-home" onClick={()=>openArea('home')} disabled={busy} aria-label="返回主界面"><span className="brand-icon">✿</span>Taste<span>Twin</span></button><div className="header-actions"><details className="data-status"><summary className="mode">● 演示数据{mode==='baseline'?' · 口味 OFF':''}</summary><div>餐厅、菜单、营养、价格、步行与口味信号均为虚构数据。Qloo 暂未连接。</div></details><button className="text-button" disabled={busy} onClick={()=>void reset()}>重置 ↺</button></div></header>
  <main>
   {view==='home'?<>
    <section className="hero home-hero"><div className="hero-copy"><p className="eyebrow">NUTRITION MATCH × TASTE MATCH</p><h1>下一餐，<br/>更合你的<span>心意。</span></h1><p className="home-tagline">和你的伙伴，一起选餐。</p><button className="hero-start" onClick={()=>openArea('discover')}>找下一餐 ↗</button></div><div className="hero-art"><img src="/tastetwin-hero.png" alt="TasteTwin 像素厨房"/></div></section>
    <nav className="area-cards" aria-label="四个功能区">{areas.map(area=><button key={area.id} className="area-card" onClick={()=>openArea(area.id)}><span className="area-number">{area.num} / {area.english}</span><span className={`pixel-area-icon pixel-area-icon--${area.icon}`} aria-hidden="true"/><h2>{area.title}</h2><span className="area-hint">{area.hint}</span><span className="area-arrow" aria-hidden="true">↗</span></button>)}</nav>
   </>:<>
    <div className="area-toolbar"><button className="text-button" disabled={busy} onClick={()=>openArea('home')}>← 主界面</button><nav aria-label="功能切换">{areas.map(area=><button key={area.id} className={view===area.id?'area-tab active':'area-tab'} aria-current={view===area.id?'page':undefined} disabled={busy} onClick={()=>openArea(area.id)}>{area.title}</button>)}</nav></div>
    <div className="area-content">
     {errorPanel}
     {view==='profile'&&<section className="panel settings-panel"><div className="section-heading"><p className="eyebrow">01 / YOU</p><h2>你的口味</h2></div><div className="settings-grid"><div><label htmlFor="city">搜索区域</label><input id="city" value={city} onChange={e=>{setCity(e.target.value);setSaved('');}} maxLength={80}/><small className="caption">当前演示区域：Tokyo</small></div><div><label htmlFor="allergens">过敏原</label><input id="allergens" placeholder="peanut, soy" value={allergens} onChange={e=>{setAllergens(e.target.value);setSaved('');}}/><small className="caption">{allergens?'本次搜索会排除这些成分':'可不填'}</small></div></div><fieldset className="preference-group"><legend>菜系</legend><div className="preference-buttons">{['日式','意式','中餐'].map(x=><button type="button" key={x} aria-pressed={message.includes(x)} className={message.includes(x)?'active':''} onClick={()=>{setMessage(`我想吃${x}，安静，一个人，1000 日元以内，附近`);setSaved('');}}>{x}</button>)}</div></fieldset><fieldset className="preference-group"><legend>避免的成分</legend><div className="preference-buttons">{[['peanut','花生'],['milk','乳制品'],['egg','鸡蛋'],['soy','大豆'],['wheat','小麦'],['fish','鱼'],['shellfish','虾贝'],['sesame','芝麻']].map(([code,label])=>{const chosen=allergens.split(',').map(x=>x.trim()).filter(Boolean);return <button type="button" key={code} aria-pressed={chosen.includes(code)} className={chosen.includes(code)?'active':''} onClick={()=>{setAllergens((chosen.includes(code)?chosen.filter(x=>x!==code):[...chosen,code]).join(', '));setSaved('');}}>{label}</button>;})}</div></fieldset><div className="actions"><button className="primary" onClick={saveSettings}>保存设置 ✓</button><button onClick={()=>{if(saveSettings())setView('discover');}}>去选餐 →</button><span className="saved" role="status">{saved}</span></div></section>}
     {view==='today'&&<section className="panel today-panel"><div className="section-heading"><p className="eyebrow">02 / TODAY</p><h2>今天的餐</h2></div><div className="nutrition-dashboard"><span>蛋白质</span><strong>{summaryMode==='none'?'—':summaryMode==='fixture'?42:actual}<small> / {summaryMode==='none'?'—':summaryMode==='fixture'?65:target} g</small></strong><progress aria-label="今日蛋白质摄入" value={summaryMode==='none'?0:summaryMode==='fixture'?42:Number(actual)||0} max={summaryMode==='fixture'?65:Math.max(1,Number(target)||1)}/><span className="caption">{summaryMode==='fixture'?'演示日汇总':summaryMode==='manual'?'手动日汇总':'未提供'}</span></div><label htmlFor="summary">营养记录</label><select id="summary" value={summaryMode} onChange={e=>{setSummaryMode(e.target.value as typeof summaryMode);setSaved('');}}><option value="fixture">使用演示日汇总</option><option value="manual">手动输入</option><option value="none">暂不提供</option></select>{summaryMode==='manual'&&<div className="settings-grid"><div><label htmlFor="actual">今日摄入（g）</label><input id="actual" type="number" min="0" step="any" value={actual} onChange={e=>{setActual(e.target.value);setSaved('');}}/></div><div><label htmlFor="target">配置目标（g）</label><input id="target" type="number" min="0.01" step="any" value={target} onChange={e=>{setTarget(e.target.value);setSaved('');}}/></div></div>}<div className="actions"><button className="primary" onClick={saveSettings}>更新今日记录 ✓</button><span className="saved" role="status">{saved}</span></div></section>}
     {view==='discover'&&<section className="discover-area" aria-live="polite">
      {(stage==='START'||stage==='PARSING'||stage==='SELECTED')&&<section className="panel"><p className="eyebrow">03 / DISCOVER</p><h2>下一餐去哪里</h2><form onSubmit={e=>{e.preventDefault();void interpret();}}><label className="sr-only" htmlFor="message">今天想吃什么</label><textarea id="message" rows={3} value={message} maxLength={500} placeholder="想吃什么？" onChange={e=>setMessage(e.target.value)} disabled={busy} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void interpret();}}}/><div className="input-bottom"><button type="button" className="text-button" disabled={busy} onClick={()=>setMessage(example)}>示例</button><small>{message.length}/500</small></div><div className="search-context"><button type="button" onClick={()=>openArea('profile')} disabled={busy}>⌖ {city||'选择区域'}</button><button type="button" onClick={()=>openArea('profile')} disabled={busy}>{allergens?'已设置过敏原':'设置偏好'}</button><button type="button" onClick={()=>openArea('today')} disabled={busy}>今日营养</button></div><button className="primary" disabled={busy||!message.trim()}>{stage==='PARSING'?'解析中…':'找下一餐 →'}</button></form></section>}
      {stage==='CONFIRM'&&parsed&&<section className="panel"><h2>确认这次需求</h2><div className="chips">{chips(parsed.constraints).map(x=><span key={x}>{x}</span>)}</div>{parsed.nutritionGap.level!=='unavailable'&&parsed.nutritionGap.nutrient!=='none'&&<p className="caption">{parsed.nutritionGap.nutrient} · 当前目标下还差 {parsed.nutritionGap.missingAmount} {parsed.nutritionGap.unit}</p>}{parsed.needsClarification&&<p className="clarification">{parsed.clarificationQuestion}</p>}<div className="actions"><button className="primary" disabled={busy||parsed.needsClarification} onClick={()=>void recommend()}>确认并查找 →</button><button disabled={busy} onClick={()=>setStage('START')}>修改</button>{parsed.needsClarification&&<button onClick={()=>openArea('profile')}>设置区域</button>}</div></section>}
      {(stage==='SEARCHING'||stage==='REFINING')&&<div className="loading" role="status"><PixelTwin state="thinking"/><h2>找找看…</h2></div>}
      {results&&['RESULTS','REFINED'].includes(stage)&&<section className="panel result-panel"><div className="result-heading"><h2>{results.recommendations.length} 个选项</h2><label className="toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>void recommend(e.target.checked)}/><span>演示口味 {enabled?'ON':'OFF'}</span></label></div><div className="chips">{activeConstraints&&chips(activeConstraints).map(x=><span key={x}>{x}</span>)}</div>{results.recommendations.length?results.recommendations.map(item=><MealRow key={item.candidateId} item={item} disabled={busy} onSelect={id=>void select(id)}/>):<div className="empty"><h3>没有合适选项</h3><p>{results.emptyMessage}</p><button onClick={()=>setStage('START')}>修改需求</button></div>}<div className="refinement"><div className="quick-actions">{['再近一点','更便宜','不要辣'].map(x=><button key={x} disabled={busy} onClick={()=>void refine(x)}>{x}</button>)}</div><form onSubmit={e=>{e.preventDefault();void refine();}}><label className="sr-only" htmlFor="refinement">修正需求</label><input id="refinement" value={refinement} maxLength={200} placeholder="再调整一下…" disabled={busy} onChange={e=>setRefinement(e.target.value)}/><button disabled={busy||!refinement.trim()}>更新 →</button></form></div></section>}
     </section>}
     {view==='twin'&&<section className="panel twin-panel"><p className="eyebrow">04 / TWIN</p><h2>我的伙伴</h2><div className="twin-room"><span className="room-window" aria-hidden="true"/><span className="room-plant" aria-hidden="true"/><PixelTwin state={selection?'happy':'idle'}/></div>{selection?<div className="twin-meal"><span className="caption">选中的餐食 · 演示</span><h3>{selection.recommendation.menuName}</h3><p className="caption">{selection.recommendation.placeName}</p><MealFacts item={selection.recommendation}/><span className="taste">Taste fit · {selection.recommendation.tasteFit} · 演示</span><div className="actions"><button className="primary" onClick={()=>openArea('discover')}>再选一餐 →</button></div></div>:<button className="primary" onClick={()=>openArea('discover')}>一起选餐 →</button>}{results&&<details className="judge"><summary>口味排序对比 · 演示</summary><p>ON：{results.comparison.withTaste.join(' → ')}</p><p>OFF：{results.comparison.withoutTaste.join(' → ')}</p></details>}</section>}
    </div>
   </>}
   <footer className="quiet-footer"><span>TasteTwin</span><details><summary>演示数据 · 非医疗建议</summary><p>当前数据为虚构演示，Qloo 未连接。设置仅用于本次页面；推荐会话在后端内存中保留最多一小时，重置会删除会话。营养和过敏数据不传给 Qloo。</p></details></footer>
  </main>
 </div>;
}
