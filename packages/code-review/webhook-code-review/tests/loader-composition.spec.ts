/** @vitest-environment node */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { WebhookDeliveryId, WebhookSourceId } from '@deepseek-ai/dsh-webhook'
import { DEFAULT_REVIEW_PROMPT } from '@deepseek-ai/dsh-command-code-review'
import { afterEach, describe, expect, it } from 'vitest'
import WebhookRuntime from '@deepseek-ai/dsh-webhook'
import * as webhookCodeReview from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function createCapturedStubs() {
  const captured: Record<string, unknown> = {}
  const followed = Promise.withResolvers<undefined>()
  const stubs = {
    agents: {
      create: async () => ({
        agent: {
          session: {},
          followup(message: { content: Array<{ text?: string }>; source: unknown }) {
            captured.prompt = message.content[0]?.text
            captured.source = message.source
            followed.resolve(undefined)
          },
        },
        dispose: async () => {},
      }),
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4-flash' }) },
    agentPresets: {
      resolve: async (preset: string) => {
        captured.agentPreset = preset
        return { id: preset }
      },
      standingKeyFor: async () => 'standing',
      mount: async () => {},
    },
    permissionPresets: {
      resolve: (preset: string) => { captured.permissionPreset = preset },
      set: () => {},
    },
    sessionTitle: {
      rename: (_session: unknown, title: string) => { captured.title = title },
    },
    workspaceRegistry: {
      create: async (path: string) => {
        captured.workspacePath = path
        return {
          path,
          attachSession: async () => {},
          detachSession: async () => {},
        }
      },
    },
  }
  return { captured, followed, stubs }
}

async function loadedRuntime(config: string) {
  root = await mkdtemp(join(tmpdir(), 'dsh-webhook-code-review-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- name: fixture-dependencies',
    "- name: '@deepseek-ai/dsh-webhook'",
    "- name: '@deepseek-ai/dsh-webhook-code-review'",
    '  config:',
    ...config.split('\n').map(line => `    ${line}`),
    '',
  ].join('\n'))

  const { captured, followed, stubs } = createCapturedStubs()
  const dependencies = {
    name: 'fixture-dependencies',
    apply(ctx: Context) {
      for (const [service, value] of Object.entries(stubs)) {
        ctx.provide(service as never, value as never)
      }
    },
  }

  const webhookCodeReviewModule = await import('../src/index.ts')
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['fixture-dependencies', dependencies],
    ['@deepseek-ai/dsh-webhook', WebhookRuntime],
    ['@deepseek-ai/dsh-webhook-code-review', webhookCodeReviewModule],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  context = ctx
  return { ctx, captured, followed }
}

function prDelivery(action: string) {
  return {
    kind: 'github',
    source: WebhookSourceId('test-github'),
    deliveryId: WebhookDeliveryId('test-delivery'),
    event: {
      name: 'pull_request',
      payload: { action, repository: { full_name: 'owner/repo' } },
    },
    receivedAt: 1,
  }
}

describe('real Loader composition', () => {
  it('creates one review Session with the deterministic prompt for a matching delivery', { timeout: 60_000 }, async () => {
    const { ctx, captured, followed } = await loadedRuntime(
      ['workspacePath: C:\\work\\auto-review', 'agentPreset: standard', 'permissionPreset: read-only'].join('\n'))
    ctx.webhookRuntime.dispatch(prDelivery('synchronize'))
    await followed.promise
    expect(captured.workspacePath).toBe('C:\\work\\auto-review')
    expect(captured.agentPreset).toBe('standard')
    expect(captured.permissionPreset).toBe('read-only')
    expect(captured.title).toBe('Code review owner/repo PR synchronize')
    expect(captured.prompt).toBe(webhookCodeReview.buildPrompt())
    expect(String(captured.prompt).startsWith(DEFAULT_REVIEW_PROMPT)).toBe(true)
    expect(captured.source).toMatchObject({
      kind: 'webhook',
      provider: 'github',
      source: 'test-github',
      deliveryId: 'test-delivery',
      ruleId: 'code-review-auto',
      form: 'notice',
    })
  })

  it('takes no action for a pull request action outside the allowlist', { timeout: 60_000 }, async () => {
    const { ctx, captured } = await loadedRuntime(
      ['workspacePath: C:\\work\\auto-review', 'agentPreset: standard', 'permissionPreset: read-only'].join('\n'))
    ctx.webhookRuntime.dispatch(prDelivery('closed'))
    const tick = () => new Promise(resolve => setImmediate(resolve))
    await tick()
    await tick()
    await tick()
    expect(captured.prompt).toBeUndefined()
    expect(captured.workspacePath).toBeUndefined()
  })
})
