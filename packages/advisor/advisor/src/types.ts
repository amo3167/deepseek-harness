/**
 * The advisor seam's consumer-facing types. An advisor reads one live
 * conversation and returns guidance; it owns no session, no tools, and no
 * state between consultations.
 *
 * @module @deepseek-ai/dsh-advisor/types
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, TokenUsage } from '@deepseek-ai/dsh-llm'

/** One advisor consultation over the calling agent's live conversation. */
export interface AdvisorConsultRequest {
  /** The agent whose conversation the advisor reads and whose cancellation governs the call. */
  readonly agent: Agent
  /** Cancellation, owning the consultation for its whole duration. */
  readonly signal: AbortSignal
}

/** The exact provider/model route one consultation used. */
export interface AdvisorRoute {
  /** Registered LLM provider id. */
  readonly provider: string
  /** Provider-owned exact model id. */
  readonly model: string
}

/** The advisor's returned guidance and the route that produced it. */
export interface AdvisorGuidance {
  /** The advisor's guidance as the calling model will read it. */
  readonly guidance: ContentBlock[]
  /** The exact route consulted. */
  readonly route: AdvisorRoute
  /** Advisor-reported token usage, when the adapter reported any. */
  readonly usage?: TokenUsage
}
