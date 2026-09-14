import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as tool from '../src/index.ts'

describe('advisor-free composition', () => {
  it('registers no advisor tool when the advisor service is absent', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(tool)
    expect(ctx.tools.schemas().some(schema => schema.name === 'advisor')).toBe(false)
  })
})
