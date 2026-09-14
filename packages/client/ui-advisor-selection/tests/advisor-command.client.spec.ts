/** Global advisor command behavior over the browser plugin and Host Remote responses. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { CommandContribution, PopupSelectSpec } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PopupSelectController } from '@deepseek-ai/dsh-client-ui-commands/client'
import * as advisorPlugin from '../src/client/index.ts'

const session = { sessionId: 'conversation' as SessionId }
const signal = () => new AbortController().signal
const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function bench() {
  const ctx = new Context()
  contexts.push(ctx)
  const descriptor: SettingsNamespaceView = {
    ns: 'advisor', schema: {}, applies: 'live', secrets: [], revision: 7,
    value: { enabled: true, provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' },
  }
  const settingsValue: SettingsDescribeValue = { writable: true, hasDocument: true, namespaces: [descriptor] }
  const catalog: ModelCatalog = {
    default: { provider: 'irrelevant', model: 'session-default' },
    routableProviders: ['deepseek-official', 'vendor'], failures: [],
    groups: [
      { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'Flash' }] },
      { id: 'vendor', name: 'Vendor', models: [
        { id: 'reviewer', name: 'Reviewer', reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } },
        { id: 'org/model', name: 'Slash model' },
      ] },
    ],
  }
  const settings = {
    describe: vi.fn(async () => ({ ok: true as const, value: settingsValue })),
    update: vi.fn(async (_ns: string, _patch: unknown, _revision: number) => ({ ok: true as const, value: descriptor })),
    mutate: vi.fn(async (_ns: string, _ops: unknown, _revision: number) => ({ ok: true as const, value: descriptor })),
  }
  const modelCatalog = vi.fn(async () => ({ ok: true as const, value: catalog }))
  new TestRemote(ctx, { settings, session: { modelCatalog } })
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  let contribution: CommandContribution | undefined
  ctx.provide('commandUi', { register(value: CommandContribution) {
    contribution = value
    return () => { contribution = undefined }
  } })
  const fiber = ctx.plugin(advisorPlugin)
  await fiber.await()
  expect(contribution, 'the mounted browser plugin contributes /advisor').toBeDefined()
  expect(contribution!.ui.kind).toBe('popupSelect')
  return { ctx, fiber, locale, descriptor, settingsValue, catalog, settings, modelCatalog,
    command: contribution!, popup: contribution!.ui as PopupSelectSpec, contribution: () => contribution }
}

describe('global /advisor', () => {
  it('lists Off and provider-grouped advisor routes, with the saved route active', async () => {
    const b = await bench()
    expect(b.command.name).toBe('advisor')
    expect(b.command.available(session)).toBe(true)
    expect(b.command.label?.()).toBe('Advisor')
    expect(b.command.description?.()).toContain('all conversations')
    expect(await b.popup.options(session, signal())).toEqual([
      { id: 'off', label: 'Off', active: false },
      { id: 'deepseek-official/deepseek-flash', label: 'Flash', detail: 'DeepSeek', active: true },
      { id: 'vendor/reviewer', label: 'Reviewer', detail: 'Vendor', active: false },
      { id: 'vendor/org/model', label: 'Slash model', detail: 'Vendor', active: false },
    ])
    expect(b.modelCatalog).toHaveBeenCalledWith()
  })

  it('writes enabled false with the descriptor revision when Off is selected', async () => {
    const b = await bench()
    await b.popup.onSelect({ id: 'off', label: 'Off' }, session)
    expect(b.settings.update).toHaveBeenCalledWith('advisor', { enabled: false }, 7)
  })

  it('selects a route with its default reasoning effort', async () => {
    const b = await bench()
    await b.popup.onSelect({ id: 'vendor/reviewer', label: 'Reviewer' }, session)
    expect(b.settings.update).toHaveBeenCalledWith('advisor', {
      enabled: true, provider: 'vendor', model: 'reviewer', reasoningEffort: 'high',
    }, 7)
  })

  it('resolves slash-containing model ids by catalog lookup', async () => {
    const b = await bench()
    await b.popup.onSelect({ id: 'vendor/org/model', label: 'Slash model' }, session)
    expect(b.settings.mutate).toHaveBeenCalledWith('advisor', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['provider'], value: 'vendor' },
      { op: 'set', path: ['model'], value: 'org/model' },
      { op: 'unset', path: ['reasoningEffort'] },
    ], 7)
  })

  it('marks only Off active when disabled and rereads settings for another conversation', async () => {
    const b = await bench()
    b.descriptor.value = { enabled: false, provider: 'deepseek-official', model: 'deepseek-flash' }
    const options = await b.popup.options({ sessionId: 'other' as SessionId }, signal())
    expect(options.filter(option => option.active).map(option => option.id)).toEqual(['off'])
    b.descriptor.value = { enabled: true, provider: 'vendor', model: 'reviewer' }
    expect((await b.popup.options(session, signal())).find(option => option.active)?.id).toBe('vendor/reviewer')
  })

  it('rejects stale routes using the fresh catalog without writing settings', async () => {
    const b = await bench()
    await b.popup.options(session, signal())
    Object.assign(b.catalog, { groups: [] })
    await expect(b.popup.onSelect({ id: 'vendor/reviewer', label: 'Reviewer' }, session)).rejects.toThrow('unavailable')
    expect(b.settings.update).not.toHaveBeenCalled()
  })

  it('localizes the command, Off, and unavailable-model errors and disposes registration', async () => {
    const b = await bench()
    b.locale.setLocale('zh')
    expect(b.command.label?.()).toBe('顾问')
    expect(b.command.description?.()).toBe('为所有会话选择顾问模型或关闭顾问')
    expect((await b.popup.options(session, signal()))[0]?.label).toBe('关闭')
    await expect(b.popup.onSelect({ id: 'missing', label: 'Missing' }, session)).rejects.toThrow('所选顾问模型不可用，请重新加载列表。')
    await b.fiber.dispose()
    expect(b.contribution()).toBeUndefined()
  })

  it('surfaces load failures and reloads through the existing popup retry', async () => {
    const b = await bench()
    b.settings.describe.mockRejectedValueOnce(new Error('settings unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const popup = new PopupSelectController<typeof session>({ consume: () => true, focusComposer: () => {} })
    popup.open('advisor', b.popup, session, { via: 'enter', token: '/advisor' })
    await vi.waitFor(() =>{  expect(popup.state.getSnapshot().status).toBe('failed') })
    expect(popup.state.getSnapshot().error).toBe('settings unavailable')
    popup.retry()
    await vi.waitFor(() =>{  expect(popup.state.getSnapshot().status).toBe('ready') })
    popup.dispose()
    log.mockRestore()
  })

  it('surfaces revision conflicts and rereads before the next popup selection attempt', async () => {
    const b = await bench()
    b.settings.update.mockResolvedValueOnce({ ok: false, error: { code: 'settings/conflict', message: 'revision moved' } } as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consume = vi.fn(() => true)
    const popup = new PopupSelectController<typeof session>({ consume, focusComposer: () => {} })
    popup.open('advisor', b.popup, session, { via: 'enter', token: '/advisor' })
    await vi.waitFor(() =>{  expect(popup.state.getSnapshot().status).toBe('ready') })
    await popup.select(0)
    expect(popup.state.getSnapshot().error).toContain('settings/conflict: revision moved')
    expect(consume).not.toHaveBeenCalled()
    b.descriptor.revision = 8
    await popup.select(0)
    expect(b.settings.update).toHaveBeenLastCalledWith('advisor', { enabled: false }, 8)
    expect(consume).toHaveBeenCalledOnce()
    expect(popup.state.getSnapshot().open).toBe(false)
    log.mockRestore()
  })

  it('rejects missing or read-only settings and Remote catalog errors', async () => {
    const b = await bench()
    b.settingsValue.namespaces = []
    await expect(b.popup.options(session, signal())).rejects.toThrow('Advisor settings are unavailable')
    b.settingsValue.namespaces = [b.descriptor]
    b.settingsValue.writable = false
    await expect(b.popup.onSelect({ id: 'off', label: 'Off' }, session)).rejects.toThrow('read-only')
    b.settingsValue.writable = true
    b.modelCatalog.mockResolvedValueOnce({ ok: false, error: { code: 'gateway/internal', message: 'catalog unavailable' } } as never)
    await expect(b.popup.options(session, signal())).rejects.toThrow('gateway/internal: catalog unavailable')
  })

  it('rejects malformed descriptors and unsuccessful settings reads', async () => {
    const b = await bench()
    for (const value of [null, 'invalid', []]) {
      b.descriptor.value = value
      await expect(b.popup.options(session, signal())).rejects.toThrow('Advisor settings are unavailable')
    }
    b.settings.describe.mockResolvedValueOnce({ ok: false, error: { code: 'settings/rejected', message: 'read failed' } } as never)
    await expect(b.popup.onSelect({ id: 'off', label: 'Off' }, session)).rejects.toThrow('settings/rejected: read failed')
    expect(b.settings.update).not.toHaveBeenCalled()
  })

  it('propagates refused route writes from both settings write methods', async () => {
    const b = await bench()
    const failure = { ok: false, error: { code: 'settings/conflict', message: 'route changed' } } as never
    b.settings.update.mockResolvedValueOnce(failure)
    await expect(b.popup.onSelect({ id: 'vendor/reviewer', label: 'Reviewer' }, session)).rejects.toThrow('settings/conflict: route changed')
    b.settings.mutate.mockResolvedValueOnce(failure)
    await expect(b.popup.onSelect({ id: 'vendor/org/model', label: 'Slash model' }, session)).rejects.toThrow('settings/conflict: route changed')
  })
})
