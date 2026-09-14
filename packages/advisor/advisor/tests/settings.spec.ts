import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { describe, expect, it } from 'vitest'
import AdvisorService from '../src/index.ts'

/** Mount an advisor service with the file-backed live settings provider. */
async function setup(path = join(tmpdir(), `${randomUUID()}-advisor-settings.yaml`)): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FileSettingsProvider, { path, watch: false })
  await ctx.plugin(AdvisorService, { provider: 'deepseek-official', model: 'deepseek-flash' })
  return ctx
}

describe('advisor settings', () => {
  it('uses the composition advisor route when enabled by default', async () => {
    const service = (await setup()).advisors

    expect(service.isEnabled()).toBe(true)
    expect(service.currentRoute()).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
  })

  it('does not fall back to the parent model when settings disable advisor', async () => {
    const ctx = await setup()
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'parent-provider', model: 'parent-model' }),
    } as never)

    await ctx.settings.update('advisor', { enabled: false }, undefined)

    expect(ctx.advisors.isEnabled()).toBe(false)
    expect(ctx.advisors.currentRoute()).toBeUndefined()
  })

  it('retains the saved route while disabled', async () => {
    const ctx = await setup()

    await ctx.settings.update('advisor', { enabled: false, provider: 'vendor', model: 'reviewer' }, undefined)

    expect(ctx.settings.describe().find(entry => entry.ns === 'advisor')?.value).toMatchObject({
      enabled: false, provider: 'vendor', model: 'reviewer',
    })
  })

  it('restores the saved enabled selection and disabled route from a new settings provider', async () => {
    const path = join(tmpdir(), `${randomUUID()}-advisor-settings.yaml`)
    const initial = await setup(path)
    await initial.settings.update('advisor', { enabled: true, provider: 'vendor', model: 'reviewer' })
    await initial.fiber.dispose()

    const enabled = await setup(path)
    expect(enabled.advisors.isEnabled()).toBe(true)
    expect(enabled.advisors.currentRoute()).toEqual({ provider: 'vendor', model: 'reviewer' })
    await enabled.settings.update('advisor', { enabled: false })
    await enabled.fiber.dispose()

    const disabled = await setup(path)
    expect(disabled.advisors.isEnabled()).toBe(false)
    expect(disabled.advisors.currentRoute()).toBeUndefined()
    expect(disabled.settings.describe().find(entry => entry.ns === 'advisor')?.value).toMatchObject({
      enabled: false, provider: 'vendor', model: 'reviewer',
    })
    await disabled.fiber.dispose()
  })
})
