# Agent Note: Auxiliary advisor consultation

Status: implemented

English | [中文](2026-09-14-advisor-tool.zh.md)

## Problem

The calling agent needs an opt-in second opinion at decision points without turning that review into independent delegated work or allowing the model to choose deployment-owned provider routes.

## Decision

`dsh-base` composes `dsh-advisor` with the same `deepseek-official` / `deepseek-flash` route as `agent-default-model`, then composes `dsh-tool-advisor`. The model receives the parameter-free `advisor` tool and its optional prompt section only while live advisor settings enable consultations; disabling removes both registrations and re-enabling restores them without a restart. The tool passes the calling Agent and cancellation signal to `ctx.advisors`; the service makes one auxiliary `ctx.llm` call and records one log-only `advisor/invocation` outcome.

The auxiliary-call pattern is used instead of the subagent seam because a consultation is one review request over the calling Session, not independent work; it needs no child Agent, inbox, turn lifecycle, or Session; it must return through the calling turn's ordinary tool-result path; and the existing LLM route, settings, preflight, cancellation, and provider adapters already own the needed execution behavior. A subagent would add a child lifecycle and capability surface without a consumer need.

Route selection remains outside the model-facing tool. Provider and model are deployment and user-settings choices, not a model choice made per tool call; the tool therefore carries neither field and cannot bypass the configured route or its preflight.

`withAdvisorInstruction()` carries the parent system prompt inside `messages` and appends the advisor instruction to the effective system message: `messages[0]` for ordinary history, or the latest system message for an in-history route. The advisor request is consequently not a pure prefix of the parent request. On the same provider route, only unchanged initial system-text tokens may be reused; the altered system message and later conversation suffix cannot reuse the parent request prefix. Repeated advisor requests may reuse their own provider-managed prefix, and a cross-vendor advisor cannot reuse the parent's provider cache. The additional full-conversation input and output-token cap are the deliberate cost of an independent review.

Capability ranking is deferred because the current consumers provide no evidence for a universal ordering of models. A later configuration-declared tier can express an explicit deployment policy without making the tool choose routes.

`advisor/invocation` records route, token cap, outcome, guidance or safe failure detail, and observed usage for audit and accounting, including usage received before an error, abort, truncation, or empty guidance. It is not required by the model-visible-equals-logged invariant: the consultation result becomes model-visible through the calling tool's `tool/result`, while the invocation record is log-only.

## Alternatives considered

**Use the subagent seam.** A child agent would add a session, tools, lifecycle, and delegation semantics to a single auxiliary review request, while the guidance must return to the calling tool execution.

**Expose provider and model as tool parameters.** This would let the model select a deployment route and bypass settings-owned policy and preflight.

**Rank available model capabilities automatically.** There is no current evidence for a portable ranking; a declared tier is a future explicit configuration choice.

## Testing

Focused advisor and bundle tests cover route preflight, adapter failure, cancellation after the first streamed chunk, empty output, durable failed outcomes and usage, effective in-history system placement, scoped prompt visibility, live enablement removing and restoring the tool and prompt section, bundle rows, and dependency declarations. `llm-mock-server` does not model a client abort after the first streamed chunk, so `MidStreamAbortAdapter` supplies that cancellation path. A DeepSeek-adapter path uses `llm-mock-server` to prove that a final assistant tool call in advisor history serializes as an OpenAI-compatible assistant `tool_calls` message with empty content; this is evidence for the DeepSeek adapter path, not provider-neutral readiness. The shipped-headless subprocess smoke boots the real Loader profile with a keyless adapter, performs an `advisor` tool call, records `advisor/invocation`, and returns the guidance to the calling agent.

Task 3's in-memory composition check did not meet the package policy for product-visible plugins; this change adds the real Loader/app-process coverage. Task 5 recorded two Windows symlink gate blockers that remain unrelated to advisor code: `verify-node-next-types` fails before TypeScript when `symlinkSync` reports `EPERM: operation not permitted`, and Git mode `120000` for `apps/cli/tests/profiles/acp/cordis.yml` is materialized as the literal target `../../../../../snapshots/acp/escalation-approved/cordis.yml`, making `verify-cordis-config` report that its YAML root is not an entry array. The current verifier run reproduced the latter diagnostic. No checkout symlink path is changed to hide either environment failure.

## Deferred

The keyless recorded-session snapshot normally required for this model-visible change is deferred because the snapshot harness needs scripted-consultation support. It must land before the advisor feature is considered complete; no synthetic snapshot is recorded in its place.

## Consequences

The base-backed profiles expose a configured advisor tool without an automatic escalation policy, per-call route override, ranking table, command, flag, or bespoke transcript card. Consultations are auditable and fail closed on unusable, aborted, truncated, erroneous, or empty output, but each review pays for its auxiliary request and may reuse only the limited provider cache prefix described above.
