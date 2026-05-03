import * as crypto from 'crypto';

const BASE_URL = 'https://svc-drcn.developer.huawei.com';
const QA_TIMEOUT_MS = parseInt(process.env.HUAWEI_QA_TIMEOUT_MS || '180000', 10);
const DEFAULT_THINK_TYPE = 1;

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

// 环境变量决定默认 thinkType,调用方传 thinking 参数可覆盖。
const ENV_DEFAULT_THINK_TYPE = normalizeThinkType(process.env.HUAWEI_QA_THINK_TYPE, DEFAULT_THINK_TYPE);

// thinking: true → 深度思考(thinkType=1);false → 跳过深度思考(thinkType=0);undefined → 用环境变量默认
const resolveThinkType = (thinking: boolean | undefined): number => {
  if (thinking === true) return 1;
  if (thinking === false) return 0;
  return ENV_DEFAULT_THINK_TYPE;
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
  thinkType: number
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

const formatOutput = (result: StreamResult): string => {
  let output = result.answer;

  if (result.suggestions.length > 0) {
    output += '\n\n---\n**参考链接：**\n';
    result.suggestions.forEach((s, i) => {
      output += `${i + 1}. [${s.title}](${s.url})\n`;
    });
  }

  return output;
};

// 主要的问答函数
// 完全无状态：每次调用都生成新的 anonymousId 和 dialogId
// thinking 参数:true=深度思考(慢但深入) / false=跳过深度思考(快) / undefined=用环境变量 HUAWEI_QA_THINK_TYPE 默认
export const huaweiQA = async (query: string, thinking?: boolean): Promise<string> => {
  const anonymousId = generateAnonymousId();
  const thinkType = resolveThinkType(thinking);

  console.error(`[huawei-qa] Creating new dialog... (thinkType=${thinkType})`);
  const dialogId = await createDialog(anonymousId);

  console.error(`[huawei-qa] Asking: ${query.substring(0, 50)}...`);

  const result = await askQuestion(query, dialogId, anonymousId, thinkType);
  return formatOutput(result);
};

// 批量问答函数 - 并行处理多个问题
export const huaweiQABatch = async (
  queries: string[],
  thinking?: boolean
): Promise<BatchQAResult[]> => {
  console.error(`[huawei-qa] Batch processing ${queries.length} questions in parallel (thinking=${thinking ?? 'env-default'})...`);

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const answer = await huaweiQA(query, thinking);
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
