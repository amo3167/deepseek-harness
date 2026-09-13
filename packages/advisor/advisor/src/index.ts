/**
 * The advisor capability: one auxiliary LLM call over a calling agent's live
 * conversation, returning guidance without creating an Agent or subagent.
 *
 * @module @deepseek-ai/dsh-advisor
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BlockAssembler, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { buildAdvisorPrefix } from './advisor-prefix.ts'
import { DEFAULT_ADVISOR_INSTRUCTION } from './advisor-instruction.ts'
import { withAdvisorInstruction } from './instruction-slot.ts'
import { preflightAdvisorRoute, requireAdvisorRoute } from './route.ts'
import { ADVISOR_SETTINGS_NAMESPACE, ADVISOR_SETTINGS_SCHEMA } from './settings.ts'
import type { AdvisorConfigOptions } from './settings.ts'
import type { AdvisorConsultRequest, AdvisorGuidance, AdvisorRoute } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Advisor consultation capability. */
    advisors: AdvisorService
  }
}

export { buildAdvisorPrefix } from './advisor-prefix.ts'
export type { AdvisorPrefix } from './advisor-prefix.ts'
export type { AdvisorConsultRequest, AdvisorGuidance, AdvisorRoute } from './types.ts'
export { DEFAULT_ADVISOR_INSTRUCTION } from './advisor-instruction.ts'
export { ADVISOR_SETTINGS_NAMESPACE, ADVISOR_SETTINGS_SCHEMA } from './settings.ts'
export type { AdvisorConfigOptions } from './settings.ts'

/** Configuration for advisor consultations. */
export interface Config {
  /** Registered provider route for the advisor model. */
  provider: string
  /** Provider-owned exact model id. */
  model: string
  /** Adapter-owned reasoning effort for the advisor route. */
  reasoningEffort?: string
  /** Output-token cap for one consultation. */
  maxTokens?: number
  /** System instruction placed in the conversation's system slot. */
  instruction?: string
}

/** Validate and default advisor composition configuration. */
export const Config: z<Config> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8192),
  instruction: z.string().default(DEFAULT_ADVISOR_INSTRUCTION),
})

/** Owns advisor settings, route resolution, auxiliary calls, and audit records. */
export class AdvisorService extends Service {
  static Config = Config
  static inject = ['llm']

  private readonly maxTokens: number
  private readonly instruction: string
  private readonly entry: AdvisorConfigOptions
  private source: () => AdvisorConfigOptions

  /** @param ctx - service context. @param config - validated advisor configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'advisors')
    this.maxTokens = config.maxTokens ?? 8192
    this.instruction = config.instruction ?? DEFAULT_ADVISOR_INSTRUCTION
    const entry: AdvisorConfigOptions = {
      provider: config.provider,
      model: config.model,
      ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
    }
    this.entry = entry
    this.source = () => entry
    ctx.inject(['settings'], (settingsCtx) => {
      const settings: SettingsProvider = settingsCtx.settings
      settings.installSection(ctx, ADVISOR_SETTINGS_NAMESPACE, ADVISOR_SETTINGS_SCHEMA, entry, {
        setSource: (current) => { this.source = current },
        onChange: () => {},
      })
    })
  }

  /**
   * Return the live settings route, or the optional agent default-model route.
   * @returns detached route when one source supplies it.
   */
  currentRoute(): AdvisorRoute | undefined {
    const current = this.source()
    if (current.provider.length > 0 && current.model.length > 0) {
      return { provider: current.provider, model: current.model }
    }
    const fallback = this.ctx.get('agentDefaultModel') as { currentSelection(): AdvisorRoute } | undefined
    const selection = fallback?.currentSelection()
    return selection === undefined ? undefined : { provider: selection.provider, model: selection.model }
  }

  /**
   * Consult the auxiliary LLM and append exactly one log-only invocation.
   * @param request - consulting agent and cancellation signal.
   * @returns completed advisor guidance and the route that produced it.
   */
  async consult(request: AdvisorConsultRequest): Promise<AdvisorGuidance> {
    const { agent, signal } = request
    const route = requireAdvisorRoute(this.currentRoute())
    const current = this.source()
    const effortText = current.provider === route.provider && current.model === route.model
      ? current.reasoningEffort
      : this.entry.provider === route.provider && this.entry.model === route.model
        ? this.entry.reasoningEffort
        : undefined
    const reasoningEffort = effortText === undefined ? undefined : ReasoningEffortId(effortText)
    signal.throwIfAborted()
    await preflightAdvisorRoute(this.ctx.llm, route, signal)
    signal.throwIfAborted()
    const session = agent.session
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      messages: withAdvisorInstruction(buildAdvisorPrefix(session).messages, this.instruction),
      maxTokens: this.maxTokens,
      sessionId: session.id,
      purpose: 'advisor',
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
      signal,
    }
    const base = {
      provider: route.provider,
      model: route.model,
      ...effortText === undefined ? {} : { reasoningEffort: effortText },
      maxTokens: this.maxTokens,
    }
    const assembler = new BlockAssembler()
    try {
      for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    } catch (error: unknown) {
      session.append('advisor/invocation', { ...base, outcome: 'failed', error: describeFailure(error) })
      throw error
    }
    const terminal = finishError(assembler.finish)
    if (terminal !== undefined) {
      session.append('advisor/invocation', { ...base, outcome: 'failed', error: terminal.message })
      throw terminal
    }
    const guidance = textBlocks(assembler.blocks())
    if (guidance.length === 0) {
      const empty = new LlmError('the advisor produced no guidance', 'ADVISOR_EMPTY_OUTPUT')
      session.append('advisor/invocation', { ...base, outcome: 'failed', error: empty.message })
      throw empty
    }
    session.append('advisor/invocation', {
      ...base,
      outcome: 'completed',
      guidance,
      ...assembler.usage === undefined ? {} : { usage: assembler.usage },
    })
    return {
      guidance,
      route,
      ...assembler.usage === undefined ? {} : { usage: assembler.usage },
    }
  }
}

/** Keep non-blank text output as advisor guidance. */
function textBlocks(blocks: readonly ContentBlock[]): ContentBlock[] {
  return blocks.filter((block): block is Extract<ContentBlock, { type: 'text' }> =>
    block.type === 'text' && block.text.trim().length > 0)
}

/** Turn an abnormal terminal finish into an advisor error. */
function finishError(finish: FinishReason): LlmError | undefined {
  switch (finish.kind) {
    case 'error':
    case 'aborted':
      return new LlmError(finish.failure.message, finish.failure.code)
    case 'max-tokens':
      return new LlmError('the advisor was truncated at its token cap (incomplete guidance)', 'ADVISOR_MAX_TOKENS')
    default:
      return undefined
  }
}

/** Render a thrown value as a durable safe failure detail. */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default AdvisorService
