function progressOf(assignments) {
  return {
    completed: assignments.filter(assignment => assignment.state === 'completed').length,
    total: assignments.length,
  }
}

/** Create the in-memory projection seam consumed by the first Browser slice. */
export function createRunProjectionStore(options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  const runs = new Map()

  return {
    open(plan) {
      const openedAt = now()
      runs.set(plan.id, {
        schemaVersion: 1,
        id: plan.id,
        goal: plan.goal,
        strategy: plan.strategy,
        commanderId: plan.commanderId,
        status: 'planned',
        openedAt,
        updatedAt: openedAt,
        assignments: plan.assignments.map(assignment => ({
          ...assignment,
          dependsOn: [...assignment.dependsOn],
          summary: null,
          startedAt: null,
          finishedAt: null,
        })),
        progress: { completed: 0, total: plan.assignments.length },
        artifacts: [],
      })
    },

    record(runId, event) {
      const run = runs.get(runId)
      if (run === undefined) throw new Error(`unknown run: ${runId}`)

      if (event.type === 'mission.started') {
        run.status = 'running'
        run.updatedAt = event.at
        return
      }

      if (event.type !== 'assignment.started' && event.type !== 'assignment.completed') {
        throw new Error(`unsupported run event: ${event.type}`)
      }

      const assignment = run.assignments.find(candidate => candidate.id === event.assignmentId)
      if (assignment === undefined) throw new Error(`unknown assignment: ${event.assignmentId}`)

      if (event.type === 'assignment.started') {
        assignment.state = 'running'
        assignment.startedAt = event.at
      } else if (event.type === 'assignment.completed') {
        assignment.state = 'completed'
        assignment.summary = event.summary
        assignment.finishedAt = event.at
        run.artifacts.push(...event.artifacts)
      }
      run.updatedAt = event.at
      run.progress = progressOf(run.assignments)
    },

    snapshot(runId) {
      const run = runs.get(runId)
      if (run === undefined) return undefined
      return structuredClone(run)
    },
  }
}
