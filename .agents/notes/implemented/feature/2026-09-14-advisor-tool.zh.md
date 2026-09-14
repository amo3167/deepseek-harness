# Agent Note: 辅助顾问咨询

Status: implemented

[English](2026-09-14-advisor-tool.md) | 中文

## 问题

调用 Agent 需要在决策点获得可选的第二意见，但不应把审阅变成独立委派工作，也不应让模型选择部署方拥有的 provider 路由。

## 决策

`dsh-base` 将 `dsh-advisor` 与 `agent-default-model` 相同的 `deepseek-official` / `deepseek-flash` 路由一同组合，再组合 `dsh-tool-advisor`。仅当实时顾问设置启用咨询时，模型才会获得无参数的 `advisor` 工具及其可选提示段；禁用会移除两项注册，重新启用会在无需重启的情况下恢复它们。该工具把调用 Agent 与取消信号传给 `ctx.advisors`；服务发起一次辅助 `ctx.llm` 调用，并记录一条仅日志的 `advisor/invocation` 结果。

这里使用辅助调用模式而非 subagent seam，因为咨询是在调用 Session 上的一次审阅请求，而非独立工作；它不需要子 Agent、收件箱、轮次生命周期或 Session；它必须通过调用轮次的普通工具结果路径返回；现有 LLM 路由、设置、预检、取消与 provider adapter 已拥有所需执行行为。子 Agent 会增加子生命周期和能力表面，却没有当前消费者需求。

路由选择保持在模型工具之外。provider 和 model 是部署和用户设置的选择，不是模型在每次工具调用时的选择；因此工具不携带这些字段，也不能绕过已配置路由及其预检。

`withAdvisorInstruction()` 在 `messages` 内携带父系统提示，并将顾问指令附加到有效系统消息：普通历史使用 `messages[0]`，in-history 路由使用最新的系统消息。因此顾问请求不是父请求的纯前缀。在相同 provider 路由上，只有未改变的初始系统文本 token 可以复用；已改变的系统消息和后续对话后缀不能复用父请求前缀。重复的顾问请求可以复用自身由 provider 管理的前缀，跨厂商顾问不能复用父 provider 的缓存。完整对话输入与输出 token 上限的额外成本是独立审阅的刻意取舍。

能力排序被延后，因为当前消费者没有为通用模型排序提供证据。后续配置声明的层级可以表达明确的部署策略，而不让工具选择路由。

`advisor/invocation` 记录路由、token 上限、结果、指导内容或安全失败细节及已观察到的 usage，用于审计和计费，包括在错误、取消、截断或空指导前已收到的 usage。它并非 model-visible-equals-logged 不变量所必需：咨询结果经由调用工具的 `tool/result` 对模型可见，而 invocation 记录仅写入日志。

## Alternatives considered

**使用 subagent seam。** 子 Agent 会为一次辅助审阅请求增加 Session、工具、生命周期和委派语义，而指导必须回到调用工具执行。

**将 provider 和 model 暴露为工具参数。** 这会让模型选择部署路由，并绕过设置拥有的策略和预检。

**自动排序可用模型能力。** 当前没有可移植排序的证据；声明式层级是未来明确的配置选择。

## Testing

聚焦的顾问和 bundle 测试覆盖路由预检、adapter 失败、第一段流式输出后的取消、空输出、持久化失败结果和 usage、有效 in-history 系统位置、作用域提示可见性、实时启用状态移除和恢复工具及提示词区段、bundle 行和依赖声明。`llm-mock-server` 不提供客户端在第一段流式输出后取消的场景，因此该取消路径使用 `MidStreamAbortAdapter`。DeepSeek adapter 路径使用 `llm-mock-server` 证明 advisor 历史中最后一条 assistant 工具调用会序列化为 OpenAI 兼容的 assistant `tool_calls` 消息及空内容；这只是 DeepSeek adapter 路径的证据，并非 provider-neutral readiness 声明。已发布 headless 子进程 smoke 使用无密钥 adapter 启动真实 Loader profile，执行 `advisor` 工具调用，记录 `advisor/invocation`，并将指导返回给调用 Agent。

Task 3 的内存组合检查不满足产品可见插件的包策略；本次变更添加真实 Loader/app-process 覆盖。Task 5 记录了两个与顾问代码无关但仍存在的 Windows symlink gate 阻碍：`verify-node-next-types` 在 TypeScript 前因 `symlinkSync` 报告 `EPERM: operation not permitted` 而失败；Git mode `120000` 的 `apps/cli/tests/profiles/acp/cordis.yml` 被物化为字面目标 `../../../../../snapshots/acp/escalation-approved/cordis.yml`，使 `verify-cordis-config` 报告 YAML 根不是 entry array。当前 verifier 运行复现了后一诊断。不会修改 checkout symlink 路径以隐藏任一环境失败。

## Deferred

此模型可见变更通常需要的无密钥 recorded-session snapshot 被延后，因为 snapshot harness 需要 scripted-consultation 支持。在 advisor feature 被认为完成前它必须落地；不会以合成 snapshot 代替。

## Consequences

基础 bundle 支持的 profile 会暴露已配置的 advisor 工具，但没有自动升级策略、每次调用路由覆盖、排序表、命令、标志或专用 transcript card。咨询可审计，并对不可用、取消、截断、错误或空输出 fail closed；但每次审阅都要支付辅助请求成本，并且只能复用上述有限的 provider 缓存前缀。
