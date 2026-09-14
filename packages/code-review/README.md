---
description: "The code-review package group: the /dsh-code-review human command, the GitHub webhook code-review rule, and any code-review packages composed beside them."
kind: "package-group"
---

# code-review/ — code-review commands and rules

English | [中文](README.zh.md)

## Summary

`code-review/` owns the code-review entry points a DSH surface exposes. The `/dsh-code-review` command is a thin hand-off that steers a deterministic review request into the agent's nearest step so the reply is the review, with an optional free-form scope the user types. The `webhook-code-review` rule is the unattended counterpart: a GitHub webhook rule that starts the same deterministic review on the working tree of a mapped local checkout. Both share one prompt source of truth. The group is the home for any further code-review entry points DSH ships — and for the review tooling they steer the model to load.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`command-code-review`](command-code-review/README.md) | The `/dsh-code-review` human command: a thin hand-off that steers a deterministic review request into the agent's nearest step. |
| [`webhook-code-review`](webhook-code-review/README.md) | The `code-review-auto` GitHub webhook rule: starts the same deterministic review on the working tree of a mapped local checkout when a matching delivery arrives. |

<a id="related-documentation"></a>
## Related documentation

- [Commands subsystem](../../docs/subsystems/commands.md) — the command registry, the input descriptor, and the slash-command lifecycle this command registers into.
- [Webhook subsystem](../../docs/subsystems/webhook.md) — the delivery runtime the rule registers on, the signed GitHub adapter, and session creation.
- [Create review Sessions from GitHub webhooks](../../docs/user/guide/github-review.md) — the end-to-end wiring guide for the rule: secret, ingress port, and config.
- [`dsh-code-review` skill](../../.agents/skills/dsh-code-review/SKILL.md) — the standing review guidance the model is told to load when the host has registered it.

<a id="dev-note"></a>
## Dev Note

None.
