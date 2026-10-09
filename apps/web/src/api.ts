import type {ApiError} from './types';
const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {method, headers: {'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:controller.signal});
    const envelope = await response.json();
    if (!response.ok || !envelope.ok) throw {...envelope.error, requestId:envelope.requestId} satisfies ApiError;
    return envelope.data as T;
  } catch(error) {
    if (typeof error === 'object' && error && 'code' in error) throw error;
    throw {code: 'NETWORK_ERROR', message: '后端连接失败或请求超时。请确认 FastAPI 已启动，再重试。', retryable: true} satisfies ApiError;
  } finally { clearTimeout(timeout); }
}
