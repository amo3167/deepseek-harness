import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

/** Keyless adapter that asks the composed main agent to consult its advisor. */
class AdvisorCompositionAdapter extends LlmAdapter {
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return (async function* (): AsyncIterable<StreamChunk> {
      if (options.provider === 'deepseek-official') {
        const text = 'choose the evidence-backed implementation'
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const toolResult = options.messages.at(-1)?.content.find(block => block.type === 'tool-result')
      if (toolResult === undefined) {
        yield {
          type: 'tool-call-delta',
          index: 0,
          id: ToolCallId('advisor-composition-call'),
          name: 'advisor',
          argumentsDelta: '{}',
        }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      const text = 'advisor consultation completed'
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }
}

export const name = 'advisor-composition-mock-llm'
export const inject = ['llm']

/** Register the main-agent and base-advisor routes used by the smoke. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['advisor-main', 'deepseek-official'], new AdvisorCompositionAdapter())
}
