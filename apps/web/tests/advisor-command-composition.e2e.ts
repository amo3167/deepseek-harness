/** Shipped Web composition coverage for the global advisor command and live tool visibility. */
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterEach, expect, it, onTestFailed } from 'vitest'
// These imports carry the Context merges used by the composition assertions below.
import type {} from '@deepseek-ai/dsh-advisor'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

let scaffold: WebScaffold | undefined
let browser: Browser | undefined

afterEach(async () => {
  await browser?.close()
  browser = undefined
  await scaffold?.close()
  scaffold = undefined
})

/** The currently rendered names in the browser's composed slash-command directory. */
async function commandNames(page: Page): Promise<string[]> {
  const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
  await menu.waitFor({ timeout: 15_000 })
  return await menu.getByRole('option').allTextContents()
}

it('exposes /advisor in the shipped Web command directory and removes it from later model assemblies when disabled', async () => {
  scaffold = await launchWebScaffold()
  browser = await chromium.launch()
  const page = await newEnglishPage(browser)
  onTestFailed(() => saveFailureShot(page, 'web-e2e-advisor-command-composition'))
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)

  const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
  await writeComposerDraft(page, composer, '/')
  await expect.poll(() => commandNames(page), { timeout: 15_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/^advisor/ui)]))
  await writeComposerDraft(page, composer, '')

  await scaffold.ctx.settings.update('advisor', { enabled: false })
  expect(scaffold.ctx.advisors.isEnabled()).toBe(false)
  expect(scaffold.ctx.tools.get('advisor')).toBeUndefined()
  const handle = await scaffold.ctx.agents.create({
    sessionId: SessionId('advisor-disabled-model-assembly'),
    setup: agentCtx => scaffold!.ctx.agentPresets.mount(agentCtx).then(() => undefined),
  })
  try {
    expect(scaffold.ctx.tools.schemas(handle.agent).map(tool => tool.name)).not.toContain('advisor')
    expect((await scaffold.ctx.systemPrompt.assemble({ scope: handle.agent })).tools.map(tool => tool.name))
      .not.toContain('advisor')
  } finally {
    await handle.dispose()
  }
}, 120_000)
