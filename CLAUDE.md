# HarmonyOS ArkTS 开发提示词

**始终以中文回复**

---

## 文档查询（必须遵守）

不确定 API 用法、组件属性、代码示例时，**必须咨询官方，禁止猜测**。

### 可用工具

| 工具 | 功能 | 示例 |
|------|------|------|
| `ask_ai` | 华为官方 AI 问答（单次） | `ask_ai({ query: "Navigation 页面跳转传参" })` |
| `ask_ai_batch` | 华为官方 AI 问答（批量并行） | `ask_ai_batch({ queries: ["问题1", "问题2"] })` |
| `ask_ai_docs` | 文档定位问答（单次，快速） | `ask_ai_docs({ query: "HdsTabs 官方文档有哪些" })` |
| `ask_ai_docs_batch` | 文档定位问答（批量并行，快速） | `ask_ai_docs_batch({ queries: ["HdsTabs 文档", "Navigation 文档"] })` |
| `read_doc_by_url` | 根据官方文档链接读取完整正文 | `read_doc_by_url({ url: "https://developer.huawei.com/consumer/cn/doc/..." })` |
| `read_more` | 读取被截断的完整回答 | `read_more({ resourceId: "qa-result-1-xxx" })` |

### 使用策略

- **只需要“官方文档链接 + 简短说明”** → `ask_ai_docs`
- **已经拿到官方文档链接，还需要完整正文** → `read_doc_by_url`
- **批量定位官方文档** → `ask_ai_docs_batch`（并行，优先）
- **多个复杂问题（需要完整解释）** → `ask_ai_batch`
- **单个复杂问题（需要完整解释）** → `ask_ai`
- **回答被截断** → `read_more`（缓存有效期 1 小时）

### 文档链路

- 先用 `ask_ai_docs` / `ask_ai_docs_batch` 定位官方文档链接
- 只接受 `https://developer.huawei.com/consumer/cn/doc/` 下的正式文档链接
- 需要正文时，再把链接交给 `read_doc_by_url`
- 不要把“只拿到链接”误当成“已经读过文档正文”

---

## ArkTS 语法约束（违反即编译失败）

### 禁止使用 → 替代方案

| 禁止 | 替代 |
|------|------|
| `any` / `unknown` | 显式指定类型 |
| `var` | `let` / `const` |
| 解构赋值 `{a, b} = obj` | 逐个赋值 |
| `function` 表达式 | 箭头函数 `() => {}` |
| 动态属性 `obj["key"]` | 点语法 `obj.key` |
| 对象字面量作为类型 | 声明 `class` / `interface` |
| `for...in` | `for` 循环或 `forEach` |
| `require()` | `import` |
| 索引签名 `[key: string]` | `Array<T>` / `Map<K,V>` |
| 交叉类型 `A & B` | 继承 `extends` / `implements` |
| 构造函数中声明字段 | 类体内声明 |

---

## HarmonyOS API 规范

1. 优先使用官方 API，确认 API Level 兼容性
2. 资源引用：`$r('app.string.xxx')` 代替硬编码字符串
3. 动画优先用 `scale`/`rotate`/`translate`/`opacity`，避免动画 `width`/`height`/`margin`

---

## Grok Search 路由规则

网络搜索和网页抓取**强制使用 Grok Search MCP 工具**，禁用内置 WebSearch/WebFetch。

| 需求 | 工具 |
|------|------|
| 网络搜索 | `mcp__grok-search-claude__web_search` |
| 网页抓取 | `mcp__grok-search-claude__web_fetch` |
| 配置诊断 | `mcp__grok-search-claude__get_config_info` |

搜索结果必须标注来源 `[标题](URL)`，失败时调整参数至少重试 1 次。
