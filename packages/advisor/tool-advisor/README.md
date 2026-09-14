---
description: "The parameter-free advisor tool and prompt guidance, for users and maintainers enabling model consultations, configuring tool visibility, or debugging how advice reaches the calling model."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-advisor

English | [中文](README.zh.md)

## Summary

`dsh-tool-advisor` lets a model consult the configured advisor at a difficult decision point. The tool accepts no parameters because the advisor reads the calling agent's complete live conversation; callers do not choose or brief a model. Returned guidance becomes the tool result that the calling model reads and can act on. An optional prompt section tells the model when consultation is worth its additional tokens. The tool and prompt section are visible only while the advisor settings enable consultations. Mount it only after `dsh-advisor` has configured the advisor route.

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

Mount this package beside `dsh-advisor` to expose one consultation tool to the model and, by default, add concise escalation guidance to the system prompt while advisor settings are enabled.

### When to choose it

Choose it when the calling model should decide when to request a second opinion using the advisor route that the composition or live settings already selected. Avoid it when consultations must be invoked only by application code, when a caller must select a route per call, or when the extra schema and prompt tokens are not justified.

### Minimal configuration

The advisor service owns model selection; the tool has no provider, model, or reasoning fields. Its optional settings only rename the model-facing tool or suppress the prompt section.

```yaml
- name: '@deepseek-ai/dsh-advisor'
  config:
    provider: deepseek-official
    model: deepseek-flash
- name: '@deepseek-ai/dsh-tool-advisor'
```

| Field | Default | Meaning |
|---|---|---|
| `toolName` | `advisor` | Model-facing name; each loaded instance must use a distinct value |
| `promptSection` | `true` | Whether to add the system-prompt section that explains when to consult |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-advisor) is the exhaustive source for every accepted field.

### What each call does

The model calls the tool with an empty object. The executor passes the calling agent and cancellation signal to `ctx.advisors.consult()`; it does not accept a brief or a model selection. On success, the advisor's text guidance is rendered as the tool result, while provider and model metadata remain in the structured result. A call without an owning `exec.agent` fails visibly.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin observes advisor settings and registers one concurrency-safe tool under `toolName` only while consultations are enabled. Disabling removes the tool and its prompt section from the live registries; re-enabling restores them without restarting. Its input schema is the empty object. Execution delegates to `ctx.advisors`, then concatenates the returned text blocks for model-facing rendering; the advisor service owns route resolution, request construction and provider-cache behavior, streaming, validation, and durable invocation logging.

When `promptSection` is enabled, the plugin also registers `ADVISOR_PROMPT_SECTION` at the `TOOL_ADVISOR` system-prompt order. Both registrations belong to the plugin lifecycle and unwind with it. Those registrations and the injected services keep every mutable relationship under an existing owner, so this package publishes no runtime invariant companion.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool definition, result rendering, consultation delegation, and prompt registration |
| [`src/description.ts`](src/description.ts) | Stable model-facing tool description and prompt-section text |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the capability and registries this model-facing consumer uses.

- [Advisor capability](../advisor/README.md) — route resolution, consultation behavior, cost, and invocation records
- [Tools service](../../core/tools/README.md) — model-facing tool registration and execution
- [System-prompt service](../../core/system-prompt/README.md) — ordered prompt-section assembly
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-advisor) — the `advisor` tool definition the model receives
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-advisor) — every accepted config field

-----

<a id="model-experience"></a>
## Model Experience

### Advisor tool definition

#### What the model sees

The model sees the generated [`advisor` tool entry](../../../docs/tool-catalog.md#deepseek-aidsh-tool-advisor). Beyond that catalog entry, the tool has no parameters because the advisor already reads the complete live conversation; passing a separate brief would discard evidence.

#### Token effect

The stable tool description and empty-object schema add a fixed input cost to every request where the tool is visible. Renaming the tool changes the name tokens but does not add parameters.

#### KV Cache effect

Prefix-stable while the tool name, definition, and visibility are unchanged. Plugin lifecycle changes, a `toolName` change, or scoped tool filtering may invalidate reuse from this definition.

### Advisor system prompt section

#### What the model sees

When `promptSection` is enabled, the calling model receives the exact system-prompt text below.

##### Advisor-use guidance

```markdown
Escalate to the advisor tool when judgment matters more than speed: before committing to an
approach, when a failure keeps recurring, or before declaring work complete. The advisor reads
the full conversation and consumes additional tokens, so consult it at decision points rather
than every step.
```

#### Token effect

The enabled section adds its fixed text to each assembled system prompt. Setting `promptSection: false` removes this direct token cost but leaves the tool available.

#### KV Cache effect

Prefix-stable while the enabled text and its prompt position are unchanged. Enabling, disabling, or lifecycle-replacing the section changes the assembled system prompt and may invalidate reuse from that change.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits follow from keeping consultation configuration outside the model-facing call.

- **No per-call question or route** — the tool accepts no parameters; it always sends the complete live conversation to the route selected by `dsh-advisor`.
- **An owning agent is mandatory** — execution without `exec.agent` fails because there is no live session to consult over.
- **Text-only rendering** — only advisor text blocks reach the calling model as the tool result; provider and model stay in the structured tool result, usage stays on the invocation event, and none of that metadata is rendered as guidance.
- **Prompt guidance is optional, not enforcement** — disabling the prompt section leaves the tool registered, and an enabled section cannot force the model to consult at the recommended decision points.

No runtime invariant companion is published because the tool has no independently observable relationship beyond its guarded registration and one advisor-service call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
