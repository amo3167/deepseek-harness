/**
 * Model-facing copy for the advisor tool and its prompt section, kept in one
 * module so the two cannot drift.
 *
 * @module @deepseek-ai/dsh-tool-advisor/description
 */

/** The advisor tool's description for decision-point escalation. */
export const ADVISOR_TOOL_DESCRIPTION = [
  [
    'Consult a stronger advisor model for guidance on a hard decision. The advisor reads this entire',
    'conversation — every message, tool call, and tool result — so pass no arguments and summarize',
    'nothing: a brief would only lose the detail the advisor needs.',
  ].join(' '),
  [
    'Consult it before committing to an approach whose consequences are hard to undo, when an error',
    'or failing command keeps recurring after your fixes, when you have circled the same problem',
    'without progress, and before declaring a substantial task complete. Do not consult it on routine',
    'steps.',
  ].join(' '),
  [
    'The advisor cannot run commands or read files; it reasons over the transcript only. It runs',
    'server-side and uses additional tokens. Apply its guidance, but when your own evidence',
    'contradicts a specific claim — a recommended step fails when tried, or a file contradicts the',
    'advice — say so and continue from the evidence rather than following it blindly.',
  ].join(' '),
].join('\n\n')

/** The prompt section telling the model how to use the advisor tool. */
export const ADVISOR_PROMPT_SECTION = [
  'Escalate to the advisor tool when judgment matters more than speed: before committing to an',
  'approach, when a failure keeps recurring, or before declaring work complete. The advisor reads',
  'the full conversation and consumes additional tokens, so consult it at decision points rather',
  'than every step.',
].join('\n')
