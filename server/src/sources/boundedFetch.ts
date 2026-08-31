const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export async function fetchJsonBounded<T>(url: string, options: { timeoutMs?: number; maxBytes?: number; userAgent?: string } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'user-agent': options.userAgent ?? 'world-intelligence-ai/0.1' },
    });
    if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (declaredLength > maxBytes) throw new Error('provider response too large');
    if (!response.body) throw new Error('provider response has no body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('provider response too large');
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(merged)) as T;
  } finally {
    clearTimeout(timer);
  }
