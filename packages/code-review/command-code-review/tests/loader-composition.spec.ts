import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as commandCodeReview from '@deepseek-ai/dsh-command-code-review'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('command-code-review real Loader composition', () => {
  it('discovers and executes /dsh-code-review through the assembled command plane', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-code-review-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-commands'",
      "- name: '@deepseek-ai/dsh-command-code-review'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-commands', CommandRuntime],
      ['@deepseek-ai/dsh-command-code-review', commandCodeReview],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const session = Session.create(SessionId('loader-command-code-review'))
    const steerCalls: Array<UserMessage> = []
    const agent = {
      session,
      status: 'idle',
      options: {},
      reserveTurnAdmission: () => () => undefined,
      steer: (message: UserMessage) => { steerCalls.push(message) },
    } as unknown as Agent
    expect(context.commands.list(agent)).toContainEqual({
      name: 'dsh-code-review',
      description: 'start a focused code review on the current context, the latest change, or a path you specify',
      input: { hint: '[<scope or focus>]' },
    })
    const execution = await context.commands.execute(agent, '/dsh-code-review', [], new AbortController().signal)
    expect(execution).not.toBeUndefined()
    if (execution === undefined) throw new Error('Loader composition did not resolve /dsh-code-review')
    const result = execution.result
    expect(result).toEqual({
      kind: 'success',
      text: 'Code review started. The next reply is the review of the changes you pointed at.',
    })
    expect(steerCalls).toHaveLength(1)
    const message = steerCalls[0]
    if (message === undefined) throw new Error('expected exactly one steer call')
    const text = (message.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')
    expect(text?.text).toContain('blockers')
  })
})
