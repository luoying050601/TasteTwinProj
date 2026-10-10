import { useEffect, useRef, useState } from 'react';
import { BookOpen, Save, X, Copy, RotateCw, ChevronDown, UserRound, Utensils, HeartPulse } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';
import type { Profile, UserAccount } from '../useAuth';
import { collectionAllergens, avoidedFoods, emptyDietary, emptyHealth, healthDraft, cuisineGroups, type DietaryPreferences, type HealthDraft, type HealthSnapshot, type HealthRecord, type HealthPage, type NotebookSession, type SelectionStatus } from '../notebook';
import AccountProfile from './AccountProfile';
import PixelTwin from './PixelTwin';
import RegionInput from './RegionInput';
import './UserNotebook.css';

export type Tab = 'profile' | 'tastes' | 'health';
const tabs: Tab[] = ['profile', 'tastes', 'health'];
const tabIcons = { profile: UserRound, tastes: Utensils, health: HeartPulse };
function errorCode(reason: unknown) { return reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : 'NOTEBOOK_UNAVAILABLE'; }

export default function UserNotebook({ account, onSaveProfile, onSignOut, onClose, session, onSessionChange, initialTab = 'profile', tastesOnly = false }: { account: UserAccount; onSaveProfile: (profile: Profile) => Promise<void>; onSignOut: () => Promise<void>; onClose: () => void; session: NotebookSession; onSessionChange: (value: NotebookSession) => void; initialTab?: Tab; tastesOnly?: boolean }) {
    const { locale, t } = useI18n();
    const [tab, setTab] = useState<Tab>(tastesOnly ? 'tastes' : initialTab);
    const [diet, setDiet] = useState<DietaryPreferences>(emptyDietary);
    const [dietSaved, setDietSaved] = useState(JSON.stringify(emptyDietary));
    const [health, setHealth] = useState<HealthDraft>(emptyHealth);
    const [healthSaved, setHealthSaved] = useState(JSON.stringify(emptyHealth));
    const [records, setRecords] = useState<HealthRecord[]>([]);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [dietReady, setDietReady] = useState(false);
    const [healthReady, setHealthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [profileDirty, setProfileDirty] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [pendingCopy, setPendingCopy] = useState<HealthRecord | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const dialog = useRef<HTMLDivElement>(null);
    const alive = useRef(false);
    const loadSequence = useRef(0);
    const lock = useRef(false);
    const pendingRecord = useRef<{ payload: string; id: string } | null>(null);
    const dirty = profileDirty || JSON.stringify(diet) !== dietSaved || JSON.stringify(health) !== healthSaved;
    const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
    const localeRef = useRef(locale); localeRef.current = locale;
    useEffect(() => { dialog.current?.querySelector('.notebook-content')?.scrollTo({ top: 0 }); }, [tab]);

    async function load() {
        const current = ++loadSequence.current;
        const needsDiet = !dietReady, needsHealth = !tastesOnly && !healthReady;
        setLoading(true); setError('');
        const results = await Promise.allSettled([
            api<DietaryPreferences>('/api/me/dietary-preferences', undefined, 'GET', localeRef.current),
            tastesOnly ? Promise.resolve<HealthPage>({ records: [], nextOffset: null }) : api<HealthPage>('/api/me/health-records', undefined, 'GET', localeRef.current),
        ]);
        if (!alive.current || current !== loadSequence.current) return;
        const [dietResult, healthResult] = results;
        if (dietResult.status === 'fulfilled') { if (needsDiet) { setDiet(dietResult.value); setDietSaved(JSON.stringify(dietResult.value)); setDietReady(true); } }
        else if (needsDiet) setError(errorCode(dietResult.reason));
        if (healthResult.status === 'fulfilled' && needsHealth) {
            setRecords(healthResult.value.records); setNextOffset(healthResult.value.nextOffset); setHealthReady(true);
            const draft = healthResult.value.records[0] ? healthDraft(healthResult.value.records[0]) : emptyHealth;
            setHealth(draft); setHealthSaved(JSON.stringify(draft));
        } else if (healthResult.status === 'rejected' && needsHealth) setError(errorCode(healthResult.reason));
        setLoading(false);
    }
    useEffect(() => {
        alive.current = true;
        const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
        dialog.current?.querySelector<HTMLButtonElement>(tastesOnly ? '.notebook-tools button' : '[role="tab"][aria-selected="true"]')?.focus();
        const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', unload);
        void load();
        return () => { alive.current = false; loadSequence.current++; document.body.style.overflow = previousOverflow; window.removeEventListener('beforeunload', unload); };
    }, []);
    useEffect(() => { if (tastesOnly && dietReady) dialog.current?.querySelector<HTMLInputElement>('#notebook-city')?.focus(); }, [tastesOnly, dietReady]);

    async function action(task: () => Promise<void>) {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError(''); setNotice('');
        try { await task(); } catch (reason) { if (alive.current) setError(errorCode(reason)); }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    }
    function close() { if (busy) return; setPendingCopy(null); if (dirty) setConfirmClose(true); else onClose(); }
    function copyToDraft(record: HealthRecord) { setHealth(healthDraft(record)); setPendingCopy(null); setNotice('collection.copied'); dialog.current?.querySelector<HTMLInputElement>('#notebook-weightKg')?.focus(); }
    async function saveDiet() {
        if ((diet.allergyStatus === 'selected' && !diet.allergens.length) || (diet.avoidanceStatus === 'selected' && !diet.avoidedFoods.length)) { setError('NOTEBOOK_INVALID'); return; }
        await action(async () => {
            const saved = await api<DietaryPreferences>('/api/me/dietary-preferences', diet, 'PATCH', locale);
            if (!alive.current) return;
            setDiet(saved); setDietSaved(JSON.stringify(saved)); setNotice('collection.saved');
        });
    }
    async function saveHealth() {
        const required = ['weightKg', 'heightCm', 'bodyFatStatus', 'goal', 'chronotype', 'breakfastHabit', 'lunchHabit', 'dinnerHabit'] as const;
        if (required.some(key => !health[key]) || (health.bodyFatStatus === 'measured' && !health.bodyFatPct)) { setError('NOTEBOOK_INVALID'); return; }
        const snapshot = { ...health, weightKg: Number(health.weightKg), heightCm: Number(health.heightCm), bodyFatPct: health.bodyFatStatus === 'measured' ? Number(health.bodyFatPct) : null } as HealthSnapshot;
        const payload = JSON.stringify(snapshot);
        if (pendingRecord.current?.payload !== payload) pendingRecord.current = { payload, id: crypto.randomUUID() };
        const id = pendingRecord.current.id;
        await action(async () => {
            const saved = await api<HealthRecord>('/api/me/health-records', { ...snapshot, id }, 'POST', locale);
            if (!alive.current) return;
            const draft = healthDraft(saved); setHealth(draft); setHealthSaved(JSON.stringify(draft)); pendingRecord.current = null;
            setRecords(previous => [saved, ...previous.filter(record => record.id !== saved.id)]); setNextOffset(null); setNotice('collection.recordAdded');
            const page = await api<HealthPage>('/api/me/health-records', undefined, 'GET', locale);
            if (alive.current) { setRecords(page.records); setNextOffset(page.nextOffset); }
        });
    }
    async function moreHistory() {
        if (nextOffset === null) return;
        await action(async () => {
            const page = await api<HealthPage>(`/api/me/health-records?offset=${nextOffset}`, undefined, 'GET', locale);
            if (alive.current) { setRecords(previous => [...previous, ...page.records.filter(record => !previous.some(item => item.id === record.id))]); setNextOffset(page.nextOffset); }
        });
    }
    function editHealth(key: keyof HealthDraft, value: string) { setHealth(previous => ({ ...previous, [key]: value, ...(key === 'bodyFatStatus' && value === 'unknown' ? { bodyFatPct: '' } : {}) })); setNotice(''); }
    function selection(kind: 'allergy' | 'avoidance') {
        const allergy = kind === 'allergy';
        const status = allergy ? diet.allergyStatus : diet.avoidanceStatus;
        const chosen = allergy ? diet.allergens : diet.avoidedFoods;
        const other = allergy ? diet.allergyOther : diet.avoidanceOther;
        const title = t(allergy ? 'collection.allergens' : 'collection.avoidance');
        function change(nextStatus: SelectionStatus, values: string[], detail: string) { setDiet(previous => allergy ? { ...previous, allergyStatus: nextStatus, allergens: values, allergyOther: detail } : { ...previous, avoidanceStatus: nextStatus, avoidedFoods: values, avoidanceOther: detail }); setNotice(''); }
        return <fieldset className="notebook-selection"><legend>{title}</legend><label className="sr-only" htmlFor={`notebook-${kind}-status`}>{title}</label><select id={`notebook-${kind}-status`} value={status} onChange={event => { const value = event.target.value as SelectionStatus; change(value, value === 'selected' ? chosen : [], value === 'selected' ? other : ''); }}><option value="unknown">{t('collection.unanswered')}</option><option value="none">{t(allergy ? 'collection.noAllergies' : 'collection.noAvoidance')}</option><option value="selected">{t('collection.selected')}</option></select>
            {status === 'selected' && <div className="notebook-choices">{(allergy ? collectionAllergens : avoidedFoods).map(code => <label key={code}><input type="checkbox" checked={chosen.includes(code)} onChange={() => { const values = chosen.includes(code) ? chosen.filter(item => item !== code) : [...chosen, code]; change('selected', values, values.includes('other') ? other : ''); }} />{t(`collection.${allergy ? 'allergen' : 'avoid'}.${code}`)}</label>)}</div>}
            {chosen.includes('other') && <><label htmlFor={`notebook-${kind}-other`}>{t('collection.otherDetails')}</label><input id={`notebook-${kind}-other`} value={other} maxLength={200} required onChange={event => change('selected', chosen, event.target.value)} /></>}
        </fieldset>;
    }
    const bmi = Number(health.weightKg) > 0 && Number(health.heightCm) > 0 ? Math.round(Number(health.weightKg) / (Number(health.heightCm) / 100) ** 2 * 10) / 10 : null;
    const healthOptions = { goal: ['build_muscle', 'lose_fat', 'wellness', 'no_specific_goal'], chronotype: ['morning', 'evening', 'intermediate'], breakfastHabit: ['often', 'sometimes', 'never'], lunchHabit: ['often', 'sometimes', 'never'], dinnerHabit: ['often', 'sometimes', 'never'] } as const;
    return <div className={tastesOnly ? 'account-backdrop' : 'account-backdrop notebook-backdrop'}><div ref={dialog} className={`notebook-dialog${tastesOnly ? ' taste-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="notebook-title" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || []).filter(node => !node.closest('[hidden]'));
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }}>
        <header className="notebook-header"><h2 id="notebook-title">{tastesOnly ? <Utensils size={22} /> : <BookOpen size={22} />}{t(tastesOnly ? 'collection.personalTastes' : 'collection.notebook')}</h2><div className="notebook-tools"><button type="button" className="icon-button" aria-label={t('closePanel')} title={t('closePanel')} disabled={busy} onClick={close}><X size={20} /></button></div></header>
        {!tastesOnly && <div className="notebook-tabs" role="tablist" aria-label={t('collection.notebook')} onKeyDown={event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setTab(tabs[index]); dialog.current?.querySelector<HTMLButtonElement>(`#notebook-tab-${tabs[index]}`)?.focus();
            }
        }}>{tabs.map(value => { const Icon = tabIcons[value]; return <button type="button" className={`notebook-leaf notebook-leaf--${value}`} key={value} id={`notebook-tab-${value}`} role="tab" tabIndex={value === tab ? 0 : -1} aria-selected={value === tab} aria-controls={`notebook-panel-${value}`} disabled={busy} onClick={() => { setTab(value); setNotice(''); }}><Icon size={18} aria-hidden="true" /><span>{t('collection.tab.' + value)}</span></button>; })}</div>}
        {(confirmClose || pendingCopy) && <div className="notebook-confirm" role="alert"><p>{t('collection.unsaved')}</p><button type="button" onClick={() => { setConfirmClose(false); setPendingCopy(null); }}>{t('collection.keepEditing')}</button><button type="button" onClick={() => { if (pendingCopy) copyToDraft(pendingCopy); else onClose(); }}>{t('collection.discard')}</button></div>}
        {loading && <p role="status">{t(tastesOnly ? 'collection.loadingTastes' : 'collection.loading')}</p>}
        {error && <div className="auth-error" role="alert"><p>{t(error)}</p>{(!dietReady || (!tastesOnly && !healthReady)) && <button type="button" disabled={loading || busy} onClick={() => void load()}><RotateCw size={16} />{t('retry')}</button>}</div>}
        {notice && <p className="notebook-notice" role="status">{t(notice)}</p>}
        <div className="notebook-body">
            {!tastesOnly && <aside className="notebook-flyleaf" aria-hidden="true"><PixelTwin gender={account.profile.gender || 'undisclosed'} birthYear={account.profile.birthYear} birthMonth={account.profile.birthMonth} /><strong>{account.profile.nickname}</strong><span>TasteTwin</span></aside>}
            <div className="notebook-content">
                {!tastesOnly && <section id="notebook-panel-profile" role="tabpanel" aria-labelledby="notebook-tab-profile" hidden={tab !== 'profile'}><AccountProfile embedded account={account} onDirty={setProfileDirty} onSave={async profile => { setBusy(true); try { await onSaveProfile(profile); } finally { if (alive.current) setBusy(false); } }} onSignOut={onSignOut} /></section>}
                <section id="notebook-panel-tastes" role={tastesOnly ? undefined : 'tabpanel'} aria-labelledby={tastesOnly ? 'notebook-title' : 'notebook-tab-tastes'} hidden={tab !== 'tastes'}>
                    <fieldset className="notebook-session" disabled={busy}><legend>{t('collection.currentSession')}</legend><RegionInput value={diet.city} disabled={busy || !dietReady} onChange={city => { setDiet(previous => ({ ...previous, city })); setNotice(''); }} /><fieldset className="notebook-selection"><legend>{t('cuisine')}</legend>{cuisineGroups.map(group => <fieldset className="notebook-cuisine-group" key={group.id}><legend>{t('collection.cuisineGroup.' + group.id)}</legend><div className="notebook-choices">{group.values.map(value => <label key={value}><input type="checkbox" checked={session.cuisines.includes(value)} onChange={() => onSessionChange({ ...session, cuisines: session.cuisines.includes(value) ? session.cuisines.filter(item => item !== value) : [...session.cuisines, value] })} />{t('collection.cuisine.' + value)}</label>)}</div></fieldset>)}</fieldset></fieldset>
                    <form onSubmit={event => { event.preventDefault(); void saveDiet(); }}><fieldset className="notebook-fields" disabled={busy || !dietReady}>{selection('allergy')}{selection('avoidance')}<button className="primary" disabled={busy || !dietReady}><Save size={16} />{t('collection.savePreferences')}</button></fieldset></form>
                </section>
                {!tastesOnly && <section id="notebook-panel-health" role="tabpanel" aria-labelledby="notebook-tab-health" hidden={tab !== 'health'}>
                    <form onSubmit={event => { event.preventDefault(); void saveHealth(); }}><fieldset className="notebook-fields" disabled={busy || !healthReady}><div className="notebook-grid">{(['weightKg', 'heightCm'] as const).map(key => <div key={key}><label htmlFor={`notebook-${key}`}>{t('collection.' + key)}</label><input id={`notebook-${key}`} type="number" step="0.01" min={key === 'weightKg' ? '0.01' : '30'} max={key === 'weightKg' ? '500' : '300'} value={health[key]} required onChange={event => editHealth(key, event.target.value)} /></div>)}</div><div className="notebook-bmi"><span>BMI</span><output aria-label="BMI">{bmi === null ? '--' : bmi.toFixed(1)}</output></div><label htmlFor="notebook-bodyFatStatus">{t('collection.bodyFatStatus')}</label><select id="notebook-bodyFatStatus" value={health.bodyFatStatus} required onChange={event => editHealth('bodyFatStatus', event.target.value)}><option value="" disabled>{t('collection.choose')}</option><option value="unknown">{t('collection.unmeasured')}</option><option value="measured">{t('collection.measured')}</option></select>{health.bodyFatStatus === 'measured' && <><label htmlFor="notebook-bodyFatPct">{t('collection.bodyFatPct')}</label><input id="notebook-bodyFatPct" type="number" min="0.01" max="99.99" step="0.01" value={health.bodyFatPct} required onChange={event => editHealth('bodyFatPct', event.target.value)} /></>}
                        {Object.entries(healthOptions).map(([key, values]) => <div key={key} className="notebook-field"><label htmlFor={`notebook-${key}`}>{t('collection.' + key)}</label><select id={`notebook-${key}`} value={health[key as keyof HealthDraft]} required onChange={event => editHealth(key as keyof HealthDraft, event.target.value)}><option value="" disabled>{t('collection.choose')}</option>{values.map(value => <option key={value} value={value}>{t('collection.option.' + value)}</option>)}</select>{key === 'chronotype' && health.chronotype && <small>{t('collection.chronotype.' + health.chronotype)}</small>}</div>)}
                        <button className="primary" disabled={busy || !healthReady}><Save size={16} />{t('collection.addRecord')}</button></fieldset></form>
                    <section className="notebook-history" aria-labelledby="health-history-title"><h3 id="health-history-title">{t('collection.history')}</h3>{!records.length && healthReady && <p>{t('collection.noRecords')}</p>}<ol>{records.map(record => <li key={record.id}><details><summary><time dateTime={record.recordedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.recordedAt))}</time><span>{record.weightKg} kg · BMI {record.bmi.toFixed(1)}</span></summary><dl>{(['weightKg', 'heightCm', 'bodyFatPct', 'goal', 'chronotype', 'breakfastHabit', 'lunchHabit', 'dinnerHabit'] as const).map(key => <div key={key}><dt>{t('collection.' + key)}</dt><dd>{key === 'bodyFatPct' ? (record.bodyFatStatus === 'unknown' ? t('collection.unmeasured') : record.bodyFatPct + ' %') : typeof record[key] === 'number' ? record[key] + (key === 'weightKg' ? ' kg' : ' cm') : t('collection.option.' + record[key])}</dd></div>)}</dl><button type="button" disabled={busy} onClick={() => { if (JSON.stringify(health) !== healthSaved) { setConfirmClose(false); setPendingCopy(record); } else copyToDraft(record); }}><Copy size={16} />{t('collection.copyRecord')}</button></details></li>)}</ol>{nextOffset !== null && <button type="button" disabled={busy} onClick={() => void moreHistory()}><ChevronDown size={16} />{t('collection.moreHistory')}</button>}</section>
                </section>}
            </div></div>
    </div></div>;
}