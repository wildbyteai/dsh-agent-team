import { DEFAULT_AGENT_POSITIONING } from './agent-role-policy.mjs'
import { createMissionPlan } from './mission-plan.mjs'
import { parseMissionRunSnapshot } from './mission-snapshot.mjs'
import { createRunProjectionStore } from './run-projection.mjs'

const DEMO_GOAL = '验证 DeepSeek 专家团的并行协作'

function createDemoPlan(sequence) {
  return createMissionPlan({
    id: `mission-demo-${sequence}`,
    goal: DEMO_GOAL,
    commanderId: 'deepseek',
    roster: {
      schemaVersion: 1,
      capturedAt: 'preview',
      agents: [
        {
          id: 'deepseek', availability: 'ready', supportLevel: 'core',
          positioning: DEFAULT_AGENT_POSITIONING.deepseek,
        },
        {
          id: 'claude-code', availability: 'detected', supportLevel: 'candidate',
          positioning: DEFAULT_AGENT_POSITIONING['claude-code'],
        },
        {
          id: 'codex', availability: 'detected', supportLevel: 'candidate',
          positioning: DEFAULT_AGENT_POSITIONING.codex,
        },
      ],
    },
    assignments: [
      {
        id: 'plan-options',
        title: '提出任务方案',
        agentId: 'claude-code',
        role: 'plan',
        mode: 'read',
        dependsOn: [],
      },
      {
        id: 'review-boundaries',
        title: '复审实现边界',
        agentId: 'codex',
        role: 'review',
        mode: 'read',
        dependsOn: [],
      },
      {
        id: 'synthesize-result',
        title: '汇总专家结论',
        agentId: 'deepseek',
        role: 'synthesize',
        mode: 'read',
        dependsOn: ['plan-options', 'review-boundaries'],
      },
    ],
  })
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
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

async function executeDemoAssignment(assignment, { signal }) {
  await delay(220, signal)
  return {
    summary: `[no-model demo] ${assignment.title}`,
    artifacts: [],
  }
}

/** Run one deterministic read-only expert-team preview without starting a Provider. */
export function createMissionRunService(options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  const executeAssignment = options.executeAssignment ?? executeDemoAssignment
  const projections = options.projections ?? createRunProjectionStore({ now })
  const onSnapshot = options.onSnapshot
  let sequence = 0
  let latestRunId
  let latestPromise = Promise.resolve()
  let transitionTail = Promise.resolve()
  let lifecycleTail = Promise.resolve()
  let persistenceFailure
  let activeRun
  const terminalStatuses = new Set(['completed', 'cancelled', 'failed', 'interrupted'])

  function snapshot() {
    return latestRunId === undefined ? undefined : projections.snapshot(latestRunId)
  }

  function isPersistenceFailure(error) {
    return persistenceFailure !== undefined && error === persistenceFailure
  }

  function queueTransition(createSnapshot) {
    const transition = transitionTail.then(async () => {
      if (persistenceFailure !== undefined) throw persistenceFailure
      const durable = createSnapshot()
      if (durable === undefined) return snapshot()
      if (onSnapshot !== undefined) {
        try {
          await onSnapshot(durable)
        } catch (error) {
          persistenceFailure = error instanceof Error ? error : new Error(String(error))
          throw persistenceFailure
        }
      }
      projections.restore(durable)
      latestRunId = durable.id
      return structuredClone(durable)
    })
    transitionTail = transition.then(() => undefined, () => undefined)
    return transition
  }

  function queueLifecycle(operation) {
    const lifecycle = lifecycleTail.then(operation)
    lifecycleTail = lifecycle.then(() => undefined, () => undefined)
    return lifecycle
  }

  function open(plan) {
    return queueTransition(() => {
      const staging = createRunProjectionStore({ now })
      staging.open(plan)
      return staging.snapshot(plan.id)
    })
  }

  function record(runId, event) {
    return queueTransition(() => {
      const current = projections.snapshot(runId)
      if (current === undefined) throw new Error(`unknown run: ${runId}`)
      if (terminalStatuses.has(current.status)) return undefined
      const staging = createRunProjectionStore({ now })
      staging.restore(current)
      staging.record(runId, event)
      return staging.snapshot(runId)
    })
  }

  async function drive(plan, controller, started) {
    const completed = new Set()
    let firstBatch = true
    while (completed.size < plan.assignments.length) {
      if (controller.signal.aborted) return
      const ready = plan.assignments.filter(assignment => (
        !completed.has(assignment.id)
        && assignment.dependsOn.every(dependency => completed.has(dependency))
      ))
      if (ready.length === 0) throw new Error('mission has unresolved assignment dependencies')

      const executions = []
      for (const assignment of ready) {
        await record(plan.id, {
          type: 'assignment.started',
          assignmentId: assignment.id,
          at: now(),
        })
        if (controller.signal.aborted) return
        executions.push((async () => {
          try {
            const result = await executeAssignment(assignment, { signal: controller.signal })
            if (controller.signal.aborted) return
            await record(plan.id, {
              type: 'assignment.completed',
              assignmentId: assignment.id,
              at: now(),
              summary: result.summary,
              artifacts: result.artifacts,
            })
            completed.add(assignment.id)
          } catch (error) {
            if (controller.signal.aborted) return
            if (isPersistenceFailure(error)) throw error
            try {
              await record(plan.id, {
                type: 'mission.failed',
                assignmentId: assignment.id,
                at: now(),
                error: errorMessage(error),
              })
            } finally {
              controller.abort(error)
            }
            throw error
          }
        })())
      }
      if (firstBatch) {
        firstBatch = false
        started.resolve()
      }
      await Promise.all(executions)
    }
    await record(plan.id, { type: 'mission.completed', at: now() })
  }

  async function settleDriveFailure(runId, controller, started, error) {
    started.reject(error)
    if (controller.signal.aborted) {
      if (isPersistenceFailure(error)) throw error
      return
    }
    if (isPersistenceFailure(error)) {
      controller.abort(error)
      throw error
    }
    try {
      await record(runId, {
        type: 'mission.failed',
        at: now(),
        error: errorMessage(error),
      })
    } catch (persistenceError) {
      controller.abort(persistenceError)
      throw persistenceError
    }
    controller.abort(error)
  }

  async function flush() {
    await transitionTail
    if (persistenceFailure !== undefined) throw persistenceFailure
  }

  return {
    restore(value) {
      if (activeRun !== undefined) throw new Error('cannot restore while a mission demo is running')
      const restored = parseMissionRunSnapshot(value)
      projections.restore(restored)
      latestRunId = restored.id
      const match = /^mission-demo-(\d+)$/.exec(restored.id)
      if (match !== null) sequence = Math.max(sequence, Number(match[1]))
      return snapshot()
    },

    startDemo() {
      return queueLifecycle(async () => {
        if (activeRun !== undefined) throw new Error('a mission demo is already running')
        if (persistenceFailure !== undefined) throw persistenceFailure
        const plan = createDemoPlan(++sequence)
        const controller = new AbortController()
        const started = deferred()
        const run = { id: plan.id, controller }
        activeRun = run
        try {
          await open(plan)
          await record(plan.id, { type: 'mission.started', at: now() })
          const promise = drive(plan, controller, started).catch(error => (
            settleDriveFailure(plan.id, controller, started, error)
          ))
          run.promise = promise
          latestPromise = promise.finally(() => {
            if (activeRun === run) activeRun = undefined
          })
          latestPromise.catch(() => {})
          await started.promise
          return snapshot()
        } catch (error) {
          controller.abort(error)
          if (activeRun === run) activeRun = undefined
          throw error
        }
      })
    },

    cancel() {
      return queueLifecycle(async () => {
        if (activeRun === undefined) {
          await flush()
          return snapshot()
        }
        const run = activeRun
        if (terminalStatuses.has(snapshot()?.status)) {
          await run.promise
          if (activeRun === run) activeRun = undefined
          return snapshot()
        }
        try {
          await record(run.id, { type: 'mission.cancelled', at: now() })
        } finally {
          run.controller.abort(new Error('mission demo cancelled'))
        }
        await run.promise
        if (activeRun === run) activeRun = undefined
        return snapshot()
      })
    },

    interrupt() {
      return queueLifecycle(async () => {
        if (activeRun === undefined) {
          await flush()
          return snapshot()
        }
        const run = activeRun
        if (terminalStatuses.has(snapshot()?.status)) {
          await run.promise
          if (activeRun === run) activeRun = undefined
          return snapshot()
        }
        try {
          await record(run.id, {
            type: 'mission.interrupted',
            at: now(),
            error: 'Host 停止时任务尚未完成，已安全标记为中断',
            assignmentError: 'Host 停止时节点仍未完成',
          })
        } finally {
          run.controller.abort(new Error('mission demo interrupted by Host shutdown'))
        }
        await run.promise
        if (activeRun === run) activeRun = undefined
        return snapshot()
      })
    },

    snapshot,

    flush,

    async wait() {
      await lifecycleTail
      await latestPromise
      await flush()
      return snapshot()
    },
  }
}
