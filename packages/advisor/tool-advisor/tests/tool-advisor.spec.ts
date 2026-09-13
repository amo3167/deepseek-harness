import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AdvisorService from '@deepseek-ai/dsh-advisor'
import LlmRuntime, { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { ADVISOR_PROMPT_SECTION } from '../src/description.ts'
import * as tool from '../src/index.ts'
import { ScriptedLlmAdapter } from './scripted-adapter.ts'

/** Mount the real tool stack around one scripted advisor route. */
async function setup(config: tool.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FileSettingsProvider, { path: join(tmpdir(), `${randomUUID()}-tool-advisor.yaml`), watch: false })
  await ctx.plugin(AdvisorService, { provider: 'test', model: 'advisor-model' })
  ctx.llm.registerAdapter(['test'], new ScriptedLlmAdapter({ kind: 'text', text: 'prefer the smaller refactor' }))
  const fiber = await ctx.plugin(tool, config)
  return { ctx, fiber }
}

/** One agent over a session holding a single user message. @param id - Session id. */
function agentWithSession(id: string): Agent {
  const session = Session.create(SessionId(id))
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'do the work' }],
    source: { kind: 'plugin', plugin: 'advisor-test' },
  }), { surfaceOp: 'append' })
  return { id: session.id, options: {}, session } as unknown as Agent
}

describe('tool-advisor', () => {
  it('registers a parameter-free advisor tool', async () => {
    const { ctx } = await setup()
    const advisor = ctx.tools.schemas().find(schema => schema.name === 'advisor')
    expect(advisor).toBeDefined()
    const parameters = advisor?.parameters as { properties?: Record<string, unknown> } | undefined
    expect(Object.keys(parameters?.properties ?? {})).toEqual([])
    expect(ctx.tools.get('advisor')?.isConcurrencySafe?.({})).toBe(true)
  })

  it('returns advisor guidance as tool result content', async () => {
    const { ctx } = await setup()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('tool-call-1'),
      name: 'advisor',
      arguments: {},
      agent: agentWithSession('tool-exec'),
    })
    const text = result.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('')
    expect(text).toContain('prefer the smaller refactor')
  })

  it('rejects execution without a calling agent', async () => {
    const { ctx } = await setup()
    await expect(ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('tool-call-without-agent'),
      name: 'advisor',
      arguments: {},
    })).resolves.toMatchObject({
      isError: true,
      error: { message: 'the advisor tool requires a calling agent (exec.agent was undefined)' },
    })
  })

  it('registers the default prompt section at the allocated advisor order', async () => {
    const { ctx } = await setup()
    expect(ctx.systemPrompt.getSectionOrder('TOOL_ADVISOR')).toBe(2850)
    expect((await ctx.systemPrompt.assemble()).sections).toContainEqual({
      name: 'tool:advisor',
      text: ADVISOR_PROMPT_SECTION,
    })
  })

  it('uses a configured name for both the tool and its prompt section', async () => {
    const { ctx } = await setup({ toolName: 'consult' })
    expect(ctx.tools.schemas().some(schema => schema.name === 'consult')).toBe(true)
    expect(ctx.tools.schemas().some(schema => schema.name === 'advisor')).toBe(false)
    expect((await ctx.systemPrompt.assemble()).sections).toContainEqual({
      name: 'tool:consult',
      text: ADVISOR_PROMPT_SECTION,
    })
  })

  it('omits the prompt section when configured not to register it', async () => {
    const { ctx } = await setup({ promptSection: false })
    expect(ctx.tools.schemas().some(schema => schema.name === 'advisor')).toBe(true)
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:advisor')).toBe(false)
  })

  it('removes its tool and prompt registrations when its fiber is disposed', async () => {
    const { ctx, fiber } = await setup()
    expect(ctx.tools.schemas().some(schema => schema.name === 'advisor')).toBe(true)
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:advisor')).toBe(true)

    await fiber.dispose()

    expect(ctx.tools.schemas().some(schema => schema.name === 'advisor')).toBe(false)
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:advisor')).toBe(false)
  })
})
