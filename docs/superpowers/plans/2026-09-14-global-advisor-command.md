# Global Advisor Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Web `/advisor` picker that selects an advisor route or disables the advisor tool persistently.

**Architecture:** The existing `advisor` settings namespace becomes an enabled/disabled live configuration. `AdvisorService` and `tool-advisor` consume that state so explicit disablement removes the model-facing tool instead of falling back to the chat model. A new Web client plugin follows `/model`'s popup-select convention, reads/writes the existing settings Remote, and lists the existing host model catalog with an Off row.

**Tech Stack:** TypeScript, Cordis services/plugins, Schemastery, Typert Remotes, React command UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-advisor-command-design.md`

## Global Constraints

- Advisor selection is global and persisted in the `advisor` user-settings namespace.
- The `enabled` flag is authoritative: disabled removes `advisor` from model-visible tools and prevents route fallback.
- Preserve a disabled user's last provider/model/effort for re-enabling.
- Reuse `settings.describe`/`settings.update` revision handling and `session.modelCatalog`; do not create a parallel persistence or model-discovery API.
- All new Web copy belongs in typed English and Chinese locale dictionaries.

---

### Task 1: Make advisor settings explicitly enabled or disabled

**Files:**
- Modify: `packages/advisor/advisor/src/settings.ts`
- Modify: `packages/advisor/advisor/src/index.ts`
- Modify: `packages/advisor/advisor/tests/consult.spec.ts`
- Create: `packages/advisor/advisor/tests/settings.spec.ts`

**Interfaces:**
- Produces `AdvisorConfigOptions` with `enabled: boolean`, `provider`, `model`, and optional `reasoningEffort`.
- Produces `AdvisorService.isEnabled(): boolean` and a route resolver that returns `undefined` when disabled.
- Consumes the existing `SettingsProvider.installSection()` live source callback.

- [ ] **Step 1: Write failing settings and route tests**

```ts
it('uses the composition advisor route when enabled by default', () => {
  expect(service.isEnabled()).toBe(true)
  expect(service.currentRoute()).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
})

it('does not fall back to the parent model when settings disable advisor', async () => {
  await settings.update('advisor', { enabled: false }, undefined)
  expect(service.isEnabled()).toBe(false)
  expect(service.currentRoute()).toBeUndefined()
})

it('retains the saved route while disabled', async () => {
  await settings.update('advisor', { enabled: false, provider: 'vendor', model: 'reviewer' }, undefined)
  expect(settings.describe().find(entry => entry.ns === 'advisor')?.value).toMatchObject({
    enabled: false, provider: 'vendor', model: 'reviewer',
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail because `enabled`/`isEnabled` do not exist**

Run: `pnpm exec vitest run packages/advisor/advisor/tests/consult.spec.ts packages/advisor/advisor/tests/settings.spec.ts`

Expected: FAIL with missing `enabled` configuration or `service.isEnabled is not a function`.

- [ ] **Step 3: Implement the minimum live settings semantics**

```ts
export interface AdvisorConfigOptions {
  readonly enabled: boolean
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export const ADVISOR_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
})

isEnabled(): boolean { return this.source().enabled }

currentRoute(): AdvisorRoute | undefined {
  const current = this.source()
  if (!current.enabled) return undefined
  // Retain the existing configured-route then agent-default fallback behavior.
}
```

Ensure the composition entry supplied to `installSection()` includes `enabled: true`, and update exported configuration types/catalog fixtures accordingly.

- [ ] **Step 4: Run the focused advisor tests and generated-config verification**

Run: `pnpm exec vitest run packages/advisor/advisor/tests/advisor.spec.ts packages/advisor/advisor/tests/settings.spec.ts && pnpm run gen-config-catalog && pnpm run verify-config-catalog`

Expected: PASS; generated catalog changes only describe the added enabled setting.

- [ ] **Step 5: Commit**

```bash
git add packages/advisor/advisor docs/config-catalog.md docs/config-catalog.zh.md
git commit -m "feat(advisor): persist enabled advisor settings"
```

### Task 2: Remove and restore the advisor tool from the live registry

**Files:**
- Modify: `packages/advisor/tool-advisor/src/index.ts`
- Modify: `packages/advisor/tool-advisor/tests/index.spec.ts`
- Modify: `packages/advisor/tool-advisor/tests/prompt.spec.ts`

**Interfaces:**
- Consumes `ctx.advisors.isEnabled()` and its live settings change notification.
- Produces a registry state where `ctx.tools.get('advisor', scope)` is undefined while disabled and restored when enabled.
- Produces no `tool:advisor` system-prompt section while disabled.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('removes advisor from model-visible tools after global advisor disablement', async () => {
  await settings.update('advisor', { enabled: false }, undefined)
  expect(ctx.tools.get('advisor', scope)).toBeUndefined()
})

it('restores the same parameter-free advisor tool after re-enabling', async () => {
  await settings.update('advisor', { enabled: false }, undefined)
  await settings.update('advisor', { enabled: true }, undefined)
  expect(ctx.tools.get('advisor', scope)?.parameters).toEqual({})
})
```

- [ ] **Step 2: Run and verify the tests fail because registration is static**

Run: `pnpm exec vitest run packages/advisor/tool-advisor/tests/index.spec.ts packages/advisor/tool-advisor/tests/prompt.spec.ts`

Expected: FAIL because the advisor tool remains registered after `enabled: false`.

- [ ] **Step 3: Implement lifecycle-owned registration**

Keep the `defineTool()` schema and execution path unchanged. Extract registration into an effect that observes the advisor settings source, disposes the previous `ctx.tools.register()` handle when disabled, and registers both the tool and prompt contribution only while enabled. Dispose the watcher and any live registration with the plugin scope.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run packages/advisor/tool-advisor/tests/index.spec.ts packages/advisor/tool-advisor/tests/prompt.spec.ts`

Expected: PASS; toggling settings changes the observable tool list without a process restart.

- [ ] **Step 5: Commit**

```bash
git add packages/advisor/tool-advisor
git commit -m "feat(advisor): toggle tool registration from settings"
```

### Task 3: Add the global Web `/advisor` command picker

**Files:**
- Create: `packages/client/ui-advisor-selection/package.json`
- Create: `packages/client/ui-advisor-selection/src/index.ts`
- Create: `packages/client/ui-advisor-selection/src/client/index.ts`
- Create: `packages/client/ui-advisor-selection/src/client/directory.ts`
- Create: `packages/client/ui-advisor-selection/src/client/locales.ts`
- Create: `packages/client/ui-advisor-selection/tests/advisor-command.client.spec.ts`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes `ctx.remote.settings.describe()`, `ctx.remote.settings.update('advisor', patch, revision)`, and `ctx.remote.session.modelCatalog()`.
- Produces a `commandUi.register({ name: 'advisor', ui: { kind: 'popupSelect' } })` contribution.
- Produces option ids `off` and opaque `${provider}/${model}` route ids, resolved only against the freshly loaded directory.

- [ ] **Step 1: Write the failing client behavior test**

```ts
it('lists Off and provider-grouped advisor routes, with the saved route active', async () => {
  const options = await advisorCommand.options(session)
  expect(options[0]).toMatchObject({ id: 'off', active: false })
  expect(options).toContainEqual(expect.objectContaining({
    id: 'deepseek-official/deepseek-flash', active: true,
  }))
})

it('writes enabled false with the descriptor revision when Off is selected', async () => {
  await advisorCommand.onSelect({ id: 'off' }, session)
  expect(settings.update).toHaveBeenCalledWith('advisor', { enabled: false }, 7)
})

it('selects a route with its default reasoning effort', async () => {
  await advisorCommand.onSelect({ id: 'vendor/reviewer' }, session)
  expect(settings.update).toHaveBeenCalledWith('advisor', {
    enabled: true, provider: 'vendor', model: 'reviewer', reasoningEffort: 'high',
  }, 7)
})
```

- [ ] **Step 2: Run and verify it fails because no advisor client plugin is mounted**

Run: `pnpm exec vitest run packages/client/ui-advisor-selection/tests/advisor-command.client.spec.ts`

Expected: FAIL with the advisor command contribution absent.

- [ ] **Step 3: Implement the directory and command contribution**

Create a global directory that reads the `advisor` descriptor from `settings.describe()` and the host-generation catalog from `session.modelCatalog()`. Convert its models into command UI options, prepend the localized Off row, and only parse selected route ids by matching them to the loaded catalog. On selection call `settings.update` with the descriptor revision; surface load/conflict errors through the existing popup retry behavior. Register English and Chinese typed dictionary entries for command label, description, Off label, and unavailable-model text.

Mount `@deepseek-ai/dsh-client-ui-advisor-selection` in the Web bundle beside `ui-model-selection`, and include the new workspace package in the lockfile.

- [ ] **Step 4: Run the client test plus command UI regression tests**

Run: `pnpm exec vitest run packages/client/ui-advisor-selection/tests/advisor-command.client.spec.ts packages/client/ui-commands/tests`

Expected: PASS; `/advisor` is discoverable, Off persists a disablement, and a selected route persists the active provider/model.

- [ ] **Step 5: Commit**

```bash
git add packages/client/ui-advisor-selection packages/bundle/web-app/cordis.patch.yml pnpm-lock.yaml
git commit -m "feat(web): add global advisor command"
```

### Task 4: Document, generate, and verify the complete user experience

**Files:**
- Modify: `packages/advisor/advisor/README.md`
- Modify: `packages/advisor/advisor/README.zh.md`
- Modify: `packages/advisor/tool-advisor/README.md`
- Modify: `packages/advisor/tool-advisor/README.zh.md`
- Modify: `docs/tool-catalog.md`
- Modify: `docs/tool-catalog.zh.md`
- Modify: generated capability/config artifacts affected by the new package and schema

**Interfaces:**
- Documents `/advisor` as the global model picker and Off as tool removal.
- Keeps the generated catalogs aligned with the mounted package and enabled setting.

- [ ] **Step 1: Write a failing documentation/behavior assertion where the project has a generated-artifact test**

Add a focused test that boots the Web composition, reads the command directory, and asserts it contains `advisor`; pair it with a host integration assertion that disabling settings removes `advisor` from a newly assembled model request.

- [ ] **Step 2: Run it and verify the pre-documentation implementation behavior is covered**

Run: `pnpm exec vitest run apps/web/tests/agent-preset-selection.e2e.ts packages/advisor/tool-advisor/tests/index.spec.ts`

Expected: PASS after Tasks 1–3; this proves the user-facing command and tool visibility rather than grepping prose.

- [ ] **Step 3: Update the package references and generate derived artifacts**

Explain that `/advisor` is global, shows Off, persists its selection, and affects future calls rather than an in-flight consultation. Run each repository generator instead of hand-editing its output.

```bash
pnpm run gen-config-catalog
pnpm run gen-tool-catalog
pnpm run gen-module-graph
pnpm run gen-cordis-catalog
```

- [ ] **Step 4: Run scoped verification**

Run: `pnpm run verify-config-catalog && pnpm run verify-tool-catalog && pnpm run verify-module-graph && pnpm run verify-cordis-catalog && pnpm run verify-client-ui-i18n`

Expected: PASS with no stale generated artifact or untranslated client copy.

- [ ] **Step 5: Commit**

```bash
git add packages/advisor docs packages/client packages/bundle pnpm-lock.yaml
git commit -m "docs: describe global advisor controls"
```

### Task 5: Run release-level checks and hand off

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Verifies the global command, live tool gating, and standard quality gates as one integrated feature.

- [ ] **Step 1: Run the focused advisor and Web suites**

Run: `pnpm exec vitest run packages/advisor apps/web/tests`

Expected: PASS; advisor can be toggled live and the Web command remains available.

- [ ] **Step 2: Run static quality gates**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`

Expected: PASS on a Linux or GitHub-hosted runner. Record any Windows symlink-only failures separately rather than attributing them to the advisor change.

- [ ] **Step 3: Commit any generated verification updates, push, and verify the PR gate**

```bash
git status --short
git push origin HEAD
gh pr checks --repo amo3167/deepseek-harness
```

Expected: a clean worktree and the protected `all checks passed` status reported by Fork quality gates.
