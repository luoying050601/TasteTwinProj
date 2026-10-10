import { useState, useRef, useEffect } from 'react';
import { api } from './api';
import type { ApiError, Interpretation, Results, Selection, Stage, Constraints } from './types';
import MealRow, { MealFacts } from './components/MealRow';
import KitchenRoom from './components/KitchenRoom';
import { useI18n, translate, type Translate } from './i18n';
import { useAuth } from './useAuth';
import AuthPortal from './components/AuthPortal';
import AccountProfile from './components/AccountProfile';
import './auth.css';


const busyStages: Stage[] = ['PARSING', 'SEARCHING', 'REFINING'];
function chips(c: Constraints, t: Translate) {
  return [...c.cuisines.map(x => t(x)), ...c.ambience.map(x => t(x)), ...(c.partySize ? [t('party', { count: c.partySize })] : []), ...(c.budgetMax ? [`≤ ${c.budgetMax} ${c.currency || '?'}`] : []), ...(c.maxWalkMinutes ? [t('walkLimit', { count: c.maxWalkMinutes })] : []), ...(c.excludeSpicy ? [t('notSpicy')] : []), ...c.allergens.map(x => t('exclude', { name: t(x) }))];
}
export default function App() {
  const { locale, setLocale, t } = useI18n();
  const auth = useAuth(locale);
  const example = t('sample');
  const call = <T,>(path: string, body?: unknown, method = 'POST') => api<T>(path, body, method, locale);
  function changeLanguage(next: typeof locale) { if (['en-US', 'ja-JP', 'zh-CN'].some(x => message === translate(x as typeof locale, 'sample'))) setMessage(translate(next, 'sample')); setLocale(next); }
  const [view, setView] = useState<'home' | 'profile' | 'today' | 'discover' | 'twin'>('home');
  const [accountOpen, setAccountOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState(example);
  const [city, setCity] = useState('Tokyo');
  const [allergens, setAllergens] = useState('');
  const [summaryMode, setSummaryMode] = useState<'fixture' | 'manual' | 'none'>('fixture');
  const [actual, setActual] = useState('42'); const [target, setTarget] = useState('65');
  const [stage, setStage] = useState<Stage>('START');
  const [parsed, setParsed] = useState<Interpretation | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [refinement, setRefinement] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [working, setWorking] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const retry = useRef<null | (() => void)>(null);
  const lock = useRef(false);
  const revision = useRef(0);
  const busy = working || busyStages.includes(stage);
  const mode = results?.dataMode || 'fixture';
  const activeConstraints = results?.constraints || parsed?.constraints;

  async function run(next: Stage, success: Stage, action: () => Promise<void>, retryAction: () => void) {
    if (lock.current) return;
    const current = revision.current;
    lock.current = true; setWorking(true); setError(null); const previous = stage; setStage(next); retry.current = retryAction;
    try { await action(); if (current === revision.current) setStage(success); } catch (e) { if (current === revision.current) { setError(e as ApiError); setStage(previous); if ((e as ApiError).code === 'AUTH_REQUIRED') void auth.reload(); } } finally { if (current === revision.current) { lock.current = false; setWorking(false); } }
  }
  async function interpret() {
    if (!message.trim() || message.length > 500) { setError({ code: 'MESSAGE_INVALID', message: t('MESSAGE_INVALID'), retryable: false }); return; }
    if (summaryMode === 'manual' && (!actual.trim() || !target.trim() || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || Number(actual) < 0 || Number(target) <= 0)) { setError({ code: 'NUTRITION_INVALID', message: t('NUTRITION_INVALID'), retryable: false }); return; }
    await run('PARSING', 'CONFIRM', async () => {
      const dailySummary = summaryMode === 'none' ? null : { proteinG: summaryMode === 'fixture' ? 42 : Number(actual), targetProteinG: summaryMode === 'fixture' ? 65 : Number(target), sourceType: summaryMode };
      const data = await call<Interpretation>('/api/interpret', { sessionId, message, locale, location: { city }, dailySummary, allergens: allergens.split(',').map(x => x.trim()).filter(Boolean) });
      setParsed(data); setResults(null); setSelection(null);
    }, () => void interpret());
  }
  async function recommend(tasteEnabled = enabled) {
    await run('SEARCHING', results?.appliedChanges.length ? 'REFINED' : 'RESULTS', async () => {
      const data = await call<Results>('/api/recommend', { sessionId, qlooEnabled: tasteEnabled, limit: results?.appliedChanges.length ? 2 : 3 });
      setResults(data); setEnabled(tasteEnabled); setSelection(null);
    }, () => void recommend(tasteEnabled));
  }
  async function refine(text = refinement) {
    if (!text.trim()) return;
    await run('REFINING', 'REFINED', async () => { setResults(await call<Results>('/api/refine', { sessionId, refinement: text })); setRefinement(''); }, () => void refine(text));
  }
  async function select(candidateId: string) {
    await run('SEARCHING', 'SELECTED', async () => { setSelection(await call<Selection>('/api/select', { sessionId, candidateId })); setView('twin'); }, () => void select(candidateId));
  }
  async function reset() {
    await run(stage, 'START', async () => {
      await call(`/api/sessions/${sessionId}`, undefined, 'DELETE');
      setView('home'); setSaved(''); setSessionId(crypto.randomUUID()); setParsed(null); setResults(null); setSelection(null); setRefinement(''); setMessage(example); setCity('Tokyo'); setAllergens(''); setSummaryMode('fixture'); setActual('42'); setTarget('65'); setEnabled(true);
    }, () => void reset());
  }

  useEffect(() => { if (view === 'home') return; const previous = document.activeElement as HTMLElement | null; dialogRef.current?.querySelector<HTMLButtonElement>('.panel-close')?.focus(); return () => previous?.focus(); }, [view]);
  const accountKey = JSON.stringify([auth.account?.id, auth.account?.profile]);
  useEffect(() => {
    revision.current++; lock.current = false; retry.current = null;
    setWorking(false); setView('home'); setAccountOpen(false); setSaved(''); setSessionId(crypto.randomUUID()); setParsed(null); setResults(null); setSelection(null); setRefinement(''); setStage('START'); setError(null); setMessage(example); setCity('Tokyo'); setAllergens(''); setSummaryMode('fixture'); setActual('42'); setTarget('65'); setEnabled(true);
  }, [accountKey]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [view]);
  useEffect(() => { setParsed(null); setResults(null); setSelection(null); setStage('START'); }, [city, allergens, summaryMode, actual, target]);
  function saveSettings() {
    if (summaryMode === 'manual' && (!actual.trim() || !target.trim() || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || Number(actual) < 0 || Number(target) <= 0)) {
      setError({ code: 'NUTRITION_INVALID', message: t('NUTRITION_INVALID'), retryable: false }); return false;
    }
    setParsed(null); setResults(null); setSelection(null); setStage('START'); setError(null); setSaved('saved'); return true;
  }
  const areas = [
    { id: 'profile' as const, num: '01', title: t('profileTitle'), english: t('profileTag'), icon: 'sprout', hint: t('profileHint') },
    { id: 'today' as const, num: '02', title: t('todayTitle'), english: t('todayTag'), icon: 'bowl', hint: t('todayHint') },
    { id: 'discover' as const, num: '03', title: t('discoverTitle'), english: t('discoverTag'), icon: 'map', hint: t('discoverHint') },
    { id: 'twin' as const, num: '04', title: t('twinTitle'), english: t('twinTag'), icon: 'heart', hint: t('twinHint') },
  ];
  function openArea(id: typeof view) { setView(id); setSaved(''); setError(null); }
  const errorPanel = error && <div className="error" role="alert"><strong>{t(error.code)}</strong><small>{error.code} {error.requestId}</small><div>{error.retryable && <button disabled={busy} onClick={() => retry.current?.()}>{t('retry')}</button>}<button disabled={busy} onClick={() => { setError(null); setStage('START'); setView('discover'); }}>{t('editRequest')}</button></div></div>;
  const ratio = summaryMode === 'none' ? null : (summaryMode === 'fixture' ? 42 : Number(actual)) / (summaryMode === 'fixture' ? 65 : Math.max(1, Number(target)));
  const vitality = ratio === null ? 'unknown' : ratio >= 1 ? 'balanced' : ratio >= .6 ? 'growing' : 'low';
  if (auth.status !== 'ready' || !auth.account?.profileComplete) return <AuthPortal auth={auth} />;
  return <><div inert={accountOpen} className={`shell interactive-shell world-shell world-shell--${vitality}`}>
    <header className="topbar"><button className="brand brand-home" onClick={() => openArea('home')} disabled={busy} aria-label={t('backHome')}><span className="brand-icon">✿</span>Taste<span>Twin</span></button><div className="header-actions"><label className="language-control"><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={locale} disabled={busy} onChange={e => changeLanguage(e.target.value as typeof locale)}><option value="en-US">EN</option><option value="ja-JP">日本語</option><option value="zh-CN">中文</option></select></label><details className="data-status"><summary className="mode">● {t('demo')}{mode === 'baseline' ? ` · ${t('tasteOff')}` : ''}</summary><div>{t('dataNotice')}</div></details><button className="text-button" disabled={busy} onClick={() => void reset()}>{t('reset')} ↺</button></div></header>
    <main>
      <KitchenRoom open={view !== 'home' || accountOpen} busy={busy} selection={!!selection} vitality={vitality} onOpen={openArea} gender={auth.account.profile.gender || 'undisclosed'} birthYear={auth.account.profile.birthYear} birthMonth={auth.account.profile.birthMonth} avatarRef={avatarRef} onEditProfile={() => setAccountOpen(true)} />
      {view !== 'home' && <div className="scene-overlay" ref={dialogRef} role="dialog" aria-modal="true" aria-label={areas.find(a => a.id === view)?.title} onKeyDown={e => { if (e.key === 'Escape' && !busy) { openArea('home'); return; } if (e.key === 'Tab') { const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || []); const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><button className="panel-close" disabled={busy} onClick={() => openArea('home')} aria-label={t('closePanel')}>×</button>
        <div className="area-content">
          {errorPanel}
          {view === 'profile' && <section className="panel settings-panel"><div className="section-heading"><p className="eyebrow">01 / {t('profileTag')}</p><h2>{t('profileTitle')}</h2></div><div className="settings-grid"><div><label htmlFor="city">{t('city')}</label><input id="city" value={city} onChange={e => { setCity(e.target.value); setSaved(''); }} maxLength={80} /><small className="caption">{t('fixtureCity')}</small></div><div><label htmlFor="allergens">{t('allergens')}</label><input id="allergens" placeholder={t('allergenPlaceholder')} value={allergens} onChange={e => { setAllergens(e.target.value); setSaved(''); }} /><small className="caption">{allergens ? t('allergenExcluded') : t('optional')}</small></div></div><fieldset className="preference-group"><legend>{t('cuisine')}</legend><div className="preference-buttons">{['Japanese', 'Italian', 'Chinese'].map(x => <button type="button" key={x} aria-pressed={(message.includes(x) || message.includes(t(x)))} className={(message.includes(x) || message.includes(t(x))) ? 'active' : ''} onClick={() => { setMessage(t('cuisineSample', { cuisine: t(x) })); setSaved(''); }}>{t(x)}</button>)}</div></fieldset><fieldset className="preference-group"><legend>{t('avoid')}</legend><div className="preference-buttons">{['peanut', 'milk', 'egg', 'soy', 'wheat', 'fish', 'shellfish', 'sesame'].map(code => { const chosen = allergens.split(',').map(x => x.trim()).filter(Boolean); return <button type="button" key={code} aria-pressed={chosen.includes(code)} className={chosen.includes(code) ? 'active' : ''} onClick={() => { setAllergens((chosen.includes(code) ? chosen.filter(x => x !== code) : [...chosen, code]).join(', ')); setSaved(''); }}>{t(code)}</button>; })}</div></fieldset><div className="actions"><button className="primary" onClick={saveSettings}>{t('saveSettings')} ✓</button><button onClick={() => { if (saveSettings()) setView('discover'); }}>{t('goChoose')} →</button><span className="saved" role="status">{saved && t(saved)}</span></div></section>}
          {view === 'today' && <section className="panel today-panel"><div className="section-heading"><p className="eyebrow">02 / {t('todayTag')}</p><h2>{t('todayTitle')}</h2></div><div className="nutrition-dashboard"><span>{t('protein')}</span><strong>{summaryMode === 'none' ? '—' : summaryMode === 'fixture' ? 42 : actual}<small> / {summaryMode === 'none' ? '—' : summaryMode === 'fixture' ? 65 : target} g</small></strong><progress aria-label={t('proteinProgress')} value={summaryMode === 'none' ? 0 : summaryMode === 'fixture' ? 42 : Number(actual) || 0} max={summaryMode === 'fixture' ? 65 : Math.max(1, Number(target) || 1)} /><span className="caption">{summaryMode === 'fixture' ? t('demoDaily') : summaryMode === 'manual' ? t('manualDaily') : t('unavailable')}</span></div><label htmlFor="summary">{t('nutritionRecord')}</label><select id="summary" value={summaryMode} onChange={e => { setSummaryMode(e.target.value as typeof summaryMode); setSaved(''); }}><option value="fixture">{t('useDemo')}</option><option value="manual">{t('manualInput')}</option><option value="none">{t('noneInput')}</option></select>{summaryMode === 'manual' && <div className="settings-grid"><div><label htmlFor="actual">{t('actual')}</label><input id="actual" type="number" min="0" step="any" value={actual} onChange={e => { setActual(e.target.value); setSaved(''); }} /></div><div><label htmlFor="target">{t('target')}</label><input id="target" type="number" min="0.01" step="any" value={target} onChange={e => { setTarget(e.target.value); setSaved(''); }} /></div></div>}<div className="actions"><button className="primary" onClick={saveSettings}>{t('updateRecord')} ✓</button><span className="saved" role="status">{saved && t(saved)}</span></div></section>}
          {view === 'discover' && <section className="discover-area" aria-live="polite">
            {(stage === 'START' || stage === 'PARSING' || stage === 'SELECTED') && <section className="panel"><p className="eyebrow">03 / {t('discoverTag')}</p><h2>{t('discoverTitle')}</h2><form onSubmit={e => { e.preventDefault(); void interpret(); }}><label className="sr-only" htmlFor="message">{t('messageLabel')}</label><textarea id="message" rows={3} value={message} maxLength={500} placeholder={t('messageLabel')} onChange={e => setMessage(e.target.value)} disabled={busy} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void interpret(); } }} /><div className="input-bottom"><button type="button" className="text-button" disabled={busy} onClick={() => setMessage(example)}>{t('example')}</button><small>{message.length}/500</small></div><div className="search-context"><button type="button" onClick={() => openArea('profile')} disabled={busy}>⌖ {city || t('chooseArea')}</button><button type="button" onClick={() => openArea('profile')} disabled={busy}>{allergens ? t('allergensSet') : t('setPreferences')}</button><button type="button" onClick={() => openArea('today')} disabled={busy}>{t('todayNutrition')}</button></div><button className="primary" disabled={busy || !message.trim()}>{stage === 'PARSING' ? t('parsing') : `${t('findMeal')} →`}</button></form></section>}
            {stage === 'CONFIRM' && parsed && <section className="panel"><h2>{t('confirmTitle')}</h2><div className="chips">{chips(parsed.constraints, t).map(x => <span key={x}>{x}</span>)}</div>{parsed.nutritionGap.level !== 'unavailable' && parsed.nutritionGap.nutrient !== 'none' && <p className="caption">{t('gap', { nutrient: t(parsed.nutritionGap.nutrient), amount: parsed.nutritionGap.missingAmount, unit: parsed.nutritionGap.unit })}</p>}{parsed.needsClarification && <p className="clarification">{t(!city.trim() ? 'missingCity' : 'missingCurrency')}</p>}<div className="actions"><button className="primary" disabled={busy || parsed.needsClarification} onClick={() => void recommend()}>{t('confirmSearch')} →</button><button disabled={busy} onClick={() => setStage('START')}>{t('edit')}</button>{parsed.needsClarification && <button onClick={() => openArea('profile')}>{t('setArea')}</button>}</div></section>}
            {(stage === 'SEARCHING' || stage === 'REFINING') && <div className="loading" role="status"><h2>{t('looking')}</h2></div>}
            {results && ['RESULTS', 'REFINED'].includes(stage) && <section className="panel result-panel"><div className="result-heading"><h2>{t('options', { count: results.recommendations.length })}</h2><label className="toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => void recommend(e.target.checked)} /><span>{t('demoTaste')} {enabled ? 'ON' : 'OFF'}</span></label></div><div className="chips">{activeConstraints && chips(activeConstraints, t).map(x => <span key={x}>{x}</span>)}</div>{results.recommendations.length ? results.recommendations.map(item => <MealRow key={item.candidateId} item={item} disabled={busy} onSelect={id => void select(id)} />) : <div className="empty"><h3>{t('noOptions')}</h3><p>{t('EMPTY')}</p><button onClick={() => setStage('START')}>{t('editRequest')}</button></div>}<div className="refinement"><div className="quick-actions">{['closer', 'cheaper', 'notSpicy'].map(x => <button key={x} disabled={busy} onClick={() => void refine(t(x))}>{t(x)}</button>)}</div><form onSubmit={e => { e.preventDefault(); void refine(); }}><label className="sr-only" htmlFor="refinement">{t('refineLabel')}</label><input id="refinement" value={refinement} maxLength={200} placeholder={t('refinePlaceholder')} disabled={busy} onChange={e => setRefinement(e.target.value)} /><button disabled={busy || !refinement.trim()}>{t('update')} →</button></form></div></section>}
          </section>}
          {view === 'twin' && <section className="panel twin-panel"><p className="eyebrow">04 / {t('twinTag')}</p><h2>{t('twinTitle')}</h2>{selection ? <div className="twin-meal"><span className="caption">{t('selectedDemo')}</span><h3>{selection.recommendation.provenance.menu === 'fixture' ? t(selection.recommendation.candidateId + '.menu') : selection.recommendation.menuName}</h3><p className="caption">{selection.recommendation.provenance.place === 'fixture' ? t(selection.recommendation.candidateId + '.place') : selection.recommendation.placeName}</p><MealFacts item={selection.recommendation} /><span className="taste">{t('tasteFit')} · {t(selection.recommendation.tasteFit)} · {t('demo')}</span><div className="actions"><button className="primary" onClick={() => openArea('discover')}>{t('chooseAgain')} →</button></div></div> : <button className="primary" onClick={() => openArea('discover')}>{t('chooseTogether')} →</button>}{results && <details className="judge"><summary>{t('compareDemo')}</summary><p>ON：{results.comparison.withTaste.join(' → ')}</p><p>OFF：{results.comparison.withoutTaste.join(' → ')}</p></details>}</section>}
        </div>
      </div>}
      <footer className="quiet-footer scene-footer"><span>TasteTwin</span><details><summary>{t('footer')}</summary><p>{t('privacy')}</p></details></footer>
    </main>
  </div>{accountOpen && <AccountProfile account={auth.account} onSave={auth.save} onClose={() => { setAccountOpen(false); requestAnimationFrame(() => avatarRef.current?.focus()); }} onSignOut={auth.signOut} />}</>;
}
