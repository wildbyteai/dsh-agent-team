import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createJsonCliAdapter } from '../../packages/dsh-agent-team/src/cli-adapter.mjs'

const officialRoot = process.argv[2]
if (officialRoot === undefined) {
  throw new Error('usage: verify.mjs <official-deepseek-harness-source-root>')
}

const { Context } = await import(pathToFileURL(
  join(officialRoot, 'vendor/cordis/lib/index.js'),
).href)
const { default: LocalSubprocessRuntime } = await import(pathToFileURL(
  join(officialRoot, 'packages/subprocess/subprocess-local/src/index.ts'),
).href)

const fixture = fileURLToPath(new URL(
  '../../packages/dsh-agent-team/tests/fixtures/fake-json-cli.mjs',
  import.meta.url,
))
const ctx = new Context()
const fiber = await ctx.plugin(LocalSubprocessRuntime)
let latestHandle

function adapter(overrides = {}) {
  return createJsonCliAdapter({
    id: 'managed-fake-agent',
    argv: [process.execPath, fixture],
    spawn(spec) {
      latestHandle = ctx.subprocess.spawn(spec)
      return latestHandle
    },
    timeoutMs: 1_000,
    cancelGraceMs: 50,
    terminateGraceMs: 50,
    ...overrides,
  })
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error.code === code)
}

try {
  const completed = await adapter().run({
    cwd: process.cwd(),
    payload: { mode: 'success' },
  })
  assert.deepEqual(completed, {
    schemaVersion: 1,
    summary: 'fake completed',
    artifacts: [],
  })

  await expectCode(adapter().run({
    cwd: process.cwd(),
    payload: { mode: 'invalid-json' },
  }), 'CLI_ADAPTER_PROTOCOL')

  await expectCode(adapter({ stdoutMaxBytes: 256 }).run({
    cwd: process.cwd(),
    payload: { mode: 'large-output' },
  }), 'CLI_ADAPTER_PROTOCOL')

  await expectCode(adapter().run({
    cwd: process.cwd(),
    payload: { mode: 'process-error' },
  }), 'CLI_ADAPTER_PROCESS')

  const controller = new AbortController()
  const graceful = adapter().run({
    cwd: process.cwd(),
    payload: { mode: 'wait-cancel' },
    signal: controller.signal,
  })
  setTimeout(() => controller.abort(), 30)
  await expectCode(graceful, 'CLI_ADAPTER_CANCELLED')
  assert.deepEqual(await latestHandle.done, { exitCode: 0, signal: null })
  assert.equal(await latestHandle.waitForExit(AbortSignal.timeout(1_000)), true)

  const forced = adapter({ timeoutMs: 80, cancelGraceMs: 40, terminateGraceMs: 40 }).run({
    cwd: process.cwd(),
    payload: { mode: 'ignore-cancel' },
  })
  await expectCode(forced, 'CLI_ADAPTER_TIMEOUT')
  const forcedOutcome = await latestHandle.done
  if (process.platform !== 'win32') assert.equal(forcedOutcome.signal, 'SIGKILL')
  assert.equal(await latestHandle.waitForExit(AbortSignal.timeout(1_000)), true)

  process.stdout.write(`${JSON.stringify({
    completed: completed.summary,
    protocolError: true,
    truncatedOutput: true,
    processError: true,
    gracefulCancel: true,
    forcedSignal: forcedOutcome.signal,
    treeExited: true,
  })}\n`)
} finally {
  await fiber.dispose()
}
