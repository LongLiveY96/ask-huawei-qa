#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { huaweiQA, huaweiQABatch } from './huawei-qa.js';
import { cacheIfNeeded, readFromCache } from './cache.js';

// ============ 工具定义 ============

const TOOLS: Tool[] = [
  {
    name: 'ask_ai',
    description: `向华为开发者官方智能问答助手提问。

## 使用场景
- 复杂的开发问题（整合了官方文档 + 社区经验）
- 需要代码示例和最佳实践
- 错误排查和问题解决
- 获取最新的开发建议

## thinking 参数
- 不传 / true：开启深度思考(慢、答案更系统化,默认行为)
- false：跳过深度思考(快,回答偏简短直接,适合简单/事实型问题)

## 使用示例

ask_ai({ query: "Navigation 怎么实现页面跳转并传参" })
ask_ai({ query: "List 组件性能优化方法" })
ask_ai({ query: "@State 和 @Prop 的区别", thinking: false })   // 简单概念定义,跳过深度思考更快

返回华为官方智能助手的回答,包含参考链接。`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要问的问题，使用中文效果更好'
        },
        thinking: {
          type: 'boolean',
          description: '是否开启深度思考。true=深度思考(慢,系统化);false=跳过(快,简短);省略=用环境变量 HUAWEI_QA_THINK_TYPE 默认(默认 true)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'ask_ai_batch',
    description: `批量向华为开发者官方智能问答助手提问（并行处理）。

## 使用场景
- 一次调用处理多个相关问题
- 服务器端并行执行,大幅节省时间

## 与 ask_ai 的区别
- ask_ai：单次提问
- ask_ai_batch：并行批量提问,所有 query 共用同一个 thinking 设定

## 使用示例

ask_ai_batch({ queries: ["Navigation 组件用法", "List 性能优化", "@State 和 @Prop 区别"] })
ask_ai_batch({ queries: ["如何实现页面跳转", "如何传递参数"], thinking: false })  // 批量快速概览

## 性能优势
假设单题响应 60s:串行 3 题 = 180s,并行 ≈ 60s(取决于最慢的那题)`,
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '问题列表，支持中英文。例如：["Navigation 组件用法", "List 性能优化"]'
        },
        thinking: {
          type: 'boolean',
          description: '是否对所有问题开启深度思考。语义同 ask_ai 的 thinking 参数'
        }
      },
      required: ['queries']
    }
  },
  {
    name: 'read_more',
    description: `读取被截断的完整回答内容。

## 使用场景
当 ask_ai 返回的内容被截断时，使用此工具读取完整内容。

## 使用流程
1. 调用 ask_ai 获取回答
2. 如果回答中包含 "内容过长已缓存" 的提示和 resourceId
3. 使用该 resourceId 调用此工具读取完整内容

## 使用示例
read_more({ resourceId: "qa-result-1-1706123456789" })

返回完整的 Markdown 格式回答内容。`,
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: {
          type: 'string',
          description: '资源 ID，从 ask_ai 的回答中获取'
        }
      },
      required: ['resourceId']
    }
  }
];

// ============ 工具调用处理 ============

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'ask_ai': {
      const query = args.query as string;
      const thinking = typeof args.thinking === 'boolean' ? args.thinking : undefined;

      try {
        const answer = await huaweiQA(query, thinking);
        const result = cacheIfNeeded(query, answer);
        return result.text;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return `华为智能问答调用失败: ${errorMsg}`;
      }
    }

    case 'ask_ai_batch': {
      const queries = args.queries as string[];
      const thinking = typeof args.thinking === 'boolean' ? args.thinking : undefined;

      if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return '错误：queries 参数必须是非空数组';
      }

      if (queries.length > 10) {
        return '错误：最多支持同时提问 10 个问题';
      }

      try {
        const results = await huaweiQABatch(queries, thinking);

        let output = `## 批量问答结果 (${results.length} 个问题)\n\n`;

        results.forEach((result, index) => {
          output += `### 问题 ${index + 1}: ${result.query}\n\n`;

          if (result.success) {
            const cached = cacheIfNeeded(result.query, result.answer);
            if (cached.cached) {
              const preview = result.answer.substring(0, 500);
              const lastNewline = preview.lastIndexOf('\n');
              const cleanPreview = lastNewline > 250 ? preview.substring(0, lastNewline) : preview;

              output += `${cleanPreview}\n\n...**内容过长已缓存** (共 ${result.answer.length} 字符)\n`;
              output += `调用 \`read_more({ resourceId: "${cached.resourceId}" })\` 获取完整内容\n\n`;
            } else {
              output += `${result.answer}\n\n`;
            }
          } else {
            output += `❌ 失败: ${result.error || 'Unknown error'}\n\n`;
          }

          output += `---\n\n`;
        });

        const successCount = results.filter(r => r.success).length;
        output += `> 统计：${successCount}/${results.length} 个问题成功回答`;

        return output;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return `批量问答调用失败: ${errorMsg}`;
      }
    }

    case 'read_more': {
      const resourceId = args.resourceId as string;

      if (!resourceId) {
        return '错误：resourceId 参数不能为空';
      }

      const content = readFromCache(resourceId);
      if (!content) {
        return `未找到资源: ${resourceId}\n\n可能的原因：\n1. 资源 ID 不正确\n2. 资源已过期（超过1小时）\n\n请重新调用 ask_ai 获取新的回答。`;
      }

      return content;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ============ 服务器启动 ============

async function main() {
  const server = new Server(
    {
      name: 'ask-huawei-qa',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await handleToolCall(name, args || {});
    return {
      content: [{ type: 'text', text: result }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[ask-huawei-qa] Server started in stdio mode');
}

main().catch((error) => {
  console.error('[ask-huawei-qa] Fatal error:', error);
  process.exit(1);
});
