# ask-huawei-qa

本地 `stdio` MCP，职责只做两件事：

- 向华为官方智能问答提问
- 先定位官方文档链接，再按 URL 从远端文档服务读取正文

## 本地启动

```bash
npm install
npm run build
node dist/index.js
```

## 环境变量

- `HUAWEI_QA_TIMEOUT_MS`
- `HUAWEI_QA_THINK_TYPE`
- `HUAWEI_QA_DOCS_THINK_TYPE`
- `DOC_SERVICE_BASE_URL`
- `DOC_SERVICE_TOKEN`
- `DOC_SERVICE_TIMEOUT_MS`

## 工具

- `ask_ai`
- `ask_ai_batch`
- `ask_ai_docs`
- `ask_ai_docs_batch`
- `read_doc_by_url`
- `read_more`

