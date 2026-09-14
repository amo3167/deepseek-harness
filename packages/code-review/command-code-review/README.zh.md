---
description: "/dsh-code-review 人类命令：一次薄片投递，把一条确定性的代码审查请求送到 agent 最近的步进边界，回复即为审查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-command-code-review

[English](README.md) | 中文

## 概述

`dsh-command-code-review` 为具备命令运行时的聊天界面提供 `/dsh-code-review` 命令。输入这条命令,agent 会把一个确定性的代码审查请求投递到最近的步进边界,回复即为审查结果。可选的自由格式作用域把用户的关注点带到模型一侧。没有作用域时,模型围绕当前上下文与最近的变更进行审查。本插件没有领域服务、投影、事件配对,或任何 handler 拥有的会话级状态;投递即全部。

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

在已组合 `dsh-commands` 的聊天界面中输入 `/dsh-code-review`,即可开始一次聚焦审查。稳定的成功提示行确认投递;回复即为审查。

### 何时选择

当人类希望按需启动代码审查、并信任模型使用宿主自身的工具完成审查时选择本包。不推荐它用于程序化审查:命令只投递一条用户消息,除成功行外不返回任何内容。

### 最小配置

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-code-review
  name: '@deepseek-ai/dsh-command-code-review'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `name` | `dsh-code-review` | 用户输入的斜杠命令名 |
| `input.hint` | `[<scope or focus>]` | 在输入框中展示的占位提示 |
| `input.attachments` | `false` | 不接收附件输入 |

### 使用命令

| 输入 | 结果 |
|---|---|
| `/dsh-code-review` | 仅以默认提示投递审查。 |
| `/dsh-code-review the new sandbox policy` | 在默认提示后追加 `Reviewer scope: the new sandbox policy`。 |
| `/dsh-code-review src/agents/session.ts` | 在默认提示后追加 `Reviewer scope: src/agents/session.ts`。 |

命令在所有情况下返回稳定的成功行,且不带 `sourceEventSeq`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

本插件在 `ctx.commands` 上注册一条具名命令。其 handler 使用稳定的审查提示与修剪后的自由格式作用域构造一条 `UserMessage`,投递到 agent 最近的步进边界,然后返回稳定的成功行。本插件没有领域服务、投影、事件配对,或 handler 拥有的会话级状态;审查由模型完成,宿主注册的 `dsh-code-review` 技能归宿主所有。

### 源码映射

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口:稳定提示、`reviewMessage` 构造器、handler、`apply` |
| — | 不发布运行时不变量伴随物;本包不暴露任何持续可观察的进程内关系。 |

</details>

-----

<a id="further-exploration"></a>
## 进阶

- [`dsh-code-review` 技能](../../../.agents/skills/dsh-code-review/SKILL.md) —— 宿主存在时模型被鼓励加载的固定审查指导。
- [`dsh-commands`](../../interaction/commands/README.zh.md) —— 本插件注册所依赖的命令注册表。
- [命令插件范式](../../compaction/README.zh.md) —— 与本包最相似的人类命令插件(`/compact`)。

-----

<a id="model-experience"></a>
## 模型体验

### 人类 `/dsh-code-review` 请求

#### 模型看到的内容

斜杠输入与成功行都不进入模型请求。被投递的用户消息承载本包拥有的稳定提示;当用户输入了作用域时,其后追加一行 `Reviewer scope: <作用域>`。完整提示如下:

##### 审查提示
```markdown
Perform a focused code review following the DeepSeek-Harness dsh-code-review guidance. Load the `dsh-code-review` skill with the `skill` tool if it is available, then review only what the reviewer pointed at — the current session context, the most recent change, or the specific path or range the user attached — for correctness, lifecycle, security, and required-behavior regressions. Report findings as a short, ordered list of blockers, each with location, impact, and evidence; then a short list of optional suggestions. When no blockers exist, say so in one sentence and stop.
```

#### Token 影响

下一次模型请求新增一条用户消息,内容为本包拥有的稳定提示(若作用域存在,则后接修剪后的作用域行)。本包不再拥有其他 token。

#### KV Cache 影响

被投递的消息追加在 agent 历史之后;后续请求复用既有的提示前缀与这条新的用户消息。本包不拥有任何缓存前缀,也不会使已有可复用前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定本命令在哪些场景下不适合;它们是本包当前的约束。

- **自由格式作用域,不是结构化的 schema** — 作用域即用户输入的内容;模型将其作为指导读取。结构化作用域语法(路径、提交、分支)延后到消费方提出需求时再做。
- **没有审查信封** — 审查的形状由模型决定;命令不施加任何机器可读信封。专用的发现投影是后续扩展。
- **仅限命令适配器** — 未组合 `ctx.commands` 的界面无法调用本命令,依赖宿主自身的审查工具。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

本开发备注是面向维护者的工作上下文,明确不具备权威地位;线上行为以上述章节、包内代码与所链接的 Agent Note 为准。

- **队列中的命令,未决** — 命令当前立即投递;在 turn 拥有优先权时排队审查是一个开放方向。
- **没有宿主侧钩子** — 本命令是薄片投递;如需宿主侧审查运行器,需另行挂载。

</details>
