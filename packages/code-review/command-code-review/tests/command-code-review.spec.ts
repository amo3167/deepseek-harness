import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as commandCodeReview from '@deepseek-ai/dsh-command-code-review'

function agentStub(steer: (msg: UserMessage) => void): Agent {
  const session = Session.create(SessionId('command-code-review-stub'))
  return { steer, session } as unknown as Agent
}

describe('command-code-review module', () => {
  it('exports the stable module surface', () => {
    expect(commandCodeReview.name).toBe('command-code-review')
    expect(commandCodeReview.inject).toEqual(['commands'])
    expect(typeof commandCodeReview.apply).toBe('function')
    expect(typeof commandCodeReview.reviewMessage).toBe('function')
    expect(commandCodeReview.DEFAULT_REVIEW_PROMPT).toMatch(/dsh-code-review/)
    expect(commandCodeReview.DEFAULT_REVIEW_PROMPT).toMatch(/blockers/)
  })

  it('builds the default review message without echoing raw input when empty', () => {
    const message = commandCodeReview.reviewMessage('')
    const text = (message.content as Array<{ type: string; text?: string }>).find(block => block.type === 'text')
    expect(text?.text).toBe(commandCodeReview.DEFAULT_REVIEW_PROMPT)
    expect(message.source).toEqual({ kind: 'user' })
  })

  it('appends the reviewer scope when raw input is present', () => {
    const message = commandCodeReview.reviewMessage(' review the new sandbox policy ')
    const text = (message.content as Array<{ type: string; text?: string }>).find(block => block.type === 'text')
    expect(text?.text).toContain(commandCodeReview.DEFAULT_REVIEW_PROMPT)
    expect(text?.text).toContain('Reviewer scope: review the new sandbox policy')
  })
})

describe('command-code-review registered command', () => {
  async function harness() {
    const ctx = new Context()
    await ctx.plugin(CommandRuntime)
    const seen: Array<UserMessage> = []
    const agent = agentStub((msg) => { seen.push(msg) })
    await ctx.plugin(commandCodeReview)
    return { ctx, agent, seen }
  }

  it('is not registered until the command plugin is mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(CommandRuntime)
    const agent = agentStub(() => { })
    expect(ctx.commands.find(agent, 'dsh-code-review')).toBeUndefined()
  })

  it('steers the review message into the agent and returns the stable success line', async () => {
    const { ctx, agent, seen } = await harness()
    const definition = ctx.commands.find(agent, 'dsh-code-review')
    expect(definition).toMatchObject({
      name: 'dsh-code-review',
      description: 'start a focused code review on the current context, the latest change, or a path you specify',
      input: { hint: '[<scope or focus>]' },
    })
    const execution = await ctx.commands.execute(agent, '/dsh-code-review the new sandbox policy', [], new AbortController().signal)
    expect(execution).not.toBeUndefined()
    if (execution === undefined) throw new Error('registration did not resolve')
    const result = execution.result
    expect(result).toMatchObject({
      kind: 'success',
      text: 'Code review started. The next reply is the review of the changes you pointed at.',
    })
    expect(seen).toHaveLength(1)
    const message = seen[0]
    if (message === undefined) throw new Error('expected exactly one steer call')
    const text = (message.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')
    expect(text?.text).toContain('Reviewer scope: the new sandbox policy')
    expect(text?.text).toContain('blockers')
  })
})
