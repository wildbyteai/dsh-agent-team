import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import { MissionRunSnapshotSchema, parseMissionRunSnapshot } from './mission-snapshot.mjs'

const EMPTY_LEDGER = Object.freeze({
  schemaVersion: 1,
  latestRunId: null,
  runs: {},
})

const LedgerStateSchema = z.object({
  schemaVersion: z.literal(1),
  latestRunId: z.string().nullable(),
  runs: z.record(z.string(), MissionRunSnapshotSchema),
}).strict()

function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2))
  }
  return path
}

function parseLedgerState(value) {
  let state
  try {
    state = LedgerStateSchema.parse(value)
  } catch (error) {
    throw new TypeError('MissionLedger file contains an invalid mission snapshot', { cause: error })
  }
  if (state.latestRunId !== null && state.runs[state.latestRunId] === undefined) {
    throw new TypeError('MissionLedger latestRunId does not identify a stored mission snapshot')
  }
  for (const [runId, snapshot] of Object.entries(state.runs)) {
    if (snapshot.id !== runId) {
      throw new TypeError('MissionLedger run key does not match its mission snapshot id')
    }
  }
  return state
}

async function fsyncDirectory(directory) {
  if (process.platform === 'win32') return
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeAtomic(filename, value) {
  const directory = dirname(filename)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, filename)
    await fsyncDirectory(directory)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/** Store MissionRun snapshots in one owner-only, atomically replaced JSON ledger. */
export function createMissionLedger(options = {}) {
  if (options.filename !== undefined
    && (typeof options.filename !== 'string' || !isAbsolute(options.filename))) {
    throw new TypeError('MissionLedger filename must be an absolute path')
  }
  const configuredHome = options.dshHome
    ?? (options.env ?? process.env).DSH_HOME
  const dshHome = typeof configuredHome === 'string' && configuredHome.trim().length > 0
    ? expandHomePath(configuredHome)
    : join(homedir(), '.dsh')
  const filename = resolve(options.filename
    ?? join(dshHome, 'dsh-agent-team', 'v1', 'missions.json'))
  const now = options.now ?? (() => new Date().toISOString())
  let statePromise
  let writeTail = Promise.resolve()

  async function load() {
    try {
      return parseLedgerState(JSON.parse(await readFile(filename, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(EMPTY_LEDGER)
      throw error
    }
  }

  function ready() {
    statePromise ??= load()
    return statePromise
  }

  async function latest() {
    await writeTail
    const state = await ready()
    return state.latestRunId === null
      ? null
      : structuredClone(state.runs[state.latestRunId])
  }

  async function save(snapshot) {
    const durable = parseMissionRunSnapshot(snapshot)
    const write = writeTail.then(async () => {
      const state = await ready()
      const next = {
        schemaVersion: 1,
        latestRunId: durable.id,
        runs: { ...state.runs, [durable.id]: durable },
      }
      await writeAtomic(filename, next)
      statePromise = Promise.resolve(next)
    })
    writeTail = write.catch(() => {})
    await write
  }

  async function recoverLatest() {
    const current = await latest()
    if (current === null
      || current.status === 'completed'
      || current.status === 'cancelled'
      || current.status === 'failed'
      || current.status === 'interrupted') return current
    const interruptedAt = now()
    const terminalAssignmentStates = new Set([
      'completed', 'cancelled', 'failed', 'interrupted',
    ])
    const recovered = {
      ...current,
      status: 'interrupted',
      error: 'Host 重启前任务尚未完成，已安全标记为中断',
      updatedAt: interruptedAt,
      assignments: current.assignments.map(assignment => (
        terminalAssignmentStates.has(assignment.state)
          ? assignment
          : {
            ...assignment,
            state: 'interrupted',
            error: 'Host 重启时节点仍未完成',
            finishedAt: interruptedAt,
          }
      )),
    }
    await save(recovered)
    return recovered
  }

  async function close() {
    await writeTail
  }

  return { filename, latest, recoverLatest, save, close }
}
