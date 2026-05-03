# HarmonyOS ArkTS 开发提示词

**始终以中文回复**

---

## 文档查询(必须遵守)

不确定 API 用法、组件属性、代码示例时,**必须咨询官方,禁止猜测**。

### 可用工具

| 工具 | 功能 | 示例 |
|------|------|------|
| `ask_ai` | 华为官方 AI 问答(单次) | `ask_ai({ query: "Navigation 页面跳转传参" })` |
| `ask_ai`(快) | 跳过深度思考,适合事实型/简单概念 | `ask_ai({ query: "@State 一句话定义", thinking: false })` |
| `ask_ai_batch` | 批量并行问答 | `ask_ai_batch({ queries: ["问题1", "问题2"] })` |
| `read_more` | 取被截断的完整回答 | `read_more({ resourceId: "qa-result-1-xxx" })` |

### 使用策略

- **复杂/系统化的问题** → `ask_ai`(默认开启深度思考)
- **简单概念定义、事实型问题、快速概览** → `ask_ai({ ..., thinking: false })`
- **多个问题需要并行** → `ask_ai_batch`,可统一传 `thinking` 切档
- **回答被截断** → `read_more`(缓存有效期 1 小时)

### 文档定位链路

官方文档定位/正文读取请使用 codegenie 提供的 `harmonyos_knowledge_search` 等工具,本 MCP 不再承担此职能。

---

## ArkTS 语法约束(违反即编译失败)

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

1. 优先使用官方 API,确认 API Level 兼容性
2. 资源引用:`$r('app.string.xxx')` 代替硬编码字符串
3. 动画优先用 `scale`/`rotate`/`translate`/`opacity`,避免动画 `width`/`height`/`margin`
