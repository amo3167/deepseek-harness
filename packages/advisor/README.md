---
description: "The advisor package group: an auxiliary model consultation service and its model-facing consumer for difficult agent decisions."
kind: "package-group"
---

# advisor/ — advisor consultation family

English | [中文](README.zh.md)

## Summary

The `advisor/` group lets an agent obtain a second model's guidance over its live conversation when a decision is difficult. `advisor` owns consultation route resolution, streaming, and durable audit records; `tool-advisor` lets the calling model request that consultation without restating the conversation. The family adds no tools or state to the advisor itself.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The service and its consumer are installed separately so compositions can choose programmatic or model-facing consultations.

| Package | Role |
|---|---|
| [`advisor/`](advisor/README.md) | Resolves and runs a configured advisor-model consultation over the calling agent's conversation |
| [`tool-advisor/`](tool-advisor/README.md) | Exposes the parameter-free `advisor` tool and its system-prompt guidance |

-----

<a id="related-documentation"></a>
## Related documentation

- [LLM streaming subsystem reference](../../docs/subsystems/llm-streaming.md) — the routed streaming service used by advisor consultations.
- [Tool catalog](../../docs/tool-catalog.md#deepseek-aidsh-tool-advisor) — the generated `advisor` schema.
- [Persistence catalog](../../docs/persistence-catalog.md#advisorinvocation--log-only) — the durable consultation audit record.

<a id="dev-note"></a>
## Dev Note

None.
