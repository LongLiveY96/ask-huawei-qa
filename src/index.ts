#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  huaweiQA,
  huaweiQABatch,
  huaweiQADocs,
  huaweiQADocsBatch
} from './huawei-qa.js';
import { cacheIfNeeded, readFromCache } from './cache.js';
import { readDocByUrl } from './doc-service.js';

// ============ 工具定义 ============

const TOOLS: Tool[] = [
  {
    name: 'ask_ai',
    description: `向华为开发者官方智能问答助手提问。

## 使用场景
当需要获取更全面、更权威的鸿蒙开发答案时使用此工具：
- 复杂的开发问题（整合了官方文档 + 社区经验）
- 需要代码示例和最佳实践
- 错误排查和问题解决
- 获取最新的开发建议

## 使用示例

示例1 - 用户问："Navigation 怎么实现页面跳转并传参？"
调用：ask_ai({ query: "Navigation 怎么实现页面跳转并传参" })

示例2 - 用户问："List 组件性能优化有哪些方法？"
调用：ask_ai({ query: "List 组件性能优化方法" })

返回华为官方智能助手的回答，包含参考链接。`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要问的问题，使用中文效果更好'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'ask_ai_batch',
    description: `批量向华为开发者官方智能问答助手提问（并行处理）。

## 使用场景
当需要同时查询多个问题时使用此工具：
- 一次调用处理多个相关问题
- 服务器端并行执行，大幅节省时间
- 适用于需要查询多个不同主题的场景

## 与 ask_ai 的区别
- ask_ai：单次提问，多个问题需要多次调用
- ask_ai_batch：批量提问，一次调用处理多个问题（并行执行）

## 使用示例

示例1 - 批量查询不同主题：
调用：ask_ai_batch({ queries: ["Navigation 组件用法", "List 性能优化", "@State 和 @Prop 区别"] })

示例2 - 批量查询相关问题：
调用：ask_ai_batch({ queries: ["如何实现页面跳转", "如何传递参数", "如何返回数据"] })

## 性能优势
假设单个问题响应时间 60 秒：
- 串行调用 3 个问题：60s + 60s + 60s = 180 秒
- 批量并行调用：约 60 秒（取决于最慢的问题）`,
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '问题列表，支持中英文。例如：["Navigation 组件用法", "List 性能优化"]'
        }
      },
      required: ['queries']
    }
  },
  {
    name: 'ask_ai_docs',
    description: `向华为官方智能问答发起“文档定位”提问（独立新方法）。

## 输出特点
- 非深度思考（thinkType=0），响应更快
- 返回“简短说明 + 官方文档链接”
- 仅保留 developer.huawei.com 官方链接
- 若需要完整文档正文，请再调用 read_doc_by_url

## 使用示例
ask_ai_docs({ query: "HdsTabs 组件有哪些官方文档和版本注意事项？" })`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要定位官方文档的问题描述，建议中文'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'ask_ai_docs_batch',
    description: `批量执行文档定位提问（并行）。

## 输出特点
- 与 ask_ai_docs 相同输出风格
- 一次调用并行处理多个问题
- 适合批量梳理某主题的官方文档入口

## 使用示例
ask_ai_docs_batch({ queries: ["HdsTabs 官方文档", "Navigation 官方文档", "List 性能文档"] })`,
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '问题列表，最多 10 个'
        }
      },
      required: ['queries']
    }
  },
  {
    name: 'read_doc_by_url',
    description: `根据华为官方文档 URL 从远端文档服务读取完整正文。

## 使用场景
- 已通过 ask_ai_docs 拿到官方文档链接
- 需要读取对应 markdown 正文
- 只支持 developer.huawei.com/consumer/cn/doc/ 下的正式文档链接

## 使用示例
read_doc_by_url({ url: "https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-navigation-navigation-0000001524296669-V2" })`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '华为官方文档 URL，必须位于 /consumer/cn/doc/ 路径下'
        }
      },
      required: ['url']
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

      try {
        const answer = await huaweiQA(query);
        const result = cacheIfNeeded(query, answer);
        return result.text;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return `华为智能问答调用失败: ${errorMsg}`;
      }
    }

    case 'ask_ai_batch': {
      const queries = args.queries as string[];

      if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return '错误：queries 参数必须是非空数组';
      }

      if (queries.length > 10) {
        return '错误：最多支持同时提问 10 个问题';
      }

      try {
        const results = await huaweiQABatch(queries);

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

    case 'ask_ai_docs': {
      const query = args.query as string;

      try {
        const answer = await huaweiQADocs(query);
        const result = cacheIfNeeded(query, answer);
        return result.text;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return `华为文档定位调用失败: ${errorMsg}`;
      }
    }

    case 'ask_ai_docs_batch': {
      const queries = args.queries as string[];

      if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return '错误：queries 参数必须是非空数组';
      }

      if (queries.length > 10) {
        return '错误：最多支持同时提问 10 个问题';
      }

      try {
        const results = await huaweiQADocsBatch(queries);

        let output = `## 批量文档定位结果 (${results.length} 个问题)\n\n`;

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
        return `批量文档定位调用失败: ${errorMsg}`;
      }
    }

    case 'read_doc_by_url': {
      const url = args.url as string;

      try {
        const doc = await readDocByUrl(url);
        return `# ${doc.title}\n\nURL: ${doc.url}\nobjectId: ${doc.objectId}\nsnapshotId: ${doc.snapshotId}\n\n---\n\n${doc.markdown}`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return `远端文档读取失败: ${errorMsg}`;
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
      version: '1.0.0',
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
