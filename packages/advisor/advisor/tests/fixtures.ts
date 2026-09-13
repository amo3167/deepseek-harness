/** Shared session fixtures for advisor package tests. */

import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId, createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'

/** The plugin name recorded as the source of fixture messages. */
const FIXTURE_PLUGIN = 'advisor-test'

/**
 * Append one plugin-sourced user message to a session.
 * @param session - the session to extend.
 * @param text - the message text.
 */
export function appendUser(session: Session, text: string): void {
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: FIXTURE_PLUGIN },
  }), { surfaceOp: 'append' })
}

/**
 * Append one assistant message carrying an `advisor` tool call and no text.
 * @param session - the session to extend.
 * @param callId - the tool-call id to record.
 * @param turn - the turn number.
 * @param step - the step number.
 */
export function appendAdvisorCall(session: Session, callId: string, turn: number, step: number): void {
  session.append('assistant/message', {
    turn,
    step,
    message: createAssistantMessage({
      content: [{
        type: 'tool-call',
        id: ToolCallId(callId),
        name: 'advisor',
        arguments: '{}',
      }],
      source: { provider: 'test-provider', model: 'test-model' },
    }),
    stream: [],
  }, { surfaceOp: 'append' })
}

/**
 * Append one rendered system prompt node.
 * @param session - the session to extend.
 * @param text - the rendered prompt text.
 * @param turn - the open turn number.
 * @param step - the step number.
 */
export function appendSystem(session: Session, text: string, turn: number, step: number): void {
  session.append('system/message', {
    turn,
    step,
    message: createSystemMessage(text, FIXTURE_PLUGIN),
  }, { surfaceOp: 'append' })
}

/**
 * Create an empty session for one fixture.
 * @param id - the session id.
 * @returns the new session.
 */
export function emptySession(id: string): Session {
  return Session.create(SessionId(id))
}
