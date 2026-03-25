const DOC_SERVICE_BASE_URL = (process.env.DOC_SERVICE_BASE_URL || '').trim().replace(/\/+$/, '');
const DOC_SERVICE_TOKEN = (process.env.DOC_SERVICE_TOKEN || '').trim();
const DOC_SERVICE_TIMEOUT_MS = parseInt(process.env.DOC_SERVICE_TIMEOUT_MS || '30000', 10);
const OFFICIAL_DOC_PATH_PREFIX = '/consumer/cn/doc/';

export interface RemoteDocResult {
  objectId: string;
  title: string;
  url: string;
  relPath: string;
  snapshotId: string;
  markdown: string;
}

interface ResolveResult {
  found: boolean;
  objectId?: string;
  title?: string;
  url?: string;
  relPath?: string;
  snapshotId?: string;
}

export function isOfficialHuaweiDocUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'developer.huawei.com' && parsed.pathname.startsWith(OFFICIAL_DOC_PATH_PREFIX);
  } catch {
    return false;
  }
}

function ensureConfigured(): void {
  if (!DOC_SERVICE_BASE_URL) {
    throw new Error('DOC_SERVICE_BASE_URL is not configured');
  }
  if (!DOC_SERVICE_TOKEN) {
    throw new Error('DOC_SERVICE_TOKEN is not configured');
  }
}

async function fetchJson<T>(pathname: string): Promise<T> {
  ensureConfigured();

  const response = await fetch(`${DOC_SERVICE_BASE_URL}${pathname}`, {
    method: 'GET',
    signal: AbortSignal.timeout(DOC_SERVICE_TIMEOUT_MS),
    headers: {
      'Authorization': `Bearer ${DOC_SERVICE_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  const text = await response.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  if (!response.ok) {
    const message =
      parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody
        ? String((parsedBody as { error?: unknown }).error || response.statusText)
        : response.statusText;
    throw new Error(`Doc service request failed (${response.status}): ${message}`);
  }

  return parsedBody as T;
}

export async function readDocByUrl(url: string): Promise<RemoteDocResult> {
  const normalizedUrl = url.trim();
  if (!isOfficialHuaweiDocUrl(normalizedUrl)) {
    throw new Error('Only official Huawei document links under /consumer/cn/doc/ are supported');
  }

  const resolveResult = await fetchJson<ResolveResult>(`/api/docs/resolve?url=${encodeURIComponent(normalizedUrl)}`);
  if (!resolveResult.found || !resolveResult.objectId) {
    throw new Error('Document not found in remote doc service');
  }

  return await fetchJson<RemoteDocResult>(`/api/docs/${encodeURIComponent(resolveResult.objectId)}`);
}

