const CONTENT_THRESHOLD = 1500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map<string, { content: string; query: string; timestamp: number }>();
let idCounter = 0;

function generateResourceId(): string {
  return `qa-result-${++idCounter}-${Date.now()}`;
}

function cleanExpired(): void {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [id, entry] of cache.entries()) {
    if (entry.timestamp < cutoff) {
      cache.delete(id);
    }
  }
}

export interface CacheResult {
  text: string;
  cached: boolean;
  resourceId?: string;
}

/**
 * 如果内容超过阈值，缓存完整内容并返回截断预览 + resourceId；
 * 否则原样返回。
 */
export function cacheIfNeeded(query: string, answer: string): CacheResult {
  if (answer.length <= CONTENT_THRESHOLD) {
    return { text: answer, cached: false };
  }

  cleanExpired();

  const resourceId = generateResourceId();
  cache.set(resourceId, { content: answer, query, timestamp: Date.now() });

  const preview = answer.substring(0, CONTENT_THRESHOLD);
  const lastNewline = preview.lastIndexOf('\n');
  const cleanPreview = lastNewline > CONTENT_THRESHOLD * 0.5
    ? preview.substring(0, lastNewline)
    : preview;

  const text =
    `${cleanPreview}\n\n---\n` +
    `**⚠️ 内容过长已缓存**\n\n` +
    `完整回答共 ${answer.length} 字符，已超出显示限制。\n\n` +
    `**获取完整内容方式：**\n` +
    `调用工具：\`read_more({ resourceId: "${resourceId}" })\`\n\n` +
    `> 提示：缓存有效期为 1 小时`;

  return { text, cached: true, resourceId };
}

/**
 * 根据 resourceId 读取缓存的完整内容。
 */
export function readFromCache(resourceId: string): string | null {
  const entry = cache.get(resourceId);
  if (!entry) return null;

  // 检查是否过期
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(resourceId);
    return null;
  }

  return entry.content;
}
