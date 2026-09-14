---
description: "Global advisor selection in the Web GUI, for users choosing advisor models and maintainers of the command plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-advisor-selection

English | [中文](README.zh.md)

## Summary

The `/advisor` popup selects the advisor model for all conversations or disables advisor consultations with Off. Models appear together by provider, and the saved global choice is marked active. The Web bundle mounts this plugin beside the model selector.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Enter `/advisor` in the Web GUI to open the picker. Off disables consultations while retaining the saved route; choosing a model enables consultations and selects that model's default reasoning effort. This setting applies globally. The plugin has no configuration fields of its own.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin reads the `advisor` descriptor through `settings.describe()` and models through `session.modelCatalog()`. Selecting Off updates only `enabled: false`, retaining the saved route. Selecting a model enables the advisor and writes its provider, model, and default reasoning effort. When a model advertises no default effort, a settings path mutation unsets the previous user effort. Each write uses a freshly read descriptor revision; load failures and write conflicts remain visible in the command popup and can be retried.

No invariant companion is published: this stateless plugin derives each choice from Host responses and owns only disposable command and dictionary registrations. The command popup owns transient interaction state.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Command popup](../ui-commands/README.md) — shared selection and retry behavior.
- [Advisor service](../../advisor/advisor/README.md) — consultation routing and enablement.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — browser plugin composition.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the global [advisor service](../../advisor/advisor/README.md) configuration, which determines whether later consultations run and which route they use. The picker contributes no prompt text, model request, or Session event and consumes no model tokens.

#### KV Cache effect

The picker changes no KV-cache content directly; the advisor service and its selected provider own cache behavior for subsequent consultations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The picker follows the advertised catalog and layered settings:

- Only models in successfully loaded catalog groups are selectable; arbitrary route or effort entry is unavailable.
- The picker reloads when opened and before a selection, so provider changes while it is open can reject a stale row. An unavailable saved route has no active model row.
- Unsetting a user effort restores any composition-level effort inherited by the settings service.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
