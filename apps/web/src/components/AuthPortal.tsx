import { useEffect, useState } from 'react';
import { ArrowRight, Mail, RotateCw, LogOut, UserRound } from 'lucide-react';
import { supabase } from '../supabase';
import { useI18n } from '../i18n';
import type { useAuth } from '../useAuth';
import AccountProfile from './AccountProfile';

export default function AuthPortal({ auth }: { auth: ReturnType<typeof useAuth> }) {
    const { locale, setLocale, t } = useI18n();
    const [email, setEmail] = useState('');
    const [sentEmail, setSentEmail] = useState('');
    const [code, setCode] = useState('');
    const [until, setUntil] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const timer = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 1000);
        return () => window.clearInterval(timer);
    }, [until]);
    async function send() {
        if (!supabase) return;
        setBusy(true); setError('');
        try {
            const address = email.trim();
            const { error: sendError } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
            if (sendError) throw sendError;
            setSentEmail(address); setCode(''); setUntil(Date.now() + 60000); setSeconds(60);
        } catch { setError('LOGIN_FAILED'); } finally { setBusy(false); }
    }
    async function verify() {
        if (!supabase) return;
        setBusy(true); setError('');
        try {
            const { error: verifyError } = await supabase.auth.verifyOtp({ email: sentEmail, token: code, type: 'email' });
            if (verifyError) throw verifyError;
        } catch { setError('OTP_INVALID'); } finally { setBusy(false); }
    }
    async function google() {
        if (!supabase) return;
        setBusy(true); setError('');
        try {
            const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } });
            if (oauthError) throw oauthError;
        } catch { setError('LOGIN_FAILED'); setBusy(false); }
    }
    const waiting = auth.status === 'restoring' || auth.status === 'loading';
    const onboarding = auth.status === 'ready' && !!auth.account && !auth.account.profileComplete;
    return <div className="welcome-scene auth-scene"><img src="/tastetwin-hero.png" alt={t('heroAlt')} /><div inert={onboarding} className="welcome-language"><select aria-label={t('language')} value={locale} onChange={event => setLocale(event.target.value as typeof locale)}><option value="en-US">EN</option><option value="ja-JP">日本語</option><option value="zh-CN">中文</option></select></div>
        <section inert={onboarding} className="portal-band" aria-labelledby="portal-title"><div className="portal-inner"><h1 id="portal-title">Taste<span>Twin</span></h1>
            {waiting ? <p className="auth-status" role="status">{t('restoringLogin')}</p> : auth.status === 'error' ? <div className="auth-recovery"><p className="auth-error" role="alert">{t(auth.error)}</p><button onClick={() => void auth.reload()}><RotateCw size={16} />{t('retry')}</button><button onClick={() => void auth.signOut()}><LogOut size={16} />{t('signOut')}</button></div> : auth.account ? <p className="auth-status">{auth.account.email}</p> : <div className="login-controls">
                <button className="google-login" disabled={busy || !supabase} onClick={() => void google()}><UserRound size={18} />{t('googleLogin')}</button>
                <form className="email-login" onSubmit={event => { event.preventDefault(); if (sentEmail) void verify(); else void send(); }}>
                    {sentEmail ? <><label htmlFor="login-code">{t('verificationCode')}</label><span className="otp-address">{sentEmail}</span><div className="login-input"><input id="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required disabled={busy} /><button className="icon-button" aria-label={t('signIn')} title={t('signIn')} disabled={busy || code.length !== 6}><ArrowRight size={20} /></button></div><div className="otp-actions"><button type="button" disabled={busy || seconds > 0} onClick={() => void send()}>{seconds > 0 ? t('resendCountdown', { seconds }) : t('resendCode')}</button><button type="button" disabled={busy} onClick={() => { setSentEmail(''); setCode(''); setError(''); }}>{t('changeEmail')}</button></div></> : <><label htmlFor="login-email">{t('email')}</label><div className="login-input"><input id="login-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={busy || !supabase} /><button className="icon-button" aria-label={t('sendCode')} title={t('sendCode')} disabled={busy || !supabase || seconds > 0}><Mail size={20} /></button></div></>}
                </form>
                {(error || auth.error) && <p className="auth-error" role="alert">{t(error || auth.error)}</p>}
            </div>}
        </div></section>
        {auth.status === 'ready' && auth.account && !auth.account.profileComplete && <AccountProfile key={auth.account.id} account={auth.account} onSave={auth.save} onSignOut={auth.signOut} />}
    </div>;
}