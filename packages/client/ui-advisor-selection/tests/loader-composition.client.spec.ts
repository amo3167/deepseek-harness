/** Loader-composed command discovery and selection through the production input and popup services. */
import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { expect, it, onTestFinished, vi } from 'vitest'
import { createScope, scopeOf } from '@deepseek-ai/dsh-api-session-controller/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { InputTriggerService } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { CommandUiRuntime } from '@deepseek-ai/dsh-client-ui-commands/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import * as advisor from '../src/client/index.ts'
import * as advisorHost from '../src/index.ts'

it('boots /advisor from a Loader composition and persists Off and model choices from the popup', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const id = 'loader-conversation' as SessionId
  const scope = createScope(ctx, id)
  let value = { enabled: true, provider: 'vendor', model: 'reviewer', reasoningEffort: 'high' }
  let revision = 7
  const descriptor = () => ({ ns: 'advisor', schema: {}, applies: 'live', secrets: [], revision, value })
  const update = vi.fn(async (_ns: string, patch: Partial<typeof value>, expected: number) => {
    expect(expected).toBe(revision)
    value = { ...value, ...patch }
    revision += 1
    return { ok: true, value: descriptor() }
  })
  const modules = new Map<string, unknown>([
    ['test:browser-inputs', { apply(root: Context) {
      const locale = new LocaleRuntime(root)
      locale.setLocale('en')
      root.provide('locale', locale)
      // Fixed session input; lifecycle and command execution use real Cordis scopes.
      root.provide('sessions', { scopeOf, scope: () => scope.ctx, subagentAddress: () => undefined })
      new TestRemote(root, {
        settings: {
          describe: async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [descriptor()] } }), update,
        },
        commands: { list: async () => ({ ok: true, value: [] }) },
        session: { modelCatalog: async () => ({ ok: true, value: {
          default: { provider: 'main', model: 'main' }, routableProviders: ['vendor'], failures: [],
          groups: [{ id: 'vendor', name: 'Vendor', models: [{ id: 'reviewer', name: 'Reviewer', reasoning: { defaultEffort: 'high', efforts: [{ id: 'high', name: 'High' }] } }] }],
        } }) },
      })
    } }],
    ['@deepseek-ai/dsh-client-ui-input-trigger', InputTriggerService],
    ['@deepseek-ai/dsh-client-ui-commands', CommandUiRuntime],
    ['@deepseek-ai/dsh-client-ui-advisor-selection', advisorHost],
    ['@deepseek-ai/dsh-client-ui-advisor-selection/client', advisor],
  ])
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])

  const input = ctx.inputTriggers.sessionOf(scope.ctx)
  expect(await input.adjudicate('/advisor', new AbortController().signal, { attachments: 0 })).toBe('handled')
  const popup = ctx.commandUi.popupFor(scope.ctx)
  await vi.waitFor(() =>{  expect(popup.state.getSnapshot().status).toBe('ready') })
  expect(popup.state.getSnapshot().options.map(option => option.label)).toEqual(['Off', 'Reviewer'])
  await popup.select(0)
  expect(update).toHaveBeenLastCalledWith('advisor', { enabled: false }, 7)
  expect(value.enabled).toBe(false)

  await input.adjudicate('/advisor', new AbortController().signal, { attachments: 0 })
  await vi.waitFor(() =>{  expect(popup.state.getSnapshot().status).toBe('ready') })
  expect(popup.state.getSnapshot().options[0]?.active).toBe(true)
  await popup.select(1)
  expect(update).toHaveBeenLastCalledWith('advisor', {
    enabled: true, provider: 'vendor', model: 'reviewer', reasoningEffort: 'high',
  }, 8)

  const bundle = await readFile(new URL('../../../bundle/web-app/cordis.patch.yml', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../../../bundle/web-app/package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>
  }
  expect(bundle).toContain("name: '@deepseek-ai/dsh-client-ui-advisor-selection'")
  expect(manifest.dependencies['@deepseek-ai/dsh-client-ui-advisor-selection']).toBe('workspace:^')
})
