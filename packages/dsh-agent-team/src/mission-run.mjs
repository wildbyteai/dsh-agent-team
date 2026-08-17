import { DEFAULT_AGENT_POSITIONING } from './agent-role-policy.mjs'
import { createMissionPlan } from './mission-plan.mjs'
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
  let sequence = 0
  let latestRunId
  let latestPromise = Promise.resolve()
  let activeRun

  function snapshot() {
    return latestRunId === undefined ? undefined : projections.snapshot(latestRunId)
  }

  async function drive(plan, controller) {
    const completed = new Set()
    while (completed.size < plan.assignments.length) {
      if (controller.signal.aborted) return
      const ready = plan.assignments.filter(assignment => (
        !completed.has(assignment.id)
        && assignment.dependsOn.every(dependency => completed.has(dependency))
      ))
      if (ready.length === 0) throw new Error('mission has unresolved assignment dependencies')

      await Promise.all(ready.map(async (assignment) => {
        projections.record(plan.id, {
          type: 'assignment.started',
          assignmentId: assignment.id,
          at: now(),
        })
        try {
          const result = await executeAssignment(assignment, { signal: controller.signal })
          if (controller.signal.aborted) return
          projections.record(plan.id, {
            type: 'assignment.completed',
            assignmentId: assignment.id,
            at: now(),
            summary: result.summary,
            artifacts: result.artifacts,
          })
          completed.add(assignment.id)
        } catch (error) {
          if (controller.signal.aborted) return
          projections.record(plan.id, {
            type: 'assignment.failed',
            assignmentId: assignment.id,
            at: now(),
            error: errorMessage(error),
          })
          throw error
        }
      }))
    }
    projections.record(plan.id, { type: 'mission.completed', at: now() })
  }

  return {
    startDemo() {
      if (activeRun !== undefined) throw new Error('a mission demo is already running')
      const plan = createDemoPlan(++sequence)
      const controller = new AbortController()
      latestRunId = plan.id
      projections.open(plan)
      projections.record(plan.id, { type: 'mission.started', at: now() })
      const promise = drive(plan, controller).catch((error) => {
        if (controller.signal.aborted) return
        projections.record(plan.id, {
          type: 'mission.failed',
          at: now(),
          error: errorMessage(error),
        })
        controller.abort(error)
      })
      activeRun = { id: plan.id, controller, promise }
      latestPromise = promise.finally(() => {
        if (activeRun?.id === plan.id) activeRun = undefined
      })
      return projections.snapshot(plan.id)
    },

    cancel() {
      if (activeRun === undefined) return snapshot()
      projections.record(activeRun.id, { type: 'mission.cancelled', at: now() })
      activeRun.controller.abort(new Error('mission demo cancelled'))
      return projections.snapshot(activeRun.id)
    },

    snapshot,

    async wait() {
      await latestPromise
      return snapshot()
    },
  }
}
