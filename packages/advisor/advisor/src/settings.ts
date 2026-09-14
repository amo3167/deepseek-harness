/**
 * Advisor route settings registered under the advisor namespace.
 *
 * @module @deepseek-ai/dsh-advisor/settings
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace carrying advisor enablement and route preferences. */
export const ADVISOR_SETTINGS_NAMESPACE = 'advisor'

/** Stored advisor enablement and route preferences. */
export interface AdvisorConfigOptions {
  /** Whether advisor consultations may resolve a route. */
  readonly enabled: boolean
  /** Registered provider route. */
  readonly provider: string
  /** Provider-owned exact model id. */
  readonly model: string
  /** Adapter-owned reasoning effort, or the model default when absent. */
  readonly reasoningEffort?: string
}

/** Schema for advisor enablement and route preferences. */
export const ADVISOR_SETTINGS_SCHEMA: z<AdvisorConfigOptions> = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
})
