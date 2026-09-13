/** Test adapter that returns one scripted advisor result. */

import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

/** One scripted successful answer or terminal adapter failure. */
export type ScriptedOutcome =
  | { readonly kind: 'text'; readonly text: string; readonly usage?: TokenUsage }
  | { readonly kind: 'empty'; readonly usage?: TokenUsage }
  | { readonly kind: 'reasoning'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string; readonly code: string; readonly usage?: TokenUsage }
  | { readonly kind: 'aborted'; readonly message: string; readonly code: string; readonly usage?: TokenUsage }
  | { readonly kind: 'max-tokens'; readonly usage?: TokenUsage }

/** Captures requests while providing a deterministic LLM stream. */
export class ScriptedLlmAdapter extends LlmAdapter {
  /** Requests served by this adapter. */
  readonly seen: GenerateOptions[] = []

  /** @param outcome - terminal result emitted for each stream. */
  constructor(private readonly outcome: ScriptedOutcome) {
    super()
  }

  /** @param provider - requested provider. @param model - requested model. @returns supported model metadata. */
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({
      id: model,
      provider,
      name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }] },
    })
  }

  /** @param options - request to capture and answer. @returns the scripted chunk stream. */
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.seen.push(options)
    const outcome = this.outcome
    return (async function* (): AsyncIterable<StreamChunk> {
      if (outcome.kind === 'error') {
        if (outcome.usage !== undefined) yield { type: 'usage', usage: outcome.usage }
        yield { type: 'finish', reason: { kind: 'error', failure: { message: outcome.message, code: outcome.code } } }
        return
      }
      if (outcome.kind === 'aborted') {
        if (outcome.usage !== undefined) yield { type: 'usage', usage: outcome.usage }
        yield { type: 'finish', reason: { kind: 'aborted', failure: { message: outcome.message, code: outcome.code } } }
        return
      }
      if (outcome.kind === 'max-tokens') {
        if (outcome.usage !== undefined) yield { type: 'usage', usage: outcome.usage }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
        return
      }
      if (outcome.kind === 'reasoning') {
        yield { type: 'reasoning-delta', index: 0, text: outcome.text }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      if (outcome.kind === 'empty') {
        if (outcome.usage !== undefined) yield { type: 'usage', usage: outcome.usage }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      yield { type: 'text-delta', index: 0, text: outcome.text }
      if (outcome.usage !== undefined) yield { type: 'usage', usage: outcome.usage }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }
}
