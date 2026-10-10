import { useEffect, useRef, useState } from 'react';
import { Save, X, LogOut } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Gender, Profile, UserAccount } from '../useAuth';
import PixelTwin from './PixelTwin';

export default function AccountProfile({ account, onSave, onClose, onSignOut }: { account: UserAccount; onSave: (profile: Profile) => Promise<void>; onClose?: () => void; onSignOut: () => Promise<void> }) {
    const { t } = useI18n();
    const [nickname, setNickname] = useState(account.profile.nickname || '');
    const [gender, setGender] = useState<Gender | ''>(account.profile.gender || '');
    const [birth, setBirth] = useState(account.profile.birthYear && account.profile.birthMonth ? `${String(account.profile.birthYear).padStart(4, '0')}-${String(account.profile.birthMonth).padStart(2, '0')}` : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const now = new Date();
    const maximum = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLInputElement>('input:not([readonly])')?.focus();
        return () => previous?.focus();
    }, []);
    async function submit() {
        if (!gender || !birth || !nickname.trim()) { setError('PROFILE_INVALID'); return; }
        setBusy(true); setError('');
        try {
            const [birthYear, birthMonth] = birth.split('-').map(Number);
            await onSave({ nickname: nickname.trim(), gender, birthYear, birthMonth });
            onClose?.();
        } catch (reason) {
            const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : 'PROFILE_UNAVAILABLE';
            setError(code);
        } finally { setBusy(false); }
    }
    return <div className="account-backdrop"><div className="account-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="account-title" onKeyDown={event => {
        if (event.key === 'Escape' && !busy && onClose) { onClose(); return; }
        if (event.key === 'Tab') {
            const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }}>
        {onClose && <button className="account-close icon-button" aria-label={t('closePanel')} title={t('closePanel')} disabled={busy} onClick={onClose}><X size={20} /></button>}
        <div className="account-heading"><PixelTwin compact gender={gender || 'undisclosed'} birthYear={Number(birth.split('-')[0])} birthMonth={Number(birth.split('-')[1])} /><h2 id="account-title">{t(onClose ? 'accountTitle' : 'completeProfile')}</h2></div>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <fieldset disabled={busy} className="account-fields">
                <label htmlFor="account-email">{t('email')}</label><input id="account-email" type="email" value={account.email} readOnly />
                <label htmlFor="account-nickname">{t('nickname')}</label><input id="account-nickname" autoComplete="nickname" value={nickname} onChange={event => setNickname(event.target.value)} maxLength={40} required />
                <label htmlFor="account-gender">{t('gender')}</label><select id="account-gender" value={gender} onChange={event => setGender(event.target.value as Gender)} required><option value="" disabled>{t('chooseGender')}</option>{(['male', 'female', 'other', 'undisclosed'] as const).map(value => <option key={value} value={value}>{t('gender_' + value)}</option>)}</select>
                <label htmlFor="account-birth">{t('birthMonth')}</label><input id="account-birth" type="month" min="0001-01" max={maximum} value={birth} onChange={event => setBirth(event.target.value)} required />
            </fieldset>
            {error && <p className="auth-error" role="alert">{t(error)}</p>}
            <div className="account-actions"><button className="primary" disabled={busy}><Save size={16} />{t(busy ? 'savingProfile' : 'saveProfile')}</button><button type="button" className="icon-button" disabled={busy} aria-label={t('signOut')} title={t('signOut')} onClick={() => void onSignOut()}><LogOut size={18} /></button></div>
        </form>
    </div></div>;
}