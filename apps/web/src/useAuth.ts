import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api, invalidateRequests } from './api';
import type { Locale } from './i18n';

export type Gender = 'male' | 'female' | 'other' | 'undisclosed';
export type Profile = { nickname: string; gender: Gender; birthYear: number; birthMonth: number };
export type UserAccount = { id: string; email: string; profile: { [Key in keyof Profile]: Profile[Key] | null }; profileComplete: boolean };
type AuthState = 'restoring' | 'signed-out' | 'loading' | 'ready' | 'error';
function errorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
        return ['AUTH_REQUIRED', 'AUTH_NOT_CONFIGURED', 'AUTH_UNAVAILABLE', 'PROFILE_UNAVAILABLE', 'NETWORK_ERROR'].includes(error.code) ? error.code : 'LOGIN_FAILED';
    }
    return 'LOGIN_FAILED';
}

export function useAuth(locale: Locale) {
    const [status, setStatus] = useState<AuthState>('restoring');
    const [account, setAccount] = useState<UserAccount | null>(null);
    const [error, setError] = useState('');
    const sessionRef = useRef<Session | null>(null);
    const sequence = useRef(0);
    const localeRef = useRef(locale); localeRef.current = locale;

    async function load(session: Session | null) {
        const current = ++sequence.current;
        const changed = sessionRef.current?.user.id !== session?.user.id;
        sessionRef.current = session;
        if (changed) { invalidateRequests(); setAccount(null); }
        setError('');
        if (!session) { setAccount(null); setStatus('signed-out'); return; }
        if (changed) setStatus('loading');
        try {
            const user = await api<UserAccount>('/api/me', undefined, 'GET', localeRef.current, session.access_token);
            if (current !== sequence.current) return;
            setAccount(user); setStatus('ready');
        } catch (reason) {
            if (current !== sequence.current) return;
            setError(errorCode(reason)); setStatus('error');
        }
    }

    useEffect(() => {
        const client = supabase;
        if (!client) { setError('AUTH_NOT_CONFIGURED'); setStatus('signed-out'); return; }
        let alive = true;
        let initialized = false;
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            if (initialized && event !== 'INITIAL_SESSION' && alive) void load(session);
        });
        async function restore() {
            await Promise.resolve();
            if (!alive) return;
            try {
                const params = new URLSearchParams(window.location.search);
                if (params.has('error')) throw new Error('OAuth failed');
                if (params.has('code')) {
                    const { error: exchangeError } = await client!.auth.exchangeCodeForSession(params.get('code')!);
                    if (exchangeError) throw exchangeError;
                }
                const { data, error: sessionError } = await client!.auth.getSession();
                if (sessionError) throw sessionError;
                if (alive) { initialized = true; await load(data.session); }
            } catch (reason) {
                if (alive) { initialized = true; setError(errorCode(reason)); setStatus('signed-out'); }
            } finally {
                if (alive && (window.location.search.includes('code=') || window.location.search.includes('error='))) {
                    const url = new URL(window.location.href);
                    for (const name of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(name);
                    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
                }
            }
        }
        void restore();
        return () => { alive = false; sequence.current++; subscription.unsubscribe(); };
    }, []);

    async function save(profile: Profile) {
        const session = sessionRef.current;
        if (!session) throw new Error('AUTH_REQUIRED');
        sequence.current++;
        invalidateRequests();
        const updated = await api<UserAccount>('/api/me', profile, 'PATCH', locale, session.access_token);
        if (sessionRef.current?.user.id === session.user.id) { sequence.current++; setAccount(updated); setStatus('ready'); setError(''); }
    }
    async function signOut() {
        const { error: signOutError } = await supabase!.auth.signOut({ scope: 'local' });
        if (signOutError) { setError('LOGIN_FAILED'); setStatus('error'); return; }
        await load(null);
    }
    return { status, account, error, save, signOut, reload: () => load(sessionRef.current) };
}