import * as crypto from 'crypto';

const BASE_URL = 'https://svc-drcn.developer.huawei.com';
const QA_TIMEOUT_MS = parseInt(process.env.HUAWEI_QA_TIMEOUT_MS || '180000', 10);
const DEFAULT_DOCS_THINK_TYPE = 0;
const DEFAULT_LEGACY_THINK_TYPE = 1;

interface Suggestion {
  title: string;
  url: string;
}

interface StreamResult {
  answer: string;
  thinking: string;
  suggestions: Suggestion[];
  stepInfo: string;
}

interface BatchQAResult {
  query: string;
  answer: string;
  success: boolean;
  error?: string;
}

const normalizeThinkType = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (parsed === 0 || parsed === 1) {
    return parsed;
  }
  return fallback;
};

const LEGACY_THINK_TYPE = normalizeThinkType(process.env.HUAWEI_QA_THINK_TYPE, DEFAULT_LEGACY_THINK_TYPE);
const DOCS_THINK_TYPE = normalizeThinkType(process.env.HUAWEI_QA_DOCS_THINK_TYPE, DEFAULT_DOCS_THINK_TYPE);

const DOC_LOCATOR_SYSTEM_PROMPT = [
  '你是华为 HarmonyOS 文档定位助手。',
  '请仅基于华为官方文档（developer.huawei.com）回答。',
  '只允许返回路径包含 /consumer/cn/doc/ 的链接，禁止返回 blog/topic 等非文档链接。',
  '输出要求：',
  '1) 先给简短说明（最多 3 点，每点 1-2 句）。',
  '2) 再给“官方文档链接”列表，包含标题与 URL。',
  '3) 不要输出与问题无关的背景扩展。',
  '4) 如果信息不足，明确说明并给出最相关官方文档入口。'
].join('\n');

export const buildDocLocatorPrompt = (userQuery: string): string => {
  return `${DOC_LOCATOR_SYSTEM_PROMPT}\n\n用户问题：${userQuery.trim()}`;
};

const OFFICIAL_DOC_PATH_PREFIX = '/consumer/cn/doc/';

const normalizeCandidateUrl = (value: string): string => {
  const cleaned = value.trim().replace(/^[<(]+/, '').replace(/[>),.;:!?，。；：！？]+$/, '');
  try {
    const parsed = new URL(cleaned);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return cleaned;
  }
};

const isOfficialHuaweiDocUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'developer.huawei.com' && parsed.pathname.startsWith(OFFICIAL_DOC_PATH_PREFIX);
  } catch {
    return false;
  }
};

const normalizeSuggestions = (suggestions: Suggestion[]): Suggestion[] => {
  const deduped: Suggestion[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    const url = normalizeCandidateUrl(suggestion.url || '');
    if (!url || !isOfficialHuaweiDocUrl(url)) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    deduped.push({
      title: suggestion.title?.trim() || '官方文档',
      url
    });
  }

  return deduped;
};

const extractDocSuggestionsFromAnswer = (answer: string): Suggestion[] => {
  const candidates: Suggestion[] = [];
  const markdownLinkPattern = /\[([^\]]+)]\((https?:\/\/developer\.huawei\.com\/[^\s)]+)\)/gi;
  const plainUrlPattern = /https?:\/\/developer\.huawei\.com\/[^\s<>"'`）)]+/gi;

  let match: RegExpExecArray | null = markdownLinkPattern.exec(answer);
  while (match) {
    candidates.push({
      title: match[1]?.trim() || '官方文档',
      url: normalizeCandidateUrl(match[2] || '')
    });
    match = markdownLinkPattern.exec(answer);
  }

  match = plainUrlPattern.exec(answer);
  while (match) {
    candidates.push({
      title: '官方文档',
      url: normalizeCandidateUrl(match[0] || '')
    });
    match = plainUrlPattern.exec(answer);
  }

  return normalizeSuggestions(candidates);
};

const collectDocSuggestions = (result: StreamResult): Suggestion[] => {
  const merged = [...normalizeSuggestions(result.suggestions), ...extractDocSuggestionsFromAnswer(result.answer)];
  const deduped: Suggestion[] = [];
  const seen = new Set<string>();

  for (const item of merged) {
    if (seen.has(item.url)) {
      continue;
    }
    seen.add(item.url);
    deduped.push(item);
  }

  return deduped;
};

// 生成 32 位十六进制 ID
// 每次调用都生成新的，完全无状态，避免并发冲突
const generateAnonymousId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

// 创建新会话
const createDialog = async (anonymousId: string): Promise<string> => {
  const response = await fetch(`${BASE_URL}/intelligentcustomer/v1/public/dialog/id`, {
    method: 'POST',
    signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/consumer/cn/`
    },
    body: JSON.stringify({
      origin: 0,
      type: 1001,
      anonymousId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create dialog: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`API error: ${data.message}`);
  }

  return data.result.dialogId;
};

// 发送问题并获取流式响应
const askQuestion = async (
  query: string,
  dialogId: string,
  anonymousId: string,
  thinkType: number = LEGACY_THINK_TYPE
): Promise<StreamResult> => {
  const response = await fetch(`${BASE_URL}/intelligentcustomer/v1/public/dialog/submission`, {
    method: 'POST',
    signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/consumer/cn/`,
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      type: 1001,
      query,
      dialogId,
      channel: 1,
      origin: 0,
      subType: 2,
      thinkType,
      anonymousId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to submit question: ${response.status}`);
  }

  const text = await response.text();
  return parseSSEResponse(text);
};

// 解析 SSE 响应
const parseSSEResponse = (text: string): StreamResult => {
  const result: StreamResult = {
    answer: '',
    thinking: '',
    suggestions: [],
    stepInfo: ''
  };

  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;

    try {
      const jsonStr = line.substring(6).trim();
      if (!jsonStr) continue;

      const data = JSON.parse(jsonStr);

      if (data.code !== 0) continue;
      if (!data.result) continue;

      const r = data.result;

      // 最终结果标记
      if (r.isFinal === true && !r.streamingText) {
        break;
      }

      // 更新答案文本（累积覆盖）
      if (r.streamingText) {
        result.answer = r.streamingText;
      }

      // 更新步骤信息
      if (r.stepInfo) {
        result.stepInfo = r.stepInfo;
      }

      // 更新建议链接
      if (r.suggestions && Array.isArray(r.suggestions)) {
        result.suggestions = r.suggestions.map((s: { title: string; url: string }) => ({
          title: s.title.trim(),
          url: s.url
        }));
      }
    } catch {
      // 忽略解析错误
    }
  }

  return result;
};

const formatLegacyOutput = (result: StreamResult): string => {
  let output = result.answer;

  if (result.suggestions.length > 0) {
    output += '\n\n---\n**参考链接：**\n';
    result.suggestions.forEach((s, i) => {
      output += `${i + 1}. [${s.title}](${s.url})\n`;
    });
  }

  return output;
};

const formatDocsOutput = async (result: StreamResult): Promise<string> => {
  const suggestions = collectDocSuggestions(result);
  const summary = result.answer.trim() || '未检索到明确结论，请参考下方官方文档。';
  let output = summary;

  if (suggestions.length > 0) {
    output += '\n\n---\n**官方文档：**\n';
    suggestions.forEach((s, i) => {
      output += `${i + 1}. [${s.title}](${s.url})\n`;
    });
  } else {
    output += '\n\n---\n**官方文档：**\n未返回可用的官方链接，请调整关键词后重试。\n';
  }

  return output;
};

// 主要的问答函数
// 完全无状态：每次调用都生成新的 anonymousId 和 dialogId
export const huaweiQA = async (query: string): Promise<string> => {
  const anonymousId = generateAnonymousId();

  console.error('[huawei-qa] Creating new dialog...');
  const dialogId = await createDialog(anonymousId);

  console.error(`[huawei-qa] Asking: ${query.substring(0, 50)}...`);

  const result = await askQuestion(query, dialogId, anonymousId, LEGACY_THINK_TYPE);
  return formatLegacyOutput(result);
};

// 批量问答函数 - 并行处理多个问题
export const huaweiQABatch = async (
  queries: string[]
): Promise<BatchQAResult[]> => {
  console.error(`[huawei-qa] Batch processing ${queries.length} questions in parallel...`);

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const answer = await huaweiQA(query);
        return { query, answer, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[huawei-qa] Error processing query: "${query.substring(0, 30)}..." - ${errorMsg}`);
        return { query, answer: '', success: false, error: errorMsg };
      }
    })
  );

  const successCount = results.filter(r => r.success).length;
  console.error(`[huawei-qa] Batch completed: ${successCount}/${results.length} successful`);

  return results;
};

// 文档定位问答函数（非深度思考 + 简短说明 + 官方链接）
export const huaweiQADocs = async (query: string): Promise<string> => {
  const anonymousId = generateAnonymousId();
  const prompt = buildDocLocatorPrompt(query);

  console.error(`[huawei-qa-docs] Creating new dialog... (thinkType=${DOCS_THINK_TYPE})`);
  const dialogId = await createDialog(anonymousId);

  console.error(`[huawei-qa-docs] Asking: ${query.substring(0, 50)}...`);
  const result = await askQuestion(prompt, dialogId, anonymousId, DOCS_THINK_TYPE);

  return await formatDocsOutput(result);
};

// 文档定位批量函数 - 并行处理多个问题
export const huaweiQADocsBatch = async (
  queries: string[]
): Promise<BatchQAResult[]> => {
  console.error(`[huawei-qa-docs] Batch processing ${queries.length} questions in parallel...`);

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const answer = await huaweiQADocs(query);
        return { query, answer, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[huawei-qa-docs] Error processing query: "${query.substring(0, 30)}..." - ${errorMsg}`);
        return { query, answer: '', success: false, error: errorMsg };
      }
    })
  );

  const successCount = results.filter(r => r.success).length;
  console.error(`[huawei-qa-docs] Batch completed: ${successCount}/${results.length} successful`);

  return results;
};
