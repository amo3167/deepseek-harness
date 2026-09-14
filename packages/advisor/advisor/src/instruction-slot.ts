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
 * Put an advisor instruction in the latest effective system message.
 * @param messages - derived conversation messages.
 * @param instruction - resolved advisor instruction.
 * @returns a new message list with the instruction in its effective system slot.
 */
export function withAdvisorInstruction(messages: readonly Message[], instruction: string): Message[] {
  if (messages.length === 0) return [createSystemMessage(instruction, 'advisor')]
  const latestSystem = messages.findLastIndex(message => message.role === 'system')
  if (latestSystem === -1) return [createSystemMessage(instruction, 'advisor'), ...messages]
  const message = messages[latestSystem]
  if (message === undefined) return [createSystemMessage(instruction, 'advisor'), ...messages]
  const text = message.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  return messages.map((candidate, index) => index === latestSystem
    ? createSystemMessage(text.length === 0 ? instruction : `${text}\n\n${instruction}`, 'advisor')
    : candidate)
}
