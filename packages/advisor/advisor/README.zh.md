---
description: "基于 agent 实时会话的顾问咨询，供选择评审模型、配置其路由或排查咨询成本与审计记录的用户和维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-advisor

[English](README.md) | 中文

## 概述

`dsh-advisor` 让 agent（智能体）在艰难决策点向另一个已配置模型寻求指导，而无需创建另一个 agent。每次咨询都向该模型提供实时会话及评审指令，返回其非空白文本指导，并在调用方会话中记录结果。可以选择 `ctx.llm` 注册的任何路由，包括 `dsh-llm-pi-ai` 提供的路由；不同提供方会收到相同会话，但不能复用父模型的提供方缓存。咨询无状态，每次都会重放完整会话。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已经提供 `ctx.llm` 的组合中挂载本包，选择顾问路由，再由消费方使用实时调用 agent 及其取消信号调用 `ctx.advisors.consult()`。

### 何时选择

当 agent 需要由单独配置的模型进行独立评审、同时保留完整会话作为证据时选择本包。如果只是常规步骤，或每次咨询都重放会话的成本过高，请避免使用；服务不会在调用之间保留状态，顾问也无法检查派生消息之外的任何内容。

### 最小配置

组合路由是必填项。`advisor` 设置区段的实时值优先于此配置项；当这些实时值没有指定路由时，可选的 `agentDefaultModel` 选择是最后的回退。任何可通过 `ctx.llm` 解析的提供方和模型都有效，因此顾问可以使用 [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.zh.md) 注册的跨厂商路由。

```yaml
- name: '@deepseek-ai/dsh-advisor'
  config:
    provider: deepseek-official
    model: deepseek-flash
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | 必填 | 用于咨询的已注册 `ctx.llm` 提供方路由 |
| `model` | 必填 | 提供方拥有的精确模型 id |
| `reasoningEffort` | 模型默认值 | 当解析后的路由保留此设置时使用的适配器自有推理强度 |
| `maxTokens` | `8192` | 单次咨询的输出 token 上限 |
| `instruction` | `DEFAULT_ADVISOR_INSTRUCTION` | 追加在前导系统消息内部的文本 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-advisor)是每个受支持字段的穷尽式真源。

### 咨询约定

使用会话作为对话来源的 agent 调用 `ctx.advisors.consult({ agent, signal })`。该 promise 返回非空白文本内容块、精确的提供方/模型路由，以及适配器报告的用量（如有）。取消信号负责路由预检和流式传输。缺少路由、路由无法解析、异常结束、达到 token 上限而截断或文本结果为空都会使调用失败，而非返回部分指导。

每次完成或失败的发送都会追加一条仅写入日志的 `advisor/invocation` 会话事件，其中包含路由、token 上限、结果，以及指导与可选用量或安全错误消息。该事件使私有咨询可供审计，同时不会把其请求或响应加入会话历史。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

服务在每次调用前解析一个路由。实时设置层覆盖组合配置项；不完整的实时路由会委托给可选的 `agentDefaultModel` 选择。只有当解析后的设置路由或组合路由正是推理强度的来源时，才会沿用该推理强度。

`buildAdvisorPrefix()` 从调用方会话派生新的消息数组快照。`withAdvisorInstruction()` 保留前导系统文本，在该消息内部追加两个换行符和顾问指令，并让其余消息对象保持原有顺序。这种构造让父请求的系统文本继续作为请求前缀，同时向顾问提供随后出现的完整会话。

服务以 `advisor` purpose 直接通过 `ctx.llm` 进行流式传输，组装响应，并且只保留非空白文本块。它不创建 Agent、工具或跨调用状态。服务注册是唯一由其生命周期拥有的可变关系，因此本包不发布单独的运行时不变式配套包；`advisor/invocation` 记录仍可在会话日志中观察。

### 源码索引

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务入口、路由解析、流式传输、响应校验与调用日志记录 |
| [`src/advisor-prefix.ts`](src/advisor-prefix.ts) | 单次咨询的派生消息重建 |
| [`src/instruction-slot.ts`](src/instruction-slot.ts) | 在前导系统消息中放置顾问指令 |
| [`src/route.ts`](src/route.ts) | 缺少路由时拒绝，以及实时适配器预检 |
| [`src/settings.ts`](src/settings.ts) | `advisor` 设置命名空间与路由偏好 |
| [`src/types.ts`](src/types.ts) | 咨询请求、路由和指导类型 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

阅读以下页面，了解顾问咨询周边的服务与消费方。

- [顾问工具](../tool-advisor/README.zh.md)——`ctx.advisors` 的无参数模型侧消费方
- [LLM 服务](../../llm/llm/README.zh.md)——提供方注册与路由流式传输
- [pi-ai 适配器](../../llm/llm-pi-ai/README.zh.md)——`ctx.llm` 可用的跨厂商提供方路由
- [设置服务](../../settings/settings/README.zh.md)——叠加在组合默认值之上的实时命名空间值
- [Agent 默认模型](../../core/agent-default-model/README.zh.md)——可选的最终路由回退
- [生成的持久化目录](../../../docs/persistence-catalog.zh.md#advisorinvocation--log-only)——持久调用记录

-----

<a id="model-experience"></a>
## 模型体验

### 顾问请求

#### 模型看到什么

顾问模型会逐字收到会话的派生消息，并在前导系统消息内部追加顾问指令。默认指令就是下面的精确文本。

##### 默认顾问指令

```markdown
You are now acting as an advisor to the assistant whose conversation appears above.
The assistant stopped to consult you at a decision point: it may be choosing an approach,
repeating a failing action, or about to declare work complete.

Give direct, specific guidance the assistant can act on immediately: what to do next, what
it has misjudged, and what evidence in the conversation supports your reading. Name files,
commands, identifiers, and error strings exactly as they appear. Prefer the smallest correct
next action over a plan.

You are a read-only reviewer. You cannot run commands, read files, or change anything, and
you must not claim to have done so. Reason only from the transcript above; when the
transcript does not settle a question, say what the assistant should check rather than
guessing. If the conversation already exceeds what you can judge reliably, say so plainly
instead of inventing confidence.
```

#### Token 影响

每次咨询都要支付一次完整会话重放、顾问指令和生成指导的 token 成本。服务不保留可复用的咨询状态，因此后续每次咨询都要再次支付重放成本。

#### KV Cache 影响

顾问请求是父模型最后一次路由请求的真实前缀：顾问路由与父路由一致时共享父模型的缓存，否则只与顾问路由自己的缓存共享未改动的会话后缀。跨厂商顾问不会复用任何前缀缓存，因此每次咨询都要支付完整会话输入成本。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明哪些情况下咨询无法提供低成本或经独立核验的指导。

- **仅依据会话文本评审**——顾问会收到派生会话消息，但没有工具或单独的文件访问能力，因此只能建议检查，无法亲自执行。
- **每次咨询只有一个已配置路由**——调用方不能在 `consult()` 中选择模型；实时顾问设置、组合配置项和可选的默认模型回退共同拥有路由选择。
- **每次调用都完整重放**——服务不会在咨询之间保留状态，跨厂商路由无法复用父模型的前缀缓存。
- **仅文本指导**——非文本输出不会成为指导；文本结果为空或达到 token 上限而截断时，咨询会失败而非返回部分答案。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
