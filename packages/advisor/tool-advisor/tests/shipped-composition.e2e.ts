import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL(
  '../../../test-support/loader-smoke/tests/fixtures/headless-driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL('./fixtures/production/advisor.patch.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('advisor through the shipped headless profile', () => {
  it('loads the base advisor rows and returns composed advisor guidance to the calling agent', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'advisor shipped headless composition',
      tempDirPrefix: 'advisor-shipped-composition-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'consult before deciding'],
      tsconfigPath,
    })
    const events = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as {
      event?: { type: string; data?: { name?: string } }
    })
    expect(stderr).toBe('')
    expect(events.some(record => record.event?.type === 'tool/call' && record.event.data?.name === 'advisor')).toBe(true)
    expect(events.some(record => record.event?.type === 'advisor/invocation')).toBe(true)
    expect(JSON.stringify(events)).toContain('choose the evidence-backed implementation')
    expect(JSON.stringify(events)).toContain('advisor consultation completed')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
