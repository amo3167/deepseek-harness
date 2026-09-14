import { describe, expect, it } from 'vitest'
import { buildAdvisorPrefix } from '../src/advisor-prefix.ts'
import { appendAdvisorCall, appendSystem, appendUser, emptySession } from './fixtures.ts'

describe('buildAdvisorPrefix', () => {
  it('returns the derived messages in surface order', () => {
    const session = emptySession('prefix-order')
    appendUser(session, 'first')
    appendUser(session, 'second')
    const prefix = buildAdvisorPrefix(session)
    expect(prefix.messages.map(message => message.role)).toEqual(['user', 'user'])
  })

  it('ends with the assistant message carrying the advisor tool call', () => {
    const session = emptySession('prefix-tool-call')
    appendUser(session, 'do the work')
    appendAdvisorCall(session, 'call-1', 1, 1)
    const prefix = buildAdvisorPrefix(session)
    const last = prefix.messages[prefix.messages.length - 1]
    expect(last?.role).toBe('assistant')
    expect(last?.content.some(block => block.type === 'tool-call')).toBe(true)
  })

  it('includes the system prompt as the leading derived message', () => {
    const session = emptySession('prefix-system')
    appendSystem(session, 'PARENT SYSTEM PROMPT', 1, 1)
    appendUser(session, 'do the work')
    const prefix = buildAdvisorPrefix(session)
    expect(prefix.messages[0]?.role).toBe('system')
    expect(prefix.messages[1]?.role).toBe('user')
  })

  it('returns a fresh messages array on each call', () => {
    const session = emptySession('prefix-fresh')
    appendUser(session, 'one')
    expect(buildAdvisorPrefix(session).messages).not.toBe(buildAdvisorPrefix(session).messages)
  })
})
