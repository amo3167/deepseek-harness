---
description: "无参数的顾问工具及提示词指引，供启用模型咨询、配置工具可见性或排查建议如何到达调用模型的用户和维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-advisor

[English](README.md) | 中文

## 概述

`dsh-tool-advisor` 让模型在艰难决策点咨询已配置的顾问。工具不接受参数，因为顾问会读取调用 agent 的完整实时会话；调用方无需选择模型或编写简报。返回的指导成为调用模型可读取并据以行动的工具结果。可选的提示词区段会告诉模型何时值得花费额外 token 进行咨询。仅当顾问设置启用咨询时，工具和提示词区段才可见。只有在 `dsh-advisor` 已配置顾问路由后才挂载本包。

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

将本包挂载在 `dsh-advisor` 旁边，在顾问设置启用时向模型公开一个咨询工具，并默认在系统提示词中加入简洁的升级咨询指引。

### 何时选择

当调用模型应自行决定何时通过组合或实时设置已经选定的顾问路由寻求第二意见时选择本包。如果咨询只能由应用代码调用、调用方必须逐次选择路由，或额外 schema 与提示词 token 的成本不值得，请避免使用。

### 最小配置

顾问服务拥有模型选择；工具没有提供方、模型或推理字段。其可选设置只能重命名模型侧工具或禁止提示词区段。

```yaml
- name: '@deepseek-ai/dsh-advisor'
  config:
    provider: deepseek-official
    model: deepseek-flash
- name: '@deepseek-ai/dsh-tool-advisor'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `toolName` | `advisor` | 模型侧名称；每个已加载实例必须使用不同值 |
| `promptSection` | `true` | 是否加入说明何时咨询的系统提示词区段 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-advisor)是每个受支持字段的穷尽式真源。

### 每次调用做什么

模型使用空对象调用工具。执行器把调用 agent 和取消信号传给 `ctx.advisors.consult()`；它不接受简报或模型选择。成功时，顾问的文本指导被渲染为工具结果，而提供方和模型元数据保留在结构化结果中。没有所属 `exec.agent` 的调用会明确失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件会观察顾问设置，并且仅在咨询启用时以 `toolName` 注册一个并发安全工具。禁用会从实时注册表移除工具及其提示词区段；重新启用会在无需重启的情况下恢复它们。其输入 schema 是空对象。执行委托给 `ctx.advisors`，随后拼接返回的文本块供模型侧渲染；顾问服务拥有路由解析、请求构造与提供方缓存行为、流式传输、校验和持久调用日志记录。

启用 `promptSection` 后，插件还会在 `TOOL_ADVISOR` 系统提示词顺序位置注册 `ADVISOR_PROMPT_SECTION`。两项注册都属于插件生命周期并随之撤销。这些注册与注入服务让每项可变关系都有现有所有者，因此本包不发布运行时不变式配套包。

### 源码索引

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具定义、结果渲染、咨询委托与提示词注册 |
| [`src/description.ts`](src/description.ts) | 稳定的模型侧工具描述和提示词区段文本 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

阅读以下页面，了解此模型侧消费方使用的能力与注册表。

- [顾问能力](../advisor/README.zh.md)——路由解析、咨询行为、成本与调用记录
- [工具服务](../../core/tools/README.zh.md)——模型侧工具注册与执行
- [系统提示词服务](../../core/system-prompt/README.zh.md)——有序提示词区段组装
- [生成的工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-advisor)——模型收到的 `advisor` 工具定义
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-advisor)——每个受支持的配置字段

-----

<a id="model-experience"></a>
## 模型体验

### 顾问工具定义

#### 模型看到什么

模型会看到生成的 [`advisor` 工具条目](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-advisor)。除该目录条目外，工具没有参数，因为顾问已经会读取完整实时会话；另传简报只会丢失证据。

#### Token 影响

在工具可见的每个请求中，稳定的工具描述和空对象 schema 都会增加固定输入成本。重命名工具会改变名称 token，但不会增加参数。

#### KV Cache 影响

工具名称、定义和可见性不变时前缀保持稳定。插件生命周期变化、`toolName` 变化或作用域工具过滤可能使从该定义起的复用失效。

### 顾问系统提示词区段

#### 模型看到什么

启用 `promptSection` 后，调用模型会收到下面的精确系统提示词文本。

##### 顾问使用指引

```markdown
Escalate to the advisor tool when judgment matters more than speed: before committing to an
approach, when a failure keeps recurring, or before declaring work complete. The advisor reads
the full conversation and consumes additional tokens, so consult it at decision points rather
than every step.
```

#### Token 影响

启用的区段会向每次组装的系统提示词加入固定文本。设置 `promptSection: false` 会移除此直接 token 成本，但工具仍然可用。

#### KV Cache 影响

启用文本及其提示词位置不变时前缀保持稳定。启用、禁用或随生命周期替换该区段会改变组装后的系统提示词，并可能使从该变化处起的复用失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制来自把咨询配置放在模型侧调用之外的设计。

- **没有逐次问题或路由**——工具不接受参数；它始终把完整实时会话发送给 `dsh-advisor` 选择的路由。
- **必须有所属 agent**——缺少 `exec.agent` 时执行失败，因为没有可供咨询的实时会话。
- **仅渲染文本**——只有顾问文本块会作为工具结果到达调用模型；提供方和模型保留在结构化工具结果中，用量保留在调用事件上，这些元数据都不会被渲染成指导。
- **提示词指引可选且不强制**——禁用提示词区段后工具仍会注册；启用的区段也无法强制模型在建议的决策点进行咨询。

不发布运行时不变式伴随项，因为工具除了受守卫的注册和一次 advisor 服务调用外，没有可独立观察的关系。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
