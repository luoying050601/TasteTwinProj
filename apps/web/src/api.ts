import type { ApiError } from './types';
import { translate, type Locale } from './i18n';
import { supabase } from './supabase';
const base = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')).replace(/\/$/, '');
const requests = new Set<AbortController>();
export function invalidateRequests() { for (const controller of requests) controller.abort(); requests.clear(); }
export async function api<T>(path: string, body?: unknown, method = 'POST', locale: Locale = 'en-US', accessToken?: string): Promise<T> {
  const controller = new AbortController();
  requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const token = accessToken ?? (await supabase?.auth.getSession())?.data.session?.access_token;
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'Accept-Language': locale, ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    const envelope = await response.json();
    if (!response.ok || !envelope.ok) throw { ...envelope.error, requestId: envelope.requestId } satisfies ApiError;
    return envelope.data as T;
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error) throw error;
    throw { code: 'NETWORK_ERROR', message: translate(locale, 'NETWORK_ERROR'), retryable: true } satisfies ApiError;
  } finally { clearTimeout(timeout); requests.delete(controller); }
}
