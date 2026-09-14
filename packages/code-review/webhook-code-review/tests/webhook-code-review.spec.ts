/** @vitest-environment node */
import { Context } from '@deepseek-ai/cordis'
import { DEFAULT_REVIEW_PROMPT } from '@deepseek-ai/dsh-command-code-review'
import { WebhookDeliveryId, WebhookSourceId, WebhookRuleId } from '@deepseek-ai/dsh-webhook'
import { afterEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/index.ts'
import * as webhookCodeReview from '../src/index.ts'
import type { GitHubWebhookEvent } from '@deepseek-ai/dsh-webhook-github'
import WebhookRuntime from '@deepseek-ai/dsh-webhook'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

function githubEvent(name: string, payload: Record<string, unknown> = {}): GitHubWebhookEvent {
  return { name, payload } as GitHubWebhookEvent
}

function delivery(event: GitHubWebhookEvent, source = WebhookSourceId('test-github')) {
  return {
    kind: 'github',
    source,
    deliveryId: WebhookDeliveryId('test-delivery'),
    event,
    receivedAt: 1,
  } as never
}

const baseConfig: Config = {
  agentPreset: 'standard',
  permissionPreset: 'read-only',
  workspacePath: 'C:\\work\\auto-review',
}

describe('module surface', () => {
  it('exposes the plugin descriptor and stable constants', () => {
    expect(webhookCodeReview.name).toBe('webhook-code-review')
    expect(webhookCodeReview.inject).toEqual(['webhookRuntime'])
    expect(webhookCodeReview.RULE_ID).toBe(WebhookRuleId('code-review-auto'))
    expect(webhookCodeReview.DEFAULT_EVENTS).toEqual(['pull_request', 'push'])
    expect(webhookCodeReview.DEFAULT_PULL_REQUEST_ACTIONS).toEqual(['opened', 'synchronize', 'reopened'])
    expect(webhookCodeReview.Config).toBeDefined()
    expect(webhookCodeReview.default.name).toBe(webhookCodeReview.name)
    expect(webhookCodeReview.default.inject).toEqual(webhookCodeReview.inject)
    expect(webhookCodeReview.default.apply).toBe(webhookCodeReview.apply)
  })

  it('keeps the automatic review prompt stable and grounded in the shared prompt', () => {
    const prompt = webhookCodeReview.buildPrompt()
    expect(prompt.startsWith(DEFAULT_REVIEW_PROMPT)).toBe(true)
    expect(prompt.includes(webhookCodeReview.AUTO_REVIEW_SURFACE_PROMPT)).toBe(true)
    expect(webhookCodeReview.buildPrompt()).toBe(prompt)
  })
})

describe('matches', () => {
  it('accepts default pull_request actions and push, and rejects other actions and events', () => {
    const config: Config = { agentPreset: 'standard', permissionPreset: 'read-only' }
    expect(webhookCodeReview.matches(delivery(githubEvent('pull_request', { action: 'opened' })), config)).toBe(true)
    expect(webhookCodeReview.matches(delivery(githubEvent('push')), config)).toBe(true)
    expect(webhookCodeReview.matches(delivery(githubEvent('pull_request', { action: 'closed' })), config)).toBe(false)
    expect(webhookCodeReview.matches(delivery(githubEvent('pull_request')), config)).toBe(false)
    expect(webhookCodeReview.matches(delivery(githubEvent('issues')), config)).toBe(false)
  })

  it('honors configured source, event, and action allowlists', () => {
    const config: Config = {
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      source: 'primary-github',
      events: ['pull_request'],
      pullRequestActions: ['ready_for_review'],
    }
    expect(webhookCodeReview.matches(
      delivery(githubEvent('pull_request', { action: 'ready_for_review' }), WebhookSourceId('primary-github')), config)).toBe(true)
    expect(webhookCodeReview.matches(delivery(githubEvent('pull_request', { action: 'opened' })), config)).toBe(false)
    expect(webhookCodeReview.matches(delivery(githubEvent('push')), config)).toBe(false)
    expect(webhookCodeReview.matches(
      delivery(githubEvent('pull_request', { action: 'ready_for_review' }), WebhookSourceId('other')),
      config,
    )).toBe(false)
  })
})

describe('resolveWorkspace', () => {
  it('prefers the mapped repository and falls back to workspacePath', () => {
    const mapped: Config = {
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      workspacePath: 'C:\\work\\auto-review',
      workspaces: { 'owner/repo': 'C:\\work\\mapped' },
    }
    expect(webhookCodeReview.resolveWorkspace(
      delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } })), mapped))
      .toBe('C:\\work\\mapped')
    expect(webhookCodeReview.resolveWorkspace(
      delivery(githubEvent('push', { repository: { full_name: 'owner/other' } })), mapped))
      .toBe('C:\\work\\auto-review')
    expect(webhookCodeReview.resolveWorkspace(
      delivery(githubEvent('push')), baseConfig)).toBe('C:\\work\\auto-review')
  })

  it('returns null without any workspace source, and skips blank mapped paths', () => {
    const none: Config = { agentPreset: 'standard', permissionPreset: 'read-only' }
    expect(webhookCodeReview.resolveWorkspace(delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } })), none))
      .toBe(null)
    const blank: Config = {
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      workspacePath: 'C:\\work\\auto-review',
      workspaces: { 'owner/repo': '  ' },
    }
    expect(webhookCodeReview.resolveWorkspace(
      delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } })), blank))
      .toBe('C:\\work\\auto-review')
  })
})

describe('reviewTitle and buildReviewRequest', () => {
  it('titles deliveries by repository and event', () => {
    expect(webhookCodeReview.reviewTitle(
      delivery(githubEvent('pull_request', { action: 'opened', repository: { full_name: 'owner/repo' } }))))
      .toBe('Code review owner/repo PR opened')
    expect(webhookCodeReview.reviewTitle(
      delivery(githubEvent('pull_request', { repository: { full_name: 'owner/repo' } }))))
      .toBe('Code review owner/repo PR')
    expect(webhookCodeReview.reviewTitle(
      delivery(githubEvent('pull_request', { action: 'opened' }))))
      .toBe('Code review this repository PR opened')
    expect(webhookCodeReview.reviewTitle(
      delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } }))))
      .toBe('Code review owner/repo push')
  })

  it('builds a deterministic Session request with the shared prompt and presets', () => {
    const config: Config = {
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      workspacePath: 'C:\\work\\auto-review',
      workspaces: { 'owner/repo': 'C:\\work\\mapped' },
      model: { provider: 'deepseek', model: 'deepseek-v4-flash', maxTokens: 8192 },
    }
    const request = webhookCodeReview.buildReviewRequest(
      delivery(githubEvent('pull_request', { action: 'synchronize', repository: { full_name: 'owner/repo' } })),
      config,
    )
    expect(request).toEqual({
      workspacePath: 'C:\\work\\mapped',
      title: 'Code review owner/repo PR synchronize',
      prompt: webhookCodeReview.buildPrompt(),
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      model: { provider: 'deepseek', model: 'deepseek-v4-flash', maxTokens: 8192 },
    })
  })

  it('omits the model block when no explicit route is configured', () => {
    const request = webhookCodeReview.buildReviewRequest(
      delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } })),
      baseConfig,
    )
    expect(request?.workspacePath).toBe('C:\\work\\auto-review')
    expect(request === null || request.model === undefined).toBe(true)
    if (request !== null) expect(Object.hasOwn(request, 'model')).toBe(false)
  })

  it('returns null for non-matching deliveries, unresolvable workspaces, and malformed events', () => {
    expect(webhookCodeReview.buildReviewRequest(
      delivery(githubEvent('pull_request', { action: 'closed', repository: { full_name: 'owner/repo' } })),
      baseConfig)).toBe(null)
    expect(webhookCodeReview.buildReviewRequest(
      delivery(githubEvent('issues', { repository: { full_name: 'owner/repo' } })),
      baseConfig)).toBe(null)
    const none: Config = { agentPreset: 'standard', permissionPreset: 'read-only' }
    expect(webhookCodeReview.buildReviewRequest(
      delivery(githubEvent('push', { repository: { full_name: 'owner/repo' } })),
      none)).toBe(null)
    expect(webhookCodeReview.buildReviewRequest(
      { kind: 'github', source: WebhookSourceId('test-github'), deliveryId: WebhookDeliveryId('bad'), event: {}, receivedAt: 1 } as never,
      baseConfig)).toBe(null)
  })
})

describe('apply', () => {
  async function runtimeContext() {
    const ctx = new Context()
    for (const service of [
      'agents', 'agentDefaultModel', 'agentPresets', 'permissionPresets', 'sessionTitle', 'workspaceRegistry',
    ]) {
      ctx.provide(service as never, {} as never)
    }
    await ctx.plugin(WebhookRuntime)
    return ctx
  }

  it('rejects configs that cannot resolve a workspace or name a preset', async () => {
    const ctx = await runtimeContext()
    context = ctx
    expect(() => { webhookCodeReview.apply(ctx, { agentPreset: '  ', permissionPreset: 'read-only', workspacePath: 'C:\\r' }) })
      .toThrow(/agentPreset/)
    expect(() => { webhookCodeReview.apply(ctx, { agentPreset: 'standard', permissionPreset: '', workspacePath: 'C:\\r' }) })
      .toThrow(/permissionPreset/)
    expect(() => { webhookCodeReview.apply(ctx, { agentPreset: 'standard', permissionPreset: 'read-only' }) })
      .toThrow(/workspace/)
  })
})
