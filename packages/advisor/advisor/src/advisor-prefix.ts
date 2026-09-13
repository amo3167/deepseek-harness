/**
 * Reconstruction of the calling agent's last routed request as a cacheable
 * prefix. The advisor's request is that prefix with an instruction placed
 * inside its system message, so the provider's KV cache is reused rather than
 * invalidated. The parent's own request carries its system prompt inside
 * `messages` and leaves `GenerateOptions.system` unset, so this prefix does the
 * same.
 *
 * @module @deepseek-ai/dsh-advisor/advisor-prefix
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'

/** The parent's last routed request, ready to extend with an advisor instruction. */
export interface AdvisorPrefix {
  /**
   * The conversation's derived messages in surface order, beginning with the
   * rendered system prompt when the surface has one. Passing these unchanged as
   * `GenerateOptions.messages` reproduces the parent request's prefix.
   */
  readonly messages: Message[]
}

/**
 * Rebuild the calling session's last routed request as a cacheable prefix.
 * @param session - the consulting agent's live session.
 * @returns the derived messages to send to the advisor.
 */
export function buildAdvisorPrefix(session: Session): AdvisorPrefix {
  // A fresh array per call: deriveMessages returns a new snapshot, while the
  // Message objects inside it are shared and deep-frozen.
  return { messages: session.deriveMessages() }
}
