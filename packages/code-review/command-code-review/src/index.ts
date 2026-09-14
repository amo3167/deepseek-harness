/**
 * The `/dsh-code-review` human-facing command: submits a deterministic
 * code-review request to the invoking agent's inbox so an interactive chat
 * surface can start a review on demand.
 *
 * The command owns the review prompt; it does not depend on the bundled
 * `dsh-code-review` skill existing, so it composes with any review tooling the
 * host chooses to offer the model. The prompt is the contract: a single user
 * message steered into the agent's nearest step boundary, where the model
 * either runs the host-provided code-review tooling (if any) or follows the
 * repository's standing conventions.
 *
 * @module @deepseek-ai/dsh-command-code-review
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'command-code-review'

/** The command requires only the shared command registry; submission uses the invocation's agent. */
export const inject = ['commands']

/**
 * The review request text. Stable across versions so that command output in
 * one session continues to read the same contract a later session's model does.
 */
export const DEFAULT_REVIEW_PROMPT =
  'Perform a focused code review following the DeepSeek-Harness dsh-code-review guidance. '
  + 'Load the `dsh-code-review` skill with the `skill` tool if it is available, then '
  + 'review only what the reviewer pointed at — the current session context, the '
  + 'most recent change, or the specific path or range the user attached — for '
  + 'correctness, lifecycle, security, and required-behavior regressions. '
  + 'Report findings as a short, ordered list of blockers, each with location, '
  + 'impact, and evidence; then a short list of optional suggestions. '
  + 'When no blockers exist, say so in one sentence and stop.'

/**
 * Build the user message the command steers into the agent. Kept separate from
 * the registration handler so the module's text can be asserted without mounting
 * the command plane.
 *
 * @param rawInput - The free-form scope or focus the user typed after the command name; empty or whitespace-only means no scope.
 * @returns The user message built from the stable review prompt, with a `Reviewer scope: …` line appended only when the scope is non-empty.
 */
export function reviewMessage(rawInput: string): ReturnType<typeof createUserMessage> {
  const instruction = rawInput.trim().length > 0 ? `${DEFAULT_REVIEW_PROMPT}\n\nReviewer scope: ${rawInput.trim()}` : DEFAULT_REVIEW_PROMPT
  return createUserMessage({
    content: [{ type: 'text', text: instruction }],
    source: { kind: 'user' },
  })
}

function buildResult(): CommandResult {
  return { kind: 'success', text: 'Code review started. The next reply is the review of the changes you pointed at.' }
}

/**
 * The registered `/dsh-code-review` handler. It is intentionally simple:
 * steer a user message into the agent and return the stable success line.
 * Failures to steer (aborted agent, disposed driver) surface as thrown errors
 * from `agent.steer` and bubble through the command runtime's failure path.
 */
function executeReview(invocation: CommandInvocation): CommandResult {
  invocation.agent.steer(reviewMessage(invocation.rawInput))
  return buildResult()
}

/** Register `/dsh-code-review` for every composed command adapter in this scope. */
export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'dsh-code-review',
    description: 'start a focused code review on the current context, the latest change, or a path you specify',
    input: { hint: '[<scope or focus>]' },
    handler: (invocation: CommandInvocation) => executeReview(invocation),
  })
}

/**
 * The plugin's default export: the registered plugin descriptor the Loader's
 * `unwrapExports` recognizes by its `inject` array and `apply` function.
 */
export default { name, inject, apply }
