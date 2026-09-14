/**
 * GitHub webhook rule that starts an automatic code review of the working tree.
 * On a matching delivery the rule requests one new Session whose prompt is the
 * deterministic dsh-code-review prompt plus a working-tree surface instruction;
 * the review is the reply of that Session.
 * @module @deepseek-ai/dsh-webhook-code-review
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_REVIEW_PROMPT } from '@deepseek-ai/dsh-command-code-review'
import { WebhookRuleId } from '@deepseek-ai/dsh-webhook'
import type { VerifiedWebhookDelivery, WebhookSessionRequest } from '@deepseek-ai/dsh-webhook'
import type { GitHubWebhookEvent } from '@deepseek-ai/dsh-webhook-github'

/** Cordis function plugin name. */
export const name = 'webhook-code-review'
/** Host services required before the rule can register. */
export const inject = ['webhookRuntime']
/** Rule identity registered with the webhook runtime. */
export const RULE_ID = WebhookRuleId('code-review-auto')
/** GitHub event names this rule reacts to when the config sets none. */
export const DEFAULT_EVENTS: readonly string[] = ['pull_request', 'push']
/** `pull_request` actions this rule reacts to when the config sets none. */
export const DEFAULT_PULL_REQUEST_ACTIONS: readonly string[] = ['opened', 'synchronize', 'reopened']
/**
 * Stable working-tree surface instruction appended to the shared review prompt,
 * so every automatic review examines the same deterministic change set.
 */
export const AUTO_REVIEW_SURFACE_PROMPT =
  'Reviewer surface: the working tree of this workspace. Establish the change set with `git status --short`, `git diff --staged`, and `git diff HEAD`, then review exactly that change set.'

/** Webhook rule plugin config. */
export interface Config {
  /** Adapter source name; when set, only deliveries from that source trigger. */
  source?: string
  /** GitHub event names that trigger a review (default: `pull_request` and `push`). */
  events?: string[]
  /** `pull_request` actions that trigger a review (default: `opened`, `synchronize`, `reopened`). */
  pullRequestActions?: string[]
  /** Absolute workspace directory used when the delivery's repository has no `workspaces` entry. */
  workspacePath?: string
  /** Repository `owner/name` to absolute workspace directory overrides. */
  workspaces?: Record<string, string>
  /** Agent composition mounted before the review Session is published. */
  agentPreset: string
  /** Sandbox and approval preset admitted before the review prompt. */
  permissionPreset: string
  /** Optional explicit model route for the review Session. */
  model?: {
    /** Registered provider route. */
    provider: string
    /** Provider-owned model id. */
    model: string
    /** Optional positive output-token cap. */
    maxTokens?: number
  }
}

/**
 * Plugin config: event and action allowlists, the source guard, the workspace
 * mapping, and the review Session's presets.
 */
export const Config: z<Config> = z.object({
  source: z.string(),
  events: z.array(z.string()).default([...DEFAULT_EVENTS]),
  pullRequestActions: z.array(z.string()).default([...DEFAULT_PULL_REQUEST_ACTIONS]),
  workspacePath: z.string(),
  workspaces: z.dict(z.string()),
  agentPreset: z.string().required(),
  permissionPreset: z.string().required(),
  model: z.object({
    provider: z.string(),
    model: z.string(),
    maxTokens: z.number(),
  }),
})

/** Typed delivery this rule consumes; the event is narrowed to the GitHub shape. */
type GitHubDelivery = Readonly<VerifiedWebhookDelivery<'github'>> & {
  readonly event: GitHubWebhookEvent
}

/** Narrow an untyped delivery event to the GitHub event shape, or null. */
function asGitHubEvent(event: unknown): GitHubWebhookEvent | null {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return null
  const candidate = event as { name?: unknown; payload?: unknown }
  if (typeof candidate.name !== 'string') return null
  if (candidate.payload === null || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload)) {
    return null
  }
  return event as GitHubWebhookEvent
}

/** Read a non-empty string field from an untyped JSON object, else undefined. */
function stringField(record: { readonly [field: string]: unknown }, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Read a JSON object field from an untyped JSON object, else undefined. */
function objectField(record: { readonly [field: string]: unknown }, field: string): { readonly [key: string]: unknown } | undefined {
  const value = record[field]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as { readonly [key: string]: unknown }
}

/**
 * Extract the delivery's repository `owner/name`, or null when absent.
 * @param event - the signed event projected by the GitHub adapter.
 * @returns the repository full name, or null when the payload names no repository.
 */
export function repositoryFullName(event: GitHubWebhookEvent): string | null {
  const repository = objectField(event.payload, 'repository')
  if (repository === undefined) return null
  const fullName = stringField(repository, 'full_name')
  return fullName === undefined ? null : fullName
}

/**
 * Decide whether one verified GitHub delivery matches the configured review surface.
 * @param delivery - the immutable authenticated provider data.
 * @param config - the plugin config supplying the source, event, and action allowlists.
 * @returns true when the delivery's source, event name, and pull request action are all allowed.
 */
export function matches(delivery: GitHubDelivery, config: Config): boolean {
  if (config.source !== undefined && delivery.source !== config.source) return false
  const event = delivery.event
  const events = config.events ?? DEFAULT_EVENTS
  if (!events.includes(event.name)) return false
  if (event.name !== 'pull_request') return true
  const actions = config.pullRequestActions ?? DEFAULT_PULL_REQUEST_ACTIONS
  const action = stringField(event.payload, 'action')
  return action !== undefined && actions.includes(action)
}

/**
 * Resolve the absolute workspace directory one delivery's repository maps to, or null.
 * @param delivery - the immutable authenticated provider data.
 * @param config - the plugin config whose `workspaces` and `workspacePath` are consulted.
 * @returns the repository's mapped path, falling back to the default path, or null when neither names one.
 */
export function resolveWorkspace(delivery: GitHubDelivery, config: Config): string | null {
  const fullName = repositoryFullName(delivery.event)
  if (fullName !== null) {
    const mapped = config.workspaces?.[fullName]
    if (mapped !== undefined && mapped.trim() !== '') return mapped
  }
  if (config.workspacePath !== undefined && config.workspacePath.trim() !== '') return config.workspacePath
  return null
}

/**
 * Build the deterministic prompt every automatic review Session receives.
 * @returns the stable dsh-code-review prompt followed by the working-tree surface instruction.
 */
export function buildPrompt(): string {
  return `${DEFAULT_REVIEW_PROMPT}\n\n${AUTO_REVIEW_SURFACE_PROMPT}`
}

/**
 * Build the explicit review Session title for one delivery.
 * @param delivery - the immutable authenticated provider data.
 * @returns a short deterministic title naming the repository and event.
 */
export function reviewTitle(delivery: GitHubDelivery): string {
  const repository = repositoryFullName(delivery.event)
  const target = repository === null ? 'this repository' : repository
  if (delivery.event.name === 'pull_request') {
    const action = stringField(delivery.event.payload, 'action')
    return `Code review ${target} PR${action === undefined ? '' : ` ${action}`}`
  }
  return `Code review ${target} ${delivery.event.name}`
}

/**
 * Convert one verified GitHub delivery into a review Session request, or no action.
 * @param delivery - the immutable authenticated provider data.
 * @param config - the plugin config matched against the delivery.
 * @returns the Session request for a matching delivery with a resolvable workspace, else null.
 */
export function buildReviewRequest(
  delivery: Readonly<VerifiedWebhookDelivery<'github'>>,
  config: Config,
): WebhookSessionRequest | null {
  const event = asGitHubEvent(delivery.event)
  if (event === null) return null
  const githubDelivery: GitHubDelivery = { ...delivery, event }
  if (!matches(githubDelivery, config)) return null
  const workspacePath = resolveWorkspace(githubDelivery, config)
  if (workspacePath === null) return null
  const model = modelRoute(config)
  return {
    workspacePath,
    title: reviewTitle(githubDelivery),
    prompt: buildPrompt(),
    agentPreset: config.agentPreset,
    permissionPreset: config.permissionPreset,
    ...(model === null ? {} : { model }),
  }
}

/**
 * Extract a complete model override from the config, or null when none is usable.
 * @param config - the plugin config whose `model` route is inspected.
 * @returns the provider, model, and optional maxTokens route, or null when incomplete.
 */
function modelRoute(config: Config): { provider: string; model: string; maxTokens?: number } | null {
  const route = config.model
  if (route == null) return null
  const provider = route.provider
  const model = route.model
  if (typeof provider !== 'string' || provider.trim() === '' || typeof model !== 'string' || model.trim() === '') {
    return null
  }
  return {
    provider,
    model,
    ...(route.maxTokens === undefined ? {} : { maxTokens: route.maxTokens }),
  }
}

/**
 * Validate the config and register the review rule with the injected webhook runtime.
 * @param ctx - the runtime context whose `webhookRuntime` service owns rule dispatch.
 * @param config - the validated plugin config.
 * @throws when the presets are blank or no workspace source is configured.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.agentPreset.trim() === '') {
    throw new Error('webhook-code-review: agentPreset must be a non-empty string')
  }
  if (config.permissionPreset.trim() === '') {
    throw new Error('webhook-code-review: permissionPreset must be a non-empty string')
  }
  if (config.workspacePath === undefined && Object.keys(config.workspaces ?? {}).length === 0) {
    throw new Error('webhook-code-review: set workspacePath or one workspaces entry so matching deliveries resolve to a workspace')
  }
  const route = config.model
  if (route != null) {
    const hasProvider = typeof route.provider === 'string' && route.provider.trim() !== ''
    const hasModel = typeof route.model === 'string' && route.model.trim() !== ''
    if (hasProvider !== hasModel) {
      throw new Error('webhook-code-review: model must set both provider and model together')
    }
  }
  ctx.effect(() => ctx.webhookRuntime.register({
    id: RULE_ID,
    kind: 'github',
    run(delivery, signal) {
      signal.throwIfAborted()
      return buildReviewRequest(delivery, config)
    },
  }))
}

/**
 * The plugin's default export: the registered plugin descriptor the Loader's
 * `unwrapExports` recognizes by its `inject` array and `apply` function, with
 * the `Config` schema so loaded rows validate and receive defaults.
 */
export default { name, inject, apply, Config }
