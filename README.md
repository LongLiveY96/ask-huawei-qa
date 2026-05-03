# ask_huawei_mcp

本地 `stdio` MCP,职责单一:**向华为开发者官方智能问答助手提问**。深度/非深度思考可按调用切换。

本 MCP 不提供文档搜索、文档定位或正文读取工具；需要精确查找官方文档时,请使用外部文档检索能力。

## 本地启动

```bash
npm install
npm run build
node dist/index.js
```

## 工具

| 工具 | 输入 | 用途 |
| --- | --- | --- |
| `ask_ai` | `query`,可选 `thinking: boolean` | 单次提问 |
| `ask_ai_batch` | `queries: string[]`(最多 10),可选 `thinking: boolean` | 批量并行提问 |
| `read_more` | `resourceId: string` | 取被截断的完整回答(缓存 1 小时) |

`thinking` 语义:`true` 走深度思考(慢、答案系统化),`false` 跳过深度思考(快、回答简短),省略则用环境变量默认。

`read_more` 只读取本服务缓存的长回答,不是文档读取接口。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HUAWEI_QA_TIMEOUT_MS` | `180000` | HTTP 请求超时 |
| `HUAWEI_QA_THINK_TYPE` | `1` | 调用方未传 `thinking` 时的默认 thinkType(`1` 深度 / `0` 非深度) |

## 邀请测试地址

- https://appgallery.huawei.com/link/invite-test-wap?taskId=950c3ff7c47af3d4ea25b68382a491da&invitationCode=4JFWVmfSAyc
