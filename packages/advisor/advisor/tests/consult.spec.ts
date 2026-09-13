import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { describe, expect, it, vi } from 'vitest'
import AdvisorService from '../src/index.ts'
import { appendUser, emptySession } from './fixtures.ts'
import { ScriptedLlmAdapter } from './scripted-adapter.ts'

/** Mount one advisor service with its runtime dependencies. */
async function setup(adapter: ScriptedLlmAdapter, config?: Partial<{ provider: string; model: string }>): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FileSettingsProvider, { path: join(tmpdir(), `${randomUUID()}-advisor-settings.yaml`), watch: false })
  await ctx.plugin(AdvisorService, { provider: 'test', model: 'advisor-model', maxTokens: 256, ...config })
  ctx.effect(() => ctx.llm.registerAdapter(['test'], adapter))
  return ctx
}

/** Create an agent over a session with one user message. */
function agentWithSession(): Agent {
  const session = emptySession('consult-fixture')
  appendUser(session, 'do the work')
  return { id: session.id, options: {}, session } as unknown as Agent
}

/** Return the advisor audit records in one agent session. */
function invocationEvents(agent: Agent) {
  return agent.session.snapshotEvents().filter(event => event.type === 'advisor/invocation')
}

describe('AdvisorService.consult', () => {
  it('returns guidance and the consulted route', async () => {
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'text', text: 'use the smaller refactor' }))
    const result = await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(result.guidance).toEqual([{ type: 'text', text: 'use the smaller refactor' }])
    expect(result.route).toEqual({ provider: 'test', model: 'advisor-model' })
  })

  it('sends no system field, tools, or stop sequences', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = await setup(adapter)
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(adapter.seen[0]?.system).toBeUndefined()
    expect(adapter.seen[0]?.tools).toBeUndefined()
    expect(adapter.seen[0]?.stop).toBeUndefined()
    expect(adapter.seen[0]?.purpose).toBe('advisor')
  })

  it('places the instruction in the sole leading system message', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = await setup(adapter)
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect((adapter.seen[0]?.messages ?? []).filter(message => message.role === 'system')).toHaveLength(1)
  })

  it('records completed guidance on the consulting session', async () => {
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' }))
    const agent = agentWithSession()
    await ctx.advisors.consult({ agent, signal: new AbortController().signal })
    expect(invocationEvents(agent)[0]?.data).toMatchObject({ outcome: 'completed', provider: 'test', model: 'advisor-model' })
  })

  it('keeps adapter usage in completed guidance and the durable record', async () => {
    const usage = { inputTokens: 3, outputTokens: 5 }
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'text', text: 'guidance', usage }))
    const agent = agentWithSession()
    await expect(ctx.advisors.consult({ agent, signal: new AbortController().signal })).resolves.toMatchObject({ usage })
    expect(invocationEvents(agent)[0]?.data).toMatchObject({ usage })
  })

  it('records and rethrows an adapter failure', async () => {
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'error', message: 'upstream exploded', code: 'UPSTREAM' }))
    const agent = agentWithSession()
    await expect(ctx.advisors.consult({ agent, signal: new AbortController().signal })).rejects.toThrow('upstream exploded')
    expect(invocationEvents(agent)[0]?.data).toMatchObject({ outcome: 'failed', error: 'upstream exploded' })
  })

  it('records and rethrows a thrown non-Error adapter failure', async () => {
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'text', text: 'unused' }))
    vi.spyOn(ctx.llm, 'stream').mockImplementation(() => { throw 'transport unavailable' })
    const agent = agentWithSession()
    await expect(ctx.advisors.consult({ agent, signal: new AbortController().signal })).rejects.toBe('transport unavailable')
    expect(invocationEvents(agent)[0]?.data).toMatchObject({ outcome: 'failed', error: 'transport unavailable' })
  })

  it('records an Error thrown while dispatching', async () => {
    const ctx = await setup(new ScriptedLlmAdapter({ kind: 'text', text: 'unused' }))
    vi.spyOn(ctx.llm, 'stream').mockImplementation(() => { throw new Error('dispatch failed') })
    const agent = agentWithSession()
    await expect(ctx.advisors.consult({ agent, signal: new AbortController().signal })).rejects.toThrow('dispatch failed')
    expect(invocationEvents(agent)[0]?.data).toMatchObject({ outcome: 'failed', error: 'dispatch failed' })
  })

  it('fails closed on aborted or truncated output', async () => {
    for (const [outcome, message] of [
      [{ kind: 'aborted', message: 'cancelled upstream', code: 'CANCELLED' }, 'cancelled upstream'],
      [{ kind: 'max-tokens' }, 'truncated at its token cap'],
    ] as const) {
      const ctx = await setup(new ScriptedLlmAdapter(outcome))
      await expect(ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })).rejects.toThrow(message)
    }
  })

  it('fails closed when output is blank or non-text', async () => {
    for (const outcome of [
      { kind: 'text', text: ' ' },
      { kind: 'reasoning', text: 'internal thought' },
    ] as const) {
      const ctx = await setup(new ScriptedLlmAdapter(outcome))
      await expect(ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal }))
        .rejects.toThrow('the advisor produced no guidance')
    }
  })

  it('uses a configured reasoning effort for the matching route', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = await setup(adapter, { provider: 'test', model: 'advisor-model', reasoningEffort: 'low' } as never)
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(adapter.seen[0]?.reasoningEffort).toBe('low')
  })

  it('omits effort when settings select a different route', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = await setup(adapter)
    await ctx.settings.replace('advisor', { provider: 'test', model: 'settings-model' })
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(adapter.seen[0]?.reasoningEffort).toBeUndefined()
  })

  it('fails loud when no adapter owns the route', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(AdvisorService, { provider: 'unregistered', model: 'nope' })
    ctx.effect(() => ctx.llm.registerAdapter(
      ['test'], new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' }),
    ))
    await expect(ctx.advisors.consult({
      agent: agentWithSession(), signal: new AbortController().signal,
    })).rejects.toThrow(/no adapter registered/)
  })

  it('fails loud when no layer configures a route', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(AdvisorService, { provider: '', model: '' })
    ctx.effect(() => ctx.llm.registerAdapter(['test'], new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })))
    await expect(ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal }))
      .rejects.toThrow(/no advisor model is configured/)
  })

  it('uses the optional agent default-model route when its advisor route is empty', async () => {
    const ctx = new Context()
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'test', model: 'fallback-model' }) } as never)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(AdvisorService, { provider: '', model: '' })
    ctx.effect(() => ctx.llm.registerAdapter(['test'], new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })))
    expect(ctx.advisors.currentRoute()).toEqual({ provider: 'test', model: 'fallback-model' })
  })

  it('uses the composition effort when an empty settings route falls back to it', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = new Context()
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'test', model: 'advisor-model' }) } as never)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(FileSettingsProvider, { path: join(tmpdir(), `${randomUUID()}-advisor-settings.yaml`), watch: false })
    await ctx.plugin(AdvisorService, { provider: 'test', model: 'advisor-model', reasoningEffort: 'low', maxTokens: 256 })
    ctx.effect(() => ctx.llm.registerAdapter(['test'], adapter))
    await ctx.settings.replace('advisor', { provider: '', model: '' })
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(adapter.seen[0]?.reasoningEffort).toBe('low')
  })

  it('omits composition effort when an empty settings route falls back to another model', async () => {
    const adapter = new ScriptedLlmAdapter({ kind: 'text', text: 'guidance' })
    const ctx = new Context()
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'test', model: 'fallback-model' }) } as never)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(FileSettingsProvider, { path: join(tmpdir(), `${randomUUID()}-advisor-settings.yaml`), watch: false })
    await ctx.plugin(AdvisorService, { provider: 'test', model: 'advisor-model', reasoningEffort: 'low', maxTokens: 256 })
    ctx.effect(() => ctx.llm.registerAdapter(['test'], adapter))
    await ctx.settings.replace('advisor', { provider: '', model: '' })
    await ctx.advisors.consult({ agent: agentWithSession(), signal: new AbortController().signal })
    expect(adapter.seen[0]?.reasoningEffort).toBeUndefined()
  })
})
