# ask_huawei_mcp

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
- `DOC_SERVICE_SYNC_POLL_INTERVAL_MS`
- `DOC_SERVICE_SYNC_WAIT_TIMEOUT_MS`

## 工具

- `ask_ai`
- `ask_ai_batch`
- `ask_ai_docs`
- `ask_ai_docs_batch`
- `read_doc_by_url`
- `read_more`

## 邀请测试地址

- https://appgallery.huawei.com/link/invite-test-wap?taskId=950c3ff7c47af3d4ea25b68382a491da&invitationCode=4JFWVmfSAyc
