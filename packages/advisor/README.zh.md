---
description: "advisor 包组：为 agent 的困难决策提供辅助模型咨询服务和其面向模型的消费方。"
kind: "package-group"
---

# advisor/ — advisor 咨询家族

[English](README.md) | 中文

## 概述

`advisor/` 组让 agent 在决策困难时从实时对话中获取第二个模型的指导。`advisor` 拥有咨询路由解析、流式调用和持久审计记录；`tool-advisor` 让调用模型请求该咨询而无需重新表述对话。该家族不会向 advisor 本身添加工具或状态。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

服务和其消费方分别安装，使组合可以选择程序化或面向模型的咨询。

| 包 | 职责 |
|---|---|
| [`advisor/`](advisor/README.zh.md) | 根据调用 agent 的对话解析并执行已配置的 advisor 模型咨询 |
| [`tool-advisor/`](tool-advisor/README.zh.md) | 提供无参数的 `advisor` 工具和其系统提示词指导 |

-----

<a id="related-documentation"></a>
## 相关文档

- [LLM 流式子系统参考](../../docs/subsystems/llm-streaming.zh.md) — advisor 咨询使用的路由流式服务。
- [工具目录](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-advisor) — 生成的 `advisor` schema。
- [持久化目录](../../docs/persistence-catalog.zh.md#advisorinvocation--log-only) — 持久化的咨询审计记录。

<a id="dev-note"></a>
## 开发备注

无。
