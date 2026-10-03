import { aiError, normalizeProviderError } from './errors.js';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function validatedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw aiError('9router: Base URL không hợp lệ.', 400, 'INVALID_BASE_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw aiError('9router: Base URL phải là HTTP(S) và không chứa credential.', 400, 'INVALID_BASE_URL');
  }
  return url.toString().replace(/\/$/, '');
}

export async function providerRequest({ provider, url, apiKey, timeoutMs, maxRetries, method = 'GET', body }) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (response.ok) return data;
      const error = aiError(data?.error?.message || data?.message || `HTTP ${response.status}`, response.status);
      if (!RETRYABLE.has(response.status) || attempt === maxRetries) throw error;
    } catch (error) {
      if (error.name === 'AbortError') throw aiError(`${provider}: Yêu cầu hết thời gian chờ. Hãy thử lại.`, 504, 'AI_TIMEOUT');
      if (attempt === maxRetries || !RETRYABLE.has(Number(error.status))) throw normalizeProviderError(provider, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
