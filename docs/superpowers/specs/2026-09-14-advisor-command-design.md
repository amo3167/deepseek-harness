# Global Advisor Command Design

## Goal

Give Web users a global `/advisor` control for choosing the model used by the
model-facing `advisor` consultation tool, or explicitly disabling advisor
consultations. The choice persists in the user settings document and affects
future tool availability in every session.

## Decisions

- Scope is global, not per-session.
- `/advisor` is a Web command picker, following the established `/model`
  command pattern.
- The picker lists routes from the live LLM provider/model catalog and has an
  explicit **Off** option.
- `advisor.enabled` is authoritative. When false, the service must not fall
  back to the parent session's model and the `advisor` tool must be absent from
  the model-visible tool registry.
- Selecting a route sets `enabled: true`, provider, model, and the model's
  default reasoning effort when one exists. Selecting Off sets `enabled:
  false` while retaining the last route for a convenient later re-enable.

## Architecture

The advisor settings schema becomes a discriminated configuration that carries
`enabled`, `provider`, `model`, and optional `reasoningEffort`. Composition
continues to supply the initial route, while the `advisor` user-settings
section supplies live global overrides. The service exposes a detached current
configuration/route view. It returns no route when disabled; only an enabled
but incomplete configuration can use the existing agent-default-model fallback.

`tool-advisor` observes the live advisor configuration and registers its tool
and prompt section only while enabled. An in-flight consultation keeps its
already resolved route; a setting change applies to the next invocation.

The Web profile mounts an advisor command UI plugin. It reads the current
advisor settings through the existing settings controller and discovers
selectable provider/model routes through the existing LLM catalog remote. Its
popup shows Off plus provider-grouped model rows, marks the current route
active, and writes settings using the descriptor revision so stale selections
are rejected and reloaded. The command is global, so it is available from any
top-level session and does not add a composer seat.

## Failure handling

- A provider-catalog failure renders non-selectable error rows and never
  overwrites the saved advisor setting.
- A stale settings revision reports the normal settings conflict and reloads
  before the next selection.
- An enabled route that becomes unavailable leaves the selection visible but
  causes the existing advisor route preflight error only when the model calls
  the tool.
- Disabled means the model cannot call `advisor`; it is not a failed
  consultation and does not append an invocation record.

## Tests

- Advisor settings resolve composition defaults, persist a selected route, and
  retain the last route across an Off/On transition.
- Disabled advisor removes the tool and its system-prompt guidance; enabling
  it restores both without restarting DSH.
- The service does not fall back to the parent model while disabled.
- The command picker presents Off, provider-grouped models, active selection,
  unavailable-provider rows, and writes the expected revision.
- Locales, bundle composition, generated catalogs, and focused host/client
  tests remain current.
