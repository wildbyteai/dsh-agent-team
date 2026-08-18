import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import test from 'node:test'
import { createJsonCliAdapter } from '../src/cli-adapter.mjs'

function fakeChild(options = {}) {
  const closed = deferred()
  const writes = []
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      writes.push(chunk.toString())
      if (options.hangWrite === true) return
      callback()
      closed.resolve(outcome)
    },
  })
  const stdout = options.stdout ?? '{"schemaVersion":1,"summary":"完成","artifacts":[]}\n'
  const stderr = options.stderr ?? ''
  const outcome = options.outcome ?? { exitCode: 0, signal: null }
  return {
    writes,
    handle: {
      pid: 321,
      stdin,
      stdout: undefined,
      stderr: undefined,
      collected: {
        stdout: {
          readFrom: () => {
            if (options.stdoutReadError !== undefined) throw options.stdoutReadError
            if (options.stdoutResult !== undefined) return options.stdoutResult
            return {
              text: stdout,
              nextOffset: stdout.length,
              lossy: options.stdoutLossy ?? false,
            }
          },
        },
        stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
      },
      done: 'done' in options ? options.done : closed.promise,
      terminate() {},
      async waitForExit() {
        if (options.waitForExitError !== undefined) throw options.waitForExitError
        return true
      },
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function controlledChild(options = {}) {
  const closed = deferred()
  const runReceived = deferred()
  const writes = []
  let settled = false
  let terminateCalls = 0
  function exit(outcome) {
    if (settled) return
    settled = true
    closed.resolve(outcome)
  }
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      const line = chunk.toString()
      writes.push(line)
      const message = JSON.parse(line)
      if (message.type === 'run' && options.failRunWrite === true) {
        callback(new Error('simulated stdin failure'))
        return
      }
      if (message.type === 'run') runReceived.resolve()
      if (message.type === 'run' && options.hangRunWrite === true) return
      if (message.type === 'cancel' && options.exitOnCancel !== false) {
        exit({ exitCode: 0, signal: null })
      }
      callback()
    },
  })
  return {
    writes,
    runReceived,
    get terminateCalls() { return terminateCalls },
    handle: {
      pid: 654,
      stdin,
      stdout: undefined,
      stderr: undefined,
      collected: {
        stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
        stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      },
      done: closed.promise,
      terminate() {
        terminateCalls += 1
        if (options.exitOnTerminate !== false) {
          exit({ exitCode: null, signal: 'SIGTERM' })
        }
      },
      async waitForExit(signal) {
        if (options.waitForExitError !== undefined) throw options.waitForExitError
        if (settled) return true
        return new Promise((resolve) => {
          const onAbort = () => {
            signal?.removeEventListener('abort', onAbort)
            resolve(false)
          }
          signal?.addEventListener('abort', onAbort, { once: true })
          closed.promise.then(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve(true)
          })
        })
      },
    },
  }
}

function failAfter(milliseconds) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('test timed out waiting for adapter settlement')), milliseconds)
  })
}

test('JSON CLI adapter returns only a validated result envelope', async () => {
  const child = fakeChild()
  let spawnSpec
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent', '--jsonl'],
    spawn(spec) {
      spawnSpec = spec
      return child.handle
    },
  })

  const result = await adapter.run({
    cwd: '/workspace',
    payload: { assignmentId: 'review-boundaries', role: 'review' },
  })

  assert.deepEqual(result, { schemaVersion: 1, summary: '完成', artifacts: [] })
  assert.deepEqual(spawnSpec.argv, ['/absolute/fake-agent', '--jsonl'])
  assert.equal(spawnSpec.cwd, '/workspace')
  assert.deepEqual(spawnSpec.stdio, {
    stdin: 'pipe',
    stdout: { maxBytes: 262_144 },
    stderr: { maxBytes: 65_536 },
  })
  assert.equal(spawnSpec.graceMs, 3_000)
  assert.equal(spawnSpec.signal, undefined)
  assert.deepEqual(JSON.parse(child.writes[0]), {
    protocolVersion: 1,
    type: 'run',
    request: { assignmentId: 'review-boundaries', role: 'review' },
  })
})

test('JSON CLI adapter serializes the run request once before spawning', async () => {
  const child = fakeChild()
  let serializationCalls = 0
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  const result = await adapter.run({
    cwd: '/workspace',
    payload: {
      toJSON() {
        serializationCalls += 1
        if (serializationCalls > 1) throw new Error('secret payload diagnostic')
        return { assignmentId: 'plan-options' }
      },
    },
  })

  assert.equal(result.summary, '完成')
  assert.equal(serializationCalls, 1)
})

test('JSON CLI adapter classifies request serialization failure before spawning', async () => {
  const payload = {}
  payload.circular = payload
  let spawnCalls = 0
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn() {
      spawnCalls += 1
      return fakeChild().handle
    },
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload }),
    error => error.code === 'CLI_ADAPTER_PROTOCOL' && error.cause === undefined,
  )
  assert.equal(spawnCalls, 0)
})

test('JSON CLI adapter rejects invalid JSON without echoing provider output', async () => {
  const child = fakeChild({ stdout: 'not-json secret-provider-output\n' })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: { assignmentId: 'plan-options' } }),
    error => (
      error.code === 'CLI_ADAPTER_PROTOCOL'
      && !error.message.includes('secret-provider-output')
      && error.cause === undefined
    ),
  )
})

test('JSON CLI adapter rejects schema violations and truncated stdout', async () => {
  for (const child of [
    fakeChild({ stdout: '{"schemaVersion":1,"summary":"完成","artifacts":[],"status":"completed"}\n' }),
    fakeChild({ stdoutLossy: true }),
  ]) {
    const adapter = createJsonCliAdapter({
      id: 'fake-agent',
      argv: ['/absolute/fake-agent'],
      spawn: () => child.handle,
    })
    await assert.rejects(
      adapter.run({ cwd: '/workspace', payload: {} }),
      error => error.code === 'CLI_ADAPTER_PROTOCOL',
    )
  }
})

test('JSON CLI adapter classifies collector failure without exposing raw diagnostics', async () => {
  const child = fakeChild({ stdoutReadError: new Error('secret collector diagnostic') })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => (
      error.code === 'CLI_ADAPTER_PROCESS'
      && !error.message.includes('secret collector diagnostic')
      && error.cause === undefined
    ),
  )
})

test('JSON CLI adapter reads collector fields only once', async () => {
  let lossyReads = 0
  const child = fakeChild({
    stdoutResult: {
      text: '{"schemaVersion":1,"summary":"完成","artifacts":[]}\n',
      get lossy() {
        lossyReads += 1
        if (lossyReads > 1) throw new Error('secret lossy getter diagnostic')
        return false
      },
    },
  })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  const result = await adapter.run({ cwd: '/workspace', payload: {} })

  assert.equal(result.summary, '完成')
  assert.equal(lossyReads, 1)
})

test('JSON CLI adapter reads process outcome fields only once', async () => {
  let exitCodeReads = 0
  let signalReads = 0
  const child = fakeChild({
    outcome: {
      get exitCode() {
        exitCodeReads += 1
        if (exitCodeReads > 1) throw new Error('secret exit getter diagnostic')
        return 17
      },
      get signal() {
        signalReads += 1
        if (signalReads > 1) throw new Error('secret signal getter diagnostic')
        return null
      },
    },
  })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => error.code === 'CLI_ADAPTER_PROCESS' && error.exitCode === 17,
  )
  assert.equal(exitCodeReads, 1)
  assert.equal(signalReads, 1)
})

test('JSON CLI adapter classifies non-zero exit without leaking stderr', async () => {
  const child = fakeChild({
    stderr: 'secret-provider-diagnostic\n',
    outcome: { exitCode: 17, signal: null },
  })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => (
      error.code === 'CLI_ADAPTER_PROCESS'
      && error.exitCode === 17
      && error.signal === null
      && !error.message.includes('secret-provider-diagnostic')
    ),
  )
})

test('JSON CLI adapter sends protocol cancellation before terminating the process tree', async () => {
  const child = controlledChild()
  const controller = new AbortController()
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    cancelGraceMs: 20,
  })

  const running = adapter.run({
    cwd: '/workspace',
    payload: { assignmentId: 'plan-options' },
    signal: controller.signal,
  })
  await child.runReceived.promise
  controller.abort(new Error('secret caller reason'))

  await assert.rejects(
    Promise.race([running, failAfter(100)]),
    error => (
      error.code === 'CLI_ADAPTER_CANCELLED'
      && !error.message.includes('secret caller reason')
    ),
  )
  assert.deepEqual(child.writes.map(line => JSON.parse(line).type), ['run', 'cancel'])
  assert.equal(child.terminateCalls, 0)
})

test('JSON CLI adapter times out and escalates an ignored cancel to tree termination', async () => {
  const child = controlledChild({ exitOnCancel: false })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    timeoutMs: 10,
    cancelGraceMs: 10,
    terminateGraceMs: 10,
  })

  const running = adapter.run({
    cwd: '/workspace',
    payload: { assignmentId: 'review-boundaries' },
  })

  await assert.rejects(
    Promise.race([running, failAfter(200)]),
    error => error.code === 'CLI_ADAPTER_TIMEOUT' && error.timeoutMs === 10,
  )
  assert.deepEqual(child.writes.map(line => JSON.parse(line).type), ['run', 'cancel'])
  assert.equal(child.terminateCalls, 1)
})

test('JSON CLI adapter terminates a spawned tree when the initial protocol write fails', async () => {
  const child = controlledChild({ failRunWrite: true })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    cancelGraceMs: 10,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => error.code === 'CLI_ADAPTER_PROCESS',
  )
  assert.equal(child.terminateCalls, 1)
})

test('JSON CLI adapter classifies spawn failure without exposing raw diagnostics', async () => {
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn() {
      throw new Error('secret spawn path diagnostic')
    },
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => (
      error.code === 'CLI_ADAPTER_PROCESS'
      && !error.message.includes('secret spawn path diagnostic')
      && error.cause === undefined
    ),
  )
})

test('JSON CLI adapter classifies even an undefined subprocess rejection', async () => {
  const child = fakeChild({ done: Promise.reject(undefined) })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => error.code === 'CLI_ADAPTER_PROCESS',
  )
})

test('JSON CLI adapter classifies process-tree quiescence failure', async () => {
  const child = fakeChild({ waitForExitError: new Error('secret inspector diagnostic') })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => (
      error.code === 'CLI_ADAPTER_TERMINATION'
      && !error.message.includes('secret inspector diagnostic')
      && error.cause === undefined
    ),
  )
})

test('JSON CLI adapter deadline covers a hung initial protocol write', async () => {
  const child = controlledChild({ hangRunWrite: true, exitOnCancel: false })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    timeoutMs: 10,
    cancelGraceMs: 10,
    terminateGraceMs: 10,
  })

  await assert.rejects(
    Promise.race([
      adapter.run({ cwd: '/workspace', payload: {} }),
      failAfter(200),
    ]),
    error => error.code === 'CLI_ADAPTER_TIMEOUT',
  )
  assert.equal(child.terminateCalls, 1)
})

test('JSON CLI adapter cancellation covers a hung initial protocol write', async () => {
  const child = controlledChild({ hangRunWrite: true, exitOnCancel: false })
  const controller = new AbortController()
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    cancelGraceMs: 10,
    terminateGraceMs: 10,
  })

  const running = adapter.run({ cwd: '/workspace', payload: {}, signal: controller.signal })
  await child.runReceived.promise
  controller.abort()

  await assert.rejects(
    Promise.race([running, failAfter(200)]),
    error => error.code === 'CLI_ADAPTER_CANCELLED',
  )
  assert.equal(child.terminateCalls, 1)
})

test('JSON CLI adapter reports cancellation cleanup failure without waiting for done', async () => {
  const child = controlledChild({
    exitOnCancel: false,
    waitForExitError: new Error('secret termination diagnostic'),
  })
  const controller = new AbortController()
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    cancelGraceMs: 10,
  })

  const running = adapter.run({ cwd: '/workspace', payload: {}, signal: controller.signal })
  await child.runReceived.promise
  controller.abort()

  await assert.rejects(
    Promise.race([running, failAfter(200)]),
    error => (
      error.code === 'CLI_ADAPTER_TERMINATION'
      && !error.message.includes('secret termination diagnostic')
    ),
  )
})

test('JSON CLI adapter bounds termination confirmation after an ignored cancel', async () => {
  const child = controlledChild({ exitOnCancel: false, exitOnTerminate: false })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    timeoutMs: 10,
    cancelGraceMs: 10,
    terminateGraceMs: 10,
  })

  await assert.rejects(
    Promise.race([
      adapter.run({ cwd: '/workspace', payload: {} }),
      failAfter(200),
    ]),
    error => error.code === 'CLI_ADAPTER_TERMINATION',
  )
  assert.equal(child.terminateCalls, 1)
})

test('JSON CLI adapter rejects output when the run write was never confirmed', async () => {
  const child = fakeChild({
    hangWrite: true,
    done: Promise.resolve({ exitCode: 0, signal: null }),
  })
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => child.handle,
    timeoutMs: 10,
    cancelGraceMs: 10,
    terminateGraceMs: 10,
  })

  await assert.rejects(
    Promise.race([
      adapter.run({ cwd: '/workspace', payload: {} }),
      failAfter(200),
    ]),
    error => error.code === 'CLI_ADAPTER_TIMEOUT',
  )
})

test('JSON CLI adapter classifies an incomplete subprocess handle', async () => {
  const adapter = createJsonCliAdapter({
    id: 'fake-agent',
    argv: ['/absolute/fake-agent'],
    spawn: () => null,
  })

  await assert.rejects(
    adapter.run({ cwd: '/workspace', payload: {} }),
    error => error.code === 'CLI_ADAPTER_PROCESS',
  )
})
