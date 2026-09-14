---
description: "dsh-webhook-code-review 规则：一条 GitHub webhook 规则，在映射的本地 checkout 工作树上启动自动代码评审 Session。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-code-review

[English](README.md) | 中文

## 概述

`dsh-webhook-code-review` 在共享的 `dsh-webhook` runtime 上注册一条 webhook 规则。当签名 GitHub 交付匹配配置的来源、事件与动作白名单时，规则要求 runtime 在映射的本地 checkout（Web Workspace）中创建一个新 Session，其提示词是共享的 `dsh-code-review` 提示词加上一条固定的工作树指令。评审就是该 Session 的回复；除规则注册外，本包不拥有评审服务、projection 或会话状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进阶](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把它挂在 `dsh-webhook` 与一个绑定到规则期望来源名的 `dsh-webhook-github` 适配器之后。[通过 GitHub Webhook 创建评审会话](../../../docs/user/guide/github-review.zh.md)中随附的示例是完整接线：规则加一个挂在第二 loopback WebServer 上的接入 group。

### 何时选择

当某个仓库事件应当在无人值守时启动一次针对本地 checkout 的代码评审时选择它。如果评审目标是所交付 pull request 的远端内容，则跳过它——本规则评审的是映射 checkout 的**工作树**，因此 checkout 必须持有正在评审的变更集。

### 最小配置

```yaml
- id: webhook-runtime
  name: '@deepseek-ai/dsh-webhook'
- id: code-review-auto
  name: '@deepseek-ai/dsh-webhook-code-review'
  config:
    source: primary-github
    workspaces:
      owner/repo: /absolute/path/to/checkout
    agentPreset: standard
    permissionPreset: read-only
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `source` | 任意 | 适配器来源名；设置后仅该来源的交付触发 |
| `events` | `pull_request`、`push` | 触发评审的 GitHub 事件名 |
| `pullRequestActions` | `opened`、`synchronize`、`reopened` | 触发评审的 `pull_request` 动作 |
| `workspaces` | 空 | 仓库 `owner/name` 到本地 checkout 绝对路径 |
| `workspacePath` | 无 | 仓库未映射时使用的兜底 checkout 路径 |
| `agentPreset` | —（必填） | 评审 Session 的 Agent 组合 |
| `permissionPreset` | —（必填） | 评审 Session 接纳的沙箱与审批 preset |
| `model` | 无 | 评审 Session 的可选 provider 与 model 路由 |

仓库未映射且未配置兜底路径的交付会被静默接受：不创建 Session，不报错。`agentPreset`、`permissionPreset` 与至少一个 workspace 来源会前置校验——错误挂载会快速失败，而不是吞掉交付。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

`apply` 校验配置，并以稳定规则 id `code-review-auto` 在 `ctx.webhookRuntime` 上注册一条规则。规则的 `run` 回调是已验证交付的纯函数：它按配置的白名单检查来源、事件名与 `pull_request` 动作，把仓库解析为绝对 workspace 路径（先查 `workspaces` 条目，再退到 `workspacePath`），返回一个 `WebhookSessionRequest`——一个以仓库与事件命名的确定标题、共享评审提示词加固定工作树指令、配置的 presets 与可选 model 路由。此后的全部工作归 `dsh-webhook` 所有：Workspace 规范化与创建（首次交付创建、后续复用）、只读类权限 preset、Session 发布，以及执行评审的 Agent turn。

### 源码映射

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：稳定表面提示词、`matches` / `resolveWorkspace` / `buildPrompt` / `reviewTitle` / `buildReviewRequest` 辅助函数，以及带规则注册的 `apply` |
| — | 不发布 runtime 一致性伴侣；本包不暴露任何可持续观察的进程内关系。 |

</details>

-----

<a id="further-exploration"></a>
## 进阶

- [`dsh-webhook`](../../webhook/webhook/README.zh.md) — 本规则挂载其上的 webhook runtime，含规则、交付与 Session 创建语义。
- [`dsh-webhook-github`](../../webhook/webhook-github/README.zh.md) — 产生本规则匹配的交付的签名 GitHub 适配器。
- [`dsh-command-code-review`](../command-code-review/README.zh.md) — 交互式 `/dsh-code-review` 命令；本包复用其 `DEFAULT_REVIEW_PROMPT` 作为自动路径的单一事实来源。
- [通过 GitHub Webhook 创建评审会话](../../../docs/user/guide/github-review.zh.md) — 端到端接线指南：密钥、接入端口、规则配置与交付语义。

-----

<a id="model-experience"></a>
## 模型体验

### 自动评审 Session

#### 模型看到的内容

规则的 HTTP 响应（`202`）不是模型请求。到达模型的是一个新 Session：映射 Workspace 中第一条 user message 即下面这段确定性提示词——共享 `dsh-code-review` 提示词之后紧跟固定的工作树指令，以单个空行连接。消息携带一个 `webhook` 来源徽章，其摘要为 `github webhook handled by code-review-auto`；模型只看到提示词文本，看不到 GitHub payload；交付的 PR 字段仅是路由元数据。完整提示词：

##### 自动评审提示词
```markdown
Perform a focused code review following the DeepSeek-Harness dsh-code-review guidance. Load the `dsh-code-review` skill with the `skill` tool if it is available, then review only what the reviewer pointed at — the current session context, the most recent change, or the specific path or range the user attached — for correctness, lifecycle, security, and required-behavior regressions. Report findings as a short, ordered list of blockers, each with location, impact, and evidence; then a short list of optional suggestions. When no blockers exist, say so in one sentence and stop.

Reviewer surface: the working tree of this workspace. Establish the change set with `git status --short`, `git diff --staged`, and `git diff HEAD`, then review exactly that change set.
```

#### Token 影响

一个新 Session、一条 user message：共享提示词加表面指令。每次自动评审花一个新 Session 历史；提示词逐字节稳定，宿主若按前缀缓存可复用其 runtime 已有的任何共享前缀。

#### KV Cache 影响

每次自动评审是拥有独立缓存的新 Session；本包不拥有可复用前缀，也不改动任何既有 Session 缓存中的内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制定义了规则不适用的场合；它们是本包当前的约束。

- **仅工作树** — 评审目标是 checkout 的工作树，而非所交付 PR 的远端 diff。评审远端 PR 正文与 diff 属于另一条规则或提示词表面。
- **无策略钩子** — 匹配即白名单加仓库映射；策略服务门控需要在本包旁边挂载一条自定义规则。
- **仅 GitHub 供应商** — 规则 kind 是 `github`；其他供应商需要在同一 runtime 上另写规则。
- **每次交付一条评审** — 重复交付创建重复 Session，与交互式命令的重复行为一致。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

本开发备注是维护者工作上下文，明确不具权威性；已发布行为以各上文小节、包代码与所链接的 Agent Notes 为准。

- **提示词归属** — 评审提示词正文归 `dsh-command-code-review`（`DEFAULT_REVIEW_PROMPT`）所有；本包只追加工作树表面指令。两者必须逐字节保留在本 README 的模型体验小节中。
- **规则 id 契约** — `code-review-auto` 出现在 Session 来源徽章摘要中（`github webhook handled by <rule id>`）；重命名必须与依赖它的消费方同步。
- **Null 路径即契约** — `buildReviewRequest` 返回 `null`（未匹配或 workspace 未解析）是静默无操作路径；runtime 视其为「无动作」而非错误。

</details>
