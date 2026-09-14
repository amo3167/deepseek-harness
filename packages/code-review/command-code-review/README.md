---
description: "The /dsh-code-review human command: a thin hand-off that steers a deterministic code-review request into the agent's nearest step so the next reply is the review."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-code-review

English | [中文](README.zh.md)

## Summary

`dsh-command-code-review` adds a `/dsh-code-review` command to chat UIs with a command runtime. Type it and the agent steers a deterministic code-review request into its nearest step boundary; the reply is the review. The optional free-form scope carries the user's focus to the model. When there is no scope, the model reviews the surrounding context and the most recent change. The plugin has no domain service, projection, event pairing, or session-level state; the hand-off is the whole package.

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

Type `/dsh-code-review` in any chat UI with `dsh-commands` composed to start a focused review. The stable success line confirms the hand-off; the reply is the review.

### When to choose it

Choose this when a human wants to start a code review on demand and the model can be trusted to run the review with the host's own tooling. Skip it for a programmatic review: the command steers one user message and returns nothing but the success line.

### Minimal configuration

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-code-review
  name: '@deepseek-ai/dsh-command-code-review'
```

| Field | Default | Meaning |
|---|---|---|
| `name` | `dsh-code-review` | The slash-command name that users type |
| `input.hint` | `[<scope or focus>]` | The argument hint surfaced in the prompt box |
| `input.attachments` | `false` | No attachment input is accepted |

The command name and the `input.hint` are the only tunables of the command — they are declared in `apply` and visible in the prompt box.

### Using the command

| Input | Result |
|---|---|
| `/dsh-code-review` | Review steered with the default prompt only. |
| `/dsh-code-review the new sandbox policy` | Review steered with `Reviewer scope: the new sandbox policy` appended. |
| `/dsh-code-review src/agents/session.ts` | Review steered with `Reviewer scope: src/agents/session.ts` appended. |

The command returns the stable success line in every case and returns no `sourceEventSeq`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers a single named command on `ctx.commands`. Its handler builds one `UserMessage` from the stable review prompt and the trimmed free-form scope, steers it onto the agent's nearest step boundary, and returns the stable success line. There is no domain service, no projection, no event pairing, and no session state the handler owns; the model's reply is the review, and any `dsh-code-review` skill the host registered is its own concern.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the stable prompt, the `reviewMessage` builder, the handler, and `apply` |
| — | No runtime invariant companion is published; the package exposes no continuously observable in-process relation. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-code-review` skill](../../../.agents/skills/dsh-code-review/SKILL.md) — the standing review guidance the model is told to load when it exists.
- [`dsh-commands`](../../interaction/commands/README.md) — the command registry this plugin registers into.
- [Command plugin templates](../../compaction/README.md) — the sibling plugin for a human command that steers the agent (`/compact`).

-----

<a id="model-experience"></a>
## Model Experience

### Human `/dsh-code-review` request

#### What the model sees

The slash input and the success line never enter a model request. The steered user message carries the stable package-owned prompt; when the user typed a scope, a `Reviewer scope: <scope>` line follows it. The full prompt:

##### Review prompt
```markdown
Perform a focused code review following the DeepSeek-Harness dsh-code-review guidance. Load the `dsh-code-review` skill with the `skill` tool if it is available, then review only what the reviewer pointed at — the current session context, the most recent change, or the specific path or range the user attached — for correctness, lifecycle, security, and required-behavior regressions. Report findings as a short, ordered list of blockers, each with location, impact, and evidence; then a short list of optional suggestions. When no blockers exist, say so in one sentence and stop.
```

#### Token effect

One user message with the stable prompt (or the stable prompt plus the trimmed scope line) is added to the next model request. No further tokens are owned by this package.

#### KV Cache effect

The steered message appends to the agent's history; a later request reuses the prior prompt prefix and the new user message. The package owns no prefix and changes nothing already in the reusable cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the command is a poor fit; they are the current package constraints.

- **Free-form scope, not a schema** — the scope is whatever the user types; the model reads it as guidance. A structured scope grammar (path, commit, branch) is deferred until a consumer asks.
- **No review envelope** — the shape of the review is whatever the model produces; the command imposes no machine-readable envelope. A dedicated finding projection is a later extension.
- **Command adapters only** — surfaces without `ctx.commands` cannot invoke the command and rely on the host's own review tooling.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above, the package code, and the linked Agent Notes.

- **Queued commands, undecided** — the command steers immediately; queuing the review while a turn has right of way is an open direction.
- **No host-side hook** — the command is a thin hand-off; a host-side review runner must be mounted separately when one is wanted.

</details>
