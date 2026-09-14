---
description: "The dsh-webhook-code-review rule: a GitHub webhook rule that starts an automatic code-review Session on the working tree of a mapped local checkout."
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-code-review

English | [中文](README.zh.md)

## Summary

`dsh-webhook-code-review` registers one webhook rule on the shared `dsh-webhook` runtime. When a signed GitHub delivery matches the configured source, event, and action allowlists, the rule asks the runtime to create one new Session in the mapped local checkout (a Web Workspace) whose prompt is the shared `dsh-code-review` prompt plus a fixed working-tree instruction. The review is the reply of that Session; the package owns no review service, projection, or session state beyond the rule registration.

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

Mount it after `dsh-webhook` and a `dsh-webhook-github` adapter bound to the source name the rule expects. The shipped example in [Create review Sessions from GitHub webhooks](../../../docs/user/guide/github-review.md) is the complete wiring: rule plus ingress group on a second loopback WebServer.

### When to choose it

Choose this when a repository event should start a hands-off code review of a local checkout and no human is present to type `/dsh-code-review`. Skip it when the review target is the delivered pull request's remote content — this rule reviews the **working tree** of the mapped checkout, so the checkout must hold the change set under review.

### Minimal configuration

```yaml
- id: webhook-runtime
  name: '@deepseek-ai/dsh-webhook'
- id: code-review-auto
  name: '@deepseek-ai/dsh-webhook-code-review'
  config:
    source: primary-github
    workspaces:
      owner/repo: /absolute/path/to/checkout
    agentPreset: standard
    permissionPreset: read-only
```

| Field | Default | Meaning |
|---|---|---|
| `source` | any | Adapter source name; when set, only deliveries from that source trigger |
| `events` | `pull_request`, `push` | GitHub event names that trigger a review |
| `pullRequestActions` | `opened`, `synchronize`, `reopened` | `pull_request` actions that trigger a review |
| `workspaces` | empty | Repository `owner/name` to absolute checkout path |
| `workspacePath` | none | Fallback checkout path when the repository is unmapped |
| `agentPreset` | — (required) | Agent composition mounted on the review Session |
| `permissionPreset` | — (required) | Sandbox and approval preset admitted for the review Session |
| `model` | none | Optional provider and model route for the review Session |

Deliveries whose repository maps to no path (and no fallback is set) are accepted silently: no Session, no error. `agentPreset`, `permissionPreset`, and at least one workspace source are validated up front — an invalid mount fails fast instead of swallowing deliveries.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` validates the config and registers one rule on `ctx.webhookRuntime` under the stable rule id `code-review-auto`. The rule's `run` callback is a pure function of the verified delivery: it checks the source, event name, and `pull_request` action against the configured allowlists, resolves the repository to an absolute workspace path (`workspaces` entry first, then `workspacePath`), and returns a `WebhookSessionRequest` — a deterministic title naming the repository and event, the shared review prompt plus the working-tree surface instruction, and the configured presets and optional model route. The runtime (`dsh-webhook`) owns everything after that: Workspace canonicalization and creation (first delivery creates, later deliveries reuse), the `read-only`-class permission preset, the Session publish, and the Agent turn that performs the review.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the stable surface prompt, the `matches` / `resolveWorkspace` / `buildPrompt` / `reviewTitle` / `buildReviewRequest` helpers, and `apply` with the rule registration |
| — | No runtime invariant companion is published; the package exposes no continuously observable in-process relation. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-webhook`](../../webhook/webhook/README.md) — the webhook runtime this rule mounts on, including rule, delivery, and session-creation semantics.
- [`dsh-webhook-github`](../../webhook/webhook-github/README.md) — the signed GitHub adapter that produces the deliveries this rule matches.
- [`dsh-command-code-review`](../command-code-review/README.md) — the interactive `/dsh-code-review` command; this package reuses its `DEFAULT_REVIEW_PROMPT` as the single source of truth for the automatic path.
- [Create review Sessions from GitHub webhooks](../../../docs/user/guide/github-review.md) — the end-to-end wiring guide: secret, ingress port, rule config, and delivery semantics.

-----

<a id="model-experience"></a>
## Model Experience

### Automatic review Session

#### What the model sees

The rule's HTTP response (`202`) is not a model request. What reaches a model is one new Session in the mapped Workspace whose first user message is the deterministic prompt below — the shared `dsh-code-review` prompt followed by the fixed working-tree surface instruction, joined by a single blank line. The message carries a `webhook` source badge whose summary is `github webhook handled by code-review-auto`; the model sees only the prompt text, not the GitHub payload, and the delivery's PR fields are routing metadata only. The full prompt:

##### Automatic review prompt
```markdown
Perform a focused code review following the DeepSeek-Harness dsh-code-review guidance. Load the `dsh-code-review` skill with the `skill` tool if it is available, then review only what the reviewer pointed at — the current session context, the most recent change, or the specific path or range the user attached — for correctness, lifecycle, security, and required-behavior regressions. Report findings as a short, ordered list of blockers, each with location, impact, and evidence; then a short list of optional suggestions. When no blockers exist, say so in one sentence and stop.

Reviewer surface: the working tree of this workspace. Establish the change set with `git status --short`, `git diff --staged`, and `git diff HEAD`, then review exactly that change set.
```

#### Token effect

One fresh Session with one user message: the shared prompt plus the surface instruction. Each automatic review costs one new Session history; the prompt is stable byte-for-byte, so hosts that cache by prefix can reuse any shared prefix their runtime holds.

#### KV Cache effect

Each automatic review is a new Session with its own cache; the package owns no reusable prefix and changes nothing already in an existing Session's cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the rule is a poor fit; they are the current package constraints.

- **Working tree only** — the review target is the checkout's working tree, not the delivered PR's remote diff. Reviewing the remote PR body and diff is a separate rule or prompt surface.
- **No policy hooks** — matching is allowlists and a repository map; a policy-service gate requires a custom rule mounted beside this one.
- **GitHub single-provider** — the rule kind is `github`; other providers need their own rule against the same runtime.
- **One review per delivery** — repeated delivery creates repeated Sessions, exactly like the interactive command repeated.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above, the package code, and the linked Agent Notes.

- **Prompt ownership** — the review prompt body is owned by `dsh-command-code-review` (`DEFAULT_REVIEW_PROMPT`); this package appends only the working-tree surface instruction. Keep both verbatim in this README's Model Experience section.
- **Rule id contract** — `code-review-auto` appears in the Session source badge summary (`github webhook handled by <rule id>`); rename it in lockstep with consumers that key on it.
- **Null path is the contract** — `buildReviewRequest` returning `null` (unmatched, or unmatched workspace) is the silent no-op path; the runtime treats it as "no action", not an error.

</details>
