/**
 * The model-facing advisor tool: one parameter-free consultation over the
 * calling agent's live conversation, plus the prompt section that tells the
 * model when to escalate.
 *
 * @module @deepseek-ai/dsh-tool-advisor
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-advisor'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import z from '@deepseek-ai/schemastery'
import { ADVISOR_PROMPT_SECTION, ADVISOR_TOOL_DESCRIPTION } from './description.ts'

export const name = 'tool-advisor'
export const inject = ['tools', 'advisors', 'systemPrompt']

/** Configuration for the advisor tool. */
export interface Config {
  /** Model-facing tool name. Each loaded instance must use a distinct name. */
  toolName?: string
  /** Whether to register the prompt section that explains advisor use. */
  promptSection?: boolean
}

/** Validate advisor-tool configuration. */
export const Config: z<Config> = z.object({
  toolName: z.string().default('advisor'),
  promptSection: z.boolean().default(true),
})

/** Join the text blocks of one canonical advisor output. */
function outputValueText(values: JsonValue[]): string {
  return values
    .filter((value): value is { type: 'text'; text: string } =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
      && value.type === 'text' && typeof value.text === 'string')
    .map(value => value.text)
    .join('')
}

/**
 * Install one advisor-tool composition.
 * @param ctx - Context that owns the registrations.
 * @param config - Advisor tool configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const toolName = config.toolName ?? 'advisor'

  ctx.tools.register(defineTool({
    name: toolName,
    description: ADVISOR_TOOL_DESCRIPTION,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          guidance: { type: 'array', required: true, items: { type: 'json' } },
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: outputValueText(value.guidance),
      }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('the advisor tool requires a calling agent (exec.agent was undefined)')
      const guidance = await ctx.advisors.consult({ agent, signal: exec.signal })
      return {
        guidance: guidance.guidance as unknown as JsonValue[],
        provider: guidance.route.provider,
        model: guidance.route.model,
      }
    },
  }))

  if (config.promptSection !== false) {
    ctx.systemPrompt.section({
      name: `tool:${toolName}`,
      order: ctx.systemPrompt.getSectionOrder('TOOL_ADVISOR'),
      text: ADVISOR_PROMPT_SECTION,
    })
  }
}
