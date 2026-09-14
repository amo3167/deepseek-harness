/**
 * Advisor route validation before model dispatch.
 *
 * @module @deepseek-ai/dsh-advisor/route
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { AdvisorRoute } from './types.ts'

/**
 * Reject a missing configured advisor route.
 * @param route - configured route, when available.
 * @returns the configured route.
 * @throws {LlmError} when no usable route is configured.
 */
export function requireAdvisorRoute(route: AdvisorRoute | undefined): AdvisorRoute {
  if (route === undefined || route.provider.length === 0 || route.model.length === 0) {
    throw new LlmError(
      'no advisor model is configured: mount @deepseek-ai/dsh-advisor with `provider` and `model`',
      'ADVISOR_ROUTE_UNCONFIGURED',
    )
  }
  return route
}

/**
 * Confirm that the configured route resolves through a live adapter.
 * @param llm - live LLM runtime.
 * @param route - route to validate.
 * @param signal - cancellation for adapter capability lookup.
 * @returns fulfillment when the route resolves.
 */
export async function preflightAdvisorRoute(
  llm: LlmRuntime,
  route: AdvisorRoute,
  signal: AbortSignal,
): Promise<void> {
  await llm.resolveCallConfig({ provider: route.provider, model: route.model }, signal)
}
