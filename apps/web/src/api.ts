import type {ApiError} from './types';
import {translate, type Locale} from './i18n';
const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
export async function api<T>(path: string, body?: unknown, method = 'POST', locale:Locale = 'en-US'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {method, headers: {'Content-Type':'application/json','Accept-Language':locale}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:controller.signal});
    const envelope = await response.json();
    if (!response.ok || !envelope.ok) throw {...envelope.error, requestId:envelope.requestId} satisfies ApiError;
    return envelope.data as T;
  } catch(error) {
    if (typeof error === 'object' && error && 'code' in error) throw error;
    throw {code: 'NETWORK_ERROR', message: translate(locale,'NETWORK_ERROR'), retryable: true} satisfies ApiError;
  } finally { clearTimeout(timeout); }
}
