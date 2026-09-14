---
description: "Web 界面的全局顾问选择功能，面向选择顾问模型的用户和命令插件维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-advisor-selection

[English](README.md) | 中文

## 概述

`/advisor` 弹窗为所有会话选择顾问模型，或通过“关闭”禁用顾问咨询。模型按提供方排列，并标记已保存的全局选择。Web 包将此插件与模型选择器一起挂载。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

在 Web 界面输入 `/advisor` 即可打开选择器。“关闭”会禁用咨询并保留已保存的路由；选择模型会启用咨询，并采用该模型默认的推理强度。此设置全局生效。插件本身没有配置字段。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件通过 `settings.describe()` 读取 `advisor` 描述符，通过 `session.modelCatalog()` 读取模型。选择“关闭”只更新 `enabled: false`，保留已保存的路由。选择模型会启用顾问，并写入提供方、模型及默认推理强度。模型未声明默认推理强度时，设置路径变更会移除先前的用户推理强度。每次写入都使用刚读取的描述符修订号；加载失败和写入冲突会显示在命令弹窗中，并允许重试。

此包不发布不变量伴随模块：无状态插件从 Host 响应派生每次选择，只拥有可释放的命令和字典注册。命令弹窗负责临时交互状态。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [命令弹窗](../ui-commands/README.zh.md)——共享选择和重试行为。
- [顾问服务](../../advisor/advisor/README.zh.md)——咨询路由和启用状态。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件组合。

<a id="model-experience"></a>
## 模型体验

通过全局[顾问服务](../../advisor/advisor/README.zh.md)配置间接影响模型，决定后续咨询是否运行以及使用哪个路由。选择器不添加提示词、模型请求或 Session 事件，也不消耗模型令牌。

#### KV 缓存影响

选择器不直接改变 KV 缓存内容；顾问服务及其选定的提供方负责后续咨询的缓存行为。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

选择器遵循已公布的目录和分层设置：

- 只能选择成功加载的目录组中的模型；不支持任意输入路由或推理强度。
- 选择器在打开时及提交选择前重新加载，因此提供方在弹窗打开期间发生变化时，过期选项可能被拒绝。已保存的路由不可用时，不会标记任何模型行为活动状态。
- 移除用户推理强度会恢复设置服务继承的组合层推理强度。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
