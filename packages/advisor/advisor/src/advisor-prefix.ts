/**
 * Reconstruction of the calling agent's derived conversation. The advisor
 * later changes its leading system message, so only unchanged initial
 * system-text tokens can remain reusable on the same provider route. The
 * parent's system prompt travels in `messages`, not `GenerateOptions.system`.
 *
 * @module @deepseek-ai/dsh-advisor/advisor-prefix
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'

/** The parent's derived conversation, ready to extend with an advisor instruction. */
export interface AdvisorPrefix {
  /**
   * The conversation's derived messages in surface order, beginning with the
   * rendered system prompt when the surface has one.
   */
  readonly messages: Message[]
}

/**
 * Rebuild the calling session's derived conversation for an advisor call.
 * @param session - the consulting agent's live session.
 * @returns the derived messages to send to the advisor.
 */
export function buildAdvisorPrefix(session: Session): AdvisorPrefix {
  // A fresh array per call: deriveMessages returns a new snapshot, while the
  // Message objects inside it are shared and deep-frozen.
  return { messages: session.deriveMessages() }
}
