import { z } from 'zod'

const MAX_TIMER_DELAY_MS = 2_147_483_647

export const CliResultEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  summary: z.string().min(1),
  artifacts: z.array(z.string()),
}).strict()

export class CliAdapterError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'CliAdapterError'
    this.code = code
    if ('exitCode' in options) this.exitCode = options.exitCode
    if ('signal' in options) this.signal = options.signal
    if ('timeoutMs' in options) this.timeoutMs = options.timeoutMs
  }
}

function assertPositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`)
  }
}

function assertDuration(name, value) {
  assertPositive(name, value)
  if (value > MAX_TIMER_DELAY_MS) {
    throw new TypeError(`${name} must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

function writeText(stream, text) {
  return new Promise((resolve, reject) => {
    let settled = false
    const onError = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    stream.once('error', onError)
    try {
      stream.write(text, 'utf8', (error) => {
        if (error) {
          if (!settled) {
            settled = true
            reject(error)
          }
          return
        }
        if (settled) return
        settled = true
        stream.removeListener('error', onError)
        resolve()
      })
    } catch (error) {
      stream.removeListener('error', onError)
      settled = true
      reject(error)
    }
  })
}

function writeLineBestEffort(stream, value) {
  const line = `${JSON.stringify(value)}\n`
  const onError = () => {}
  stream.once('error', onError)
  try {
    stream.write(line, 'utf8', (error) => {
      if (error === undefined || error === null) stream.removeListener('error', onError)
    })
  } catch {
    stream.removeListener('error', onError)
  }
}

async function waitForExitWithin(child, milliseconds) {
  const controller = new AbortController()
  let timer
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, milliseconds)
  })
  const exited = Promise.resolve().then(() => child.waitForExit(controller.signal))
  try {
    return await Promise.race([exited, deadline])
  } finally {
    clearTimeout(timer)
  }
}

async function terminateProcessTree(child, graceMs) {
  child.terminate()
  if (!await waitForExitWithin(child, graceMs)) {
    throw new Error('process tree did not exit after termination')
  }
}

async function quiesceProcessTree(child, cancelGraceMs, terminateGraceMs) {
  if (await waitForExitWithin(child, cancelGraceMs)) return
  await terminateProcessTree(child, terminateGraceMs)
}

function isManagedChild(child) {
  return child !== null
    && typeof child === 'object'
    && child.stdin !== null
    && typeof child.stdin === 'object'
    && typeof child.stdin.once === 'function'
    && typeof child.stdin.removeListener === 'function'
    && typeof child.stdin.write === 'function'
    && typeof child.stdin.end === 'function'
    && child.collected !== null
    && typeof child.collected === 'object'
    && child.collected.stdout !== null
    && typeof child.collected.stdout === 'object'
    && typeof child.collected.stdout.readFrom === 'function'
    && child.collected.stderr !== null
    && typeof child.collected.stderr === 'object'
    && typeof child.collected.stderr.readFrom === 'function'
    && child.done !== null
    && typeof child.done === 'object'
    && typeof child.done.then === 'function'
    && typeof child.terminate === 'function'
    && typeof child.waitForExit === 'function'
}

function endStdin(stream) {
  try {
    stream.end()
  } catch {
    // Process settlement and tree ownership below remain authoritative.
  }
}

/** Run one fixed local CLI over a small JSON-lines proposal protocol. */
export function createJsonCliAdapter(options) {
  if (typeof options?.id !== 'string' || options.id.trim().length === 0) {
    throw new TypeError('CLI adapter id must be a non-empty string')
  }
  if (!Array.isArray(options.argv)
    || options.argv.length === 0
    || options.argv.some(part => typeof part !== 'string' || part.length === 0)) {
    throw new TypeError('CLI adapter argv must contain non-empty strings')
  }
  if (typeof options.spawn !== 'function') {
    throw new TypeError('CLI adapter spawn must be a function')
  }
  const argv = Object.freeze([...options.argv])
  const stdoutMaxBytes = options.stdoutMaxBytes ?? 262_144
  const stderrMaxBytes = options.stderrMaxBytes ?? 65_536
  const timeoutMs = options.timeoutMs ?? 30_000
  const cancelGraceMs = options.cancelGraceMs ?? 500
  const terminateGraceMs = options.terminateGraceMs ?? 3_000
  assertPositive('CLI adapter stdoutMaxBytes', stdoutMaxBytes)
  assertPositive('CLI adapter stderrMaxBytes', stderrMaxBytes)
  assertDuration('CLI adapter timeoutMs', timeoutMs)
  assertDuration('CLI adapter cancelGraceMs', cancelGraceMs)
  assertDuration('CLI adapter terminateGraceMs', terminateGraceMs)
  const terminationWaitMs = Math.min(
    MAX_TIMER_DELAY_MS,
    terminateGraceMs + Math.max(terminateGraceMs, 50),
  )

  return Object.freeze({
    id: options.id,

    async run(request) {
      if (request.signal?.aborted) {
        throw new CliAdapterError(
          'CLI_ADAPTER_CANCELLED',
          `CLI adapter ${options.id} request was cancelled before startup`,
        )
      }
      const serialized = {
        protocolVersion: 1,
        type: 'run',
        request: request.payload,
      }
      let serializedLine
      try {
        serializedLine = `${JSON.stringify(serialized)}\n`
      } catch {
        throw new CliAdapterError(
          'CLI_ADAPTER_PROTOCOL',
          `CLI adapter ${options.id} request could not be serialized`,
        )
      }
      let child
      try {
        child = options.spawn({
          argv,
          cwd: request.cwd,
          stdio: {
            stdin: 'pipe',
            stdout: { maxBytes: stdoutMaxBytes },
            stderr: { maxBytes: stderrMaxBytes },
          },
          graceMs: terminateGraceMs,
          signal: undefined,
          env: request.env,
        })
      } catch {
        throw new CliAdapterError(
          'CLI_ADAPTER_PROCESS',
          `CLI adapter ${options.id} process could not be started`,
        )
      }
      let completeChild = false
      try {
        completeChild = isManagedChild(child)
      } catch {
        completeChild = false
      }
      if (!completeChild) {
        try {
          if (child !== null && typeof child === 'object') {
            if (child.done !== null
              && typeof child.done === 'object'
              && typeof child.done.then === 'function') {
              Promise.resolve(child.done).catch(() => {})
            }
            if (child.stdin !== null
              && typeof child.stdin === 'object'
              && typeof child.stdin.end === 'function') {
              endStdin(child.stdin)
            }
            if (typeof child.terminate === 'function'
              && typeof child.waitForExit === 'function') {
              await terminateProcessTree(child, terminationWaitMs)
            } else if (typeof child.terminate === 'function') {
              child.terminate()
            }
          }
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_TERMINATION',
            `CLI adapter ${options.id} incomplete process handle could not be stopped`,
          )
        }
        throw new CliAdapterError(
          'CLI_ADAPTER_PROCESS',
          `CLI adapter ${options.id} received an incomplete subprocess handle`,
        )
      }

      const doneObserved = Promise.resolve(child.done).then(
        outcome => ({ type: 'done', outcome }),
        () => ({ type: 'done-rejected' }),
      )
      let resolveCancellation
      const cancellationObserved = new Promise((resolve) => {
        resolveCancellation = resolve
      })
      let cancellationError
      const requestCancellation = (kind) => {
        if (cancellationError !== undefined) return
        const timedOut = kind === 'timeout'
        cancellationError = new CliAdapterError(
          timedOut ? 'CLI_ADAPTER_TIMEOUT' : 'CLI_ADAPTER_CANCELLED',
          timedOut
            ? `CLI adapter ${options.id} exceeded its deadline`
            : `CLI adapter ${options.id} request was cancelled`,
          timedOut ? { timeoutMs } : undefined,
        )
        resolveCancellation({ type: 'cancelled' })
      }
      const onAbort = () => requestCancellation('cancelled')
      request.signal?.addEventListener('abort', onAbort, { once: true })
      if (request.signal?.aborted) requestCancellation('cancelled')
      const timeout = setTimeout(() => requestCancellation('timeout'), timeoutMs)
      let observingCancellation = true
      const stopObservingCancellation = () => {
        if (!observingCancellation) return
        observingCancellation = false
        clearTimeout(timeout)
        request.signal?.removeEventListener('abort', onAbort)
      }

      try {
        const writeObserved = writeText(child.stdin, serializedLine).then(
          () => ({ type: 'written' }),
          () => ({ type: 'write-rejected' }),
        )
        let event = await Promise.race([writeObserved, doneObserved, cancellationObserved])
        let writeEvent = event
        if (event.type === 'done' || event.type === 'done-rejected') {
          writeEvent = await Promise.race([writeObserved, cancellationObserved])
        } else if (event.type === 'written') {
          event = await Promise.race([doneObserved, cancellationObserved])
        }
        if (cancellationError !== undefined
          || event.type === 'cancelled'
          || writeEvent.type === 'cancelled') {
          stopObservingCancellation()
          writeLineBestEffort(child.stdin, { protocolVersion: 1, type: 'cancel' })
          try {
            await quiesceProcessTree(child, cancelGraceMs, terminationWaitMs)
          } catch {
            throw new CliAdapterError(
              'CLI_ADAPTER_TERMINATION',
              `CLI adapter ${options.id} process tree could not be terminated`,
            )
          }
          throw cancellationError
        }
        if (writeEvent.type === 'write-rejected') {
          stopObservingCancellation()
          endStdin(child.stdin)
          try {
            await terminateProcessTree(child, terminationWaitMs)
          } catch {
            throw new CliAdapterError(
              'CLI_ADAPTER_TERMINATION',
              `CLI adapter ${options.id} startup failed and its process tree did not stop`,
            )
          }
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} could not write its run request`,
          )
        }
        stopObservingCancellation()
        try {
          await quiesceProcessTree(child, cancelGraceMs, terminationWaitMs)
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_TERMINATION',
            `CLI adapter ${options.id} process tree did not become quiescent`,
          )
        }
        if (event.type === 'done-rejected') {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} process failed to start or settle`,
          )
        }
        const outcome = event.outcome
        if (outcome === null || typeof outcome !== 'object') {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} process returned an invalid outcome`,
          )
        }
        let exitCode
        let exitSignal
        try {
          exitCode = outcome.exitCode
          exitSignal = outcome.signal
          if ((!Number.isInteger(exitCode) && exitCode !== null)
            || (typeof exitSignal !== 'string' && exitSignal !== null)) {
            throw new TypeError('invalid process outcome')
          }
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} process returned an invalid outcome`,
          )
        }
        if (exitCode !== 0 || exitSignal !== null) {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} process exited unsuccessfully`,
            { exitCode, signal: exitSignal },
          )
        }
        let stdoutText
        let stdoutLossy
        try {
          const stdout = child.collected.stdout.readFrom(0)
          if (stdout === null
            || typeof stdout !== 'object') {
            throw new TypeError('invalid stdout collector result')
          }
          stdoutText = stdout.text
          stdoutLossy = stdout.lossy
          if (typeof stdoutText !== 'string' || typeof stdoutLossy !== 'boolean') {
            throw new TypeError('invalid stdout collector result')
          }
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROCESS',
            `CLI adapter ${options.id} stdout could not be collected`,
          )
        }
        if (stdoutLossy) {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROTOCOL',
            `CLI adapter ${options.id} stdout was truncated`,
          )
        }
        let value
        try {
          value = JSON.parse(stdoutText.trim())
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROTOCOL',
            `CLI adapter ${options.id} returned invalid JSON`,
          )
        }
        try {
          return CliResultEnvelopeSchema.parse(value)
        } catch {
          throw new CliAdapterError(
            'CLI_ADAPTER_PROTOCOL',
            `CLI adapter ${options.id} returned an invalid result envelope`,
          )
        }
      } finally {
        stopObservingCancellation()
        endStdin(child.stdin)
      }
    },
  })
}
