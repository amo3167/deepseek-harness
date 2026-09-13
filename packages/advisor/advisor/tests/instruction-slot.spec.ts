import { describe, expect, it } from 'vitest'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { withAdvisorInstruction } from '../src/instruction-slot.ts'
import { appendUser, emptySession } from './fixtures.ts'

describe('withAdvisorInstruction', () => {
  it('appends the instruction inside the existing system message', () => {
    const messages = [
      createMessage({ role: 'system', content: [{ type: 'text', text: 'PARENT PROMPT' }], source: { kind: 'plugin', plugin: 'test' } }),
      createMessage({ role: 'user', content: [{ type: 'text', text: 'work' }], source: { kind: 'plugin', plugin: 'test' } }),
    ]
    const result = withAdvisorInstruction(messages, 'ADVISE')
    expect(result[0]?.role).toBe('system')
    expect((result[0]?.content[0] as { text: string }).text).toBe('PARENT PROMPT\n\nADVISE')
    expect(result).toHaveLength(2)
  })

  it('prepends a system message when the conversation has none', () => {
    const messages = [
      createMessage({ role: 'user', content: [{ type: 'text', text: 'work' }], source: { kind: 'plugin', plugin: 'test' } }),
    ]
    const result = withAdvisorInstruction(messages, 'ADVISE')
    expect(result[0]?.role).toBe('system')
    expect(result[1]?.role).toBe('user')
  })

  it('creates a system message for an empty conversation', () => {
    const result = withAdvisorInstruction([], 'ADVISE')
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('system')
  })

  it('uses the instruction when a system message has no text', () => {
    const messages = [createMessage({ role: 'system', content: [], source: { kind: 'plugin', plugin: 'test' } })]
    const result = withAdvisorInstruction(messages, 'ADVISE')
    expect(result[0]?.content).toEqual([{ type: 'text', text: 'ADVISE' }])
  })

  it('returns at most one system message for a real derived conversation', () => {
    const session = emptySession('slot-real')
    appendUser(session, 'work')
    const result = withAdvisorInstruction(session.deriveMessages(), 'ADVISE')
    expect(result.filter(message => message.role === 'system')).toHaveLength(1)
  })
})
