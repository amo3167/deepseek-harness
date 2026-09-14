---
description: "The code-review package group: the /dsh-code-review human command, the GitHub webhook code-review rule, and any code-review packages composed beside them."
kind: "package-group"
---

# code-review/ — 代码评审命令与规则

[English](README.md) | 中文

## 概述

`code-review/` 拥有 DSH 界面暴露的代码评审入口。`/dsh-code-review` 命令是一次薄片投递,把一条确定性的评审请求送到 agent 最近的步进边界,回复即为评审,并携带一条用户输入的自由格式作用域。`webhook-code-review` 规则是无人值守的对应物:一条 GitHub webhook 规则,在匹配交付到达时对映射本地 checkout 的工作树启动同一确定性评审。两者共享同一提示词事实来源。本组是 DSH 未来代码评审入口的归宿 —— 也是它们引导模型加载的评审工具的归宿。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 |
|---|---|
| [`command-code-review`](command-code-review/README.zh.md) | `/dsh-code-review` 人类命令:一次薄片投递,把一条确定性的评审请求送到 agent 最近的步进边界。 |
| [`webhook-code-review`](webhook-code-review/README.zh.md) | `code-review-auto` GitHub webhook 规则:匹配交付到达时,对映射本地 checkout 的工作树启动同一确定性评审。 |

<a id="related-documentation"></a>
## 相关文档

- [命令子系统](../../docs/subsystems/commands.zh.md) —— 命令注册表、输入描述符、以及本命令注册的斜杠命令生命周期。
- [Webhook 子系统](../../docs/subsystems/webhook.zh.md) —— 规则注册其上的交付 runtime、签名 GitHub 适配器与 Session 创建。
- [通过 GitHub Webhook 创建评审会话](../../docs/user/guide/github-review.zh.md) — 该规则的端到端接线指南:密钥、接入端口与配置。
- [`dsh-code-review` 技能](../../.agents/skills/dsh-code-review/SKILL.md) —— 宿主存在时模型被鼓励加载的固定审查指导。

<a id="dev-note"></a>
## 开发备注

无。
