---
description: "Advisor consultations over the live agent conversation, for users and maintainers choosing a review model, configuring its route, or debugging consultation cost and audit records."
kind: "package-reference"
---

# @deepseek-ai/dsh-advisor

English | [中文](README.zh.md)

## Summary

`dsh-advisor` lets an agent ask a configured second model for guidance at a difficult decision point without creating another agent. Each consultation gives that model the live conversation plus a review instruction, returns its non-blank text guidance, and records the outcome in the calling session. Choose any route registered with `ctx.llm`, including a provider from `dsh-llm-pi-ai`; a different provider receives the same conversation but cannot reuse the parent's provider cache. Consultations are stateless and replay the full conversation every time.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package in a composition that already provides `ctx.llm`, select the advisor route, and let a consumer call `ctx.advisors.consult()` with the live calling agent and its cancellation signal.

### When to choose it

Choose it when an agent needs independent review from a separately configured model while preserving the complete conversation as evidence. Avoid it for routine steps or when replaying the conversation on every consultation is too expensive; the service keeps no state between calls and the advisor cannot inspect anything outside the derived messages.

### Minimal configuration

The composition route is required. Live values from the `advisor` settings section take precedence over this entry; when those live values do not name a route, the optional `agentDefaultModel` selection is the final fallback. Any provider and model that resolve through `ctx.llm` are valid, so the advisor can use a cross-vendor route registered by [`dsh-llm-pi-ai`](../../llm/llm-pi-ai/README.md).

```yaml
- name: '@deepseek-ai/dsh-advisor'
  config:
    provider: deepseek-official
    model: deepseek-flash
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | required | Registered `ctx.llm` provider route for consultations |
| `model` | required | Provider-owned exact model id |
| `reasoningEffort` | model default | Adapter-owned reasoning effort used when the resolved route retains this setting |
| `maxTokens` | `8192` | Output-token cap for one consultation |
| `instruction` | `DEFAULT_ADVISOR_INSTRUCTION` | Text appended inside the leading system message |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-advisor) is the exhaustive source for every accepted field.

### Consultation contract

Call `ctx.advisors.consult({ agent, signal })` with the agent whose session supplies the conversation. The promise resolves to non-blank text content blocks, the exact provider/model route, and adapter-reported usage when available. Cancellation governs route preflight and streaming. A missing route, an unresolved route, an abnormal finish, token-cap truncation, or an empty text result rejects the call rather than returning partial guidance.

Every completed or failed dispatch appends one log-only `advisor/invocation` session event with the route, token cap, outcome, and either guidance and optional usage or a safe error message. The event makes the private consultation auditable without adding its request or response to the conversation history.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service resolves one route before each call. The live settings layer overrides the composition entry; an incomplete live route delegates to the optional `agentDefaultModel` selection. Reasoning effort follows the resolved settings or composition route only when that same route supplied it.

`buildAdvisorPrefix()` derives a fresh message-array snapshot from the calling session. `withAdvisorInstruction()` preserves the leading system text, appends two newlines and the advisor instruction inside that message, and leaves the remaining message objects in their original order. The unchanged initial system-text tokens can remain a request prefix, but the inserted instruction precedes the conversation and prevents the later message suffix from reusing the parent's prefix cache.

The service streams directly through `ctx.llm` with purpose `advisor`, assembles the response, and keeps only non-blank text blocks. It creates no Agent, tools, or cross-call state. Its lifecycle-owned service registration is the only mutable relationship, so the package publishes no separate runtime invariant companion; the `advisor/invocation` record remains observable in the session log.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service entry, route resolution, streaming, response validation, and invocation logging |
| [`src/advisor-prefix.ts`](src/advisor-prefix.ts) | Derived-message reconstruction for one consultation |
| [`src/instruction-slot.ts`](src/instruction-slot.ts) | Placement of the advisor instruction in the leading system message |
| [`src/route.ts`](src/route.ts) | Missing-route rejection and live-adapter preflight |
| [`src/settings.ts`](src/settings.ts) | `advisor` settings namespace and route preferences |
| [`src/types.ts`](src/types.ts) | Consultation request, route, and guidance types |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the services and consumer around an advisor consultation.

- [Advisor tool](../tool-advisor/README.md) — the parameter-free model-facing consumer of `ctx.advisors`
- [LLM service](../../llm/llm/README.md) — provider registration and routed streaming
- [pi-ai adapter](../../llm/llm-pi-ai/README.md) — cross-vendor provider routes available to `ctx.llm`
- [Settings service](../../settings/settings/README.md) — live namespace values layered over composition defaults
- [Agent default model](../../core/agent-default-model/README.md) — the optional final route fallback
- [Generated persistence catalog](../../../docs/persistence-catalog.md#advisorinvocation--log-only) — the durable invocation record

-----

<a id="model-experience"></a>
## Model Experience

### Advisor request

#### What the model sees

The advisor model receives the conversation's derived messages verbatim, with the advisor instruction appended inside the leading system message. The default instruction is the exact text below.

##### Default advisor instruction

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

#### Token effect

Each consultation sends one full conversation replay plus the advisor instruction and generated guidance. The service keeps no reusable consultation state; billable input can still be lower when the selected provider reuses a prefix from a prior advisor request.

#### KV Cache effect

Inserting the advisor instruction changes the leading system message. When the advisor route matches the parent route, only unchanged initial system-text tokens may reuse the parent-route prefix cache; no later conversation suffix can reuse it because the instruction appears first. Repeated advisor calls on the same route may reuse their own prior advisor-request prefix when the provider supports and retains that cache. A cross-vendor advisor cannot reuse the parent route's cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when a consultation cannot provide cheap or independently verified guidance.

- **Transcript-only review** — the advisor receives derived conversation messages but no tools or separate file access, so it can recommend checks but cannot perform them.
- **One configured route per consultation** — callers cannot choose a model in `consult()`; live advisor settings, the composition entry, and the optional default-model fallback own route selection.
- **Full conversation in every request** — the service keeps no state between consultations; a provider may reuse a prior advisor-request prefix on the same route, but a cross-vendor route cannot reuse the parent's route cache.
- **Text guidance only** — non-text output does not become guidance; an empty text result and token-cap truncation fail the consultation instead of returning a partial answer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
