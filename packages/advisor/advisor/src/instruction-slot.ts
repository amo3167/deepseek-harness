/**
 * Placement of the advisor instruction in a conversation's own system
 * message. The changed message means the complete request is not a pure
 * prefix of the parent request.
 *
 * @module @deepseek-ai/dsh-advisor/instruction-slot
 */

import { createSystemMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

/**
 * Put an advisor instruction in the leading system message.
 * @param messages - derived conversation messages.
 * @param instruction - resolved advisor instruction.
 * @returns a new message list with one leading system message.
 */
export function withAdvisorInstruction(messages: readonly Message[], instruction: string): Message[] {
  if (messages.length === 0) return [createSystemMessage(instruction, 'advisor')]
  const [head, ...rest] = messages
  if (head === undefined || head.role !== 'system') return [createSystemMessage(instruction, 'advisor'), ...messages]
  const text = head.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  return [createSystemMessage(text.length === 0 ? instruction : `${text}\n\n${instruction}`, 'advisor'), ...rest]
}
