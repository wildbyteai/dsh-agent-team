import assert from 'node:assert/strict'
import test from 'node:test'
import { createMissionRunService } from '../src/mission-run.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('MissionRun executes ready experts in parallel before DeepSeek synthesizes', async () => {
  const started = []
  const executions = new Map()
  const synthesisStarted = deferred()
  let clock = 0
  const service = createMissionRunService({
    now: () => `2026-08-17T13:00:0${clock++}.000Z`,
    executeAssignment(assignment) {
      started.push(assignment.id)
      if (assignment.id === 'synthesize-result') synthesisStarted.resolve()
      const execution = deferred()
      executions.set(assignment.id, execution)
      return execution.promise
    },
  })

  const initial = await service.startDemo()
  assert.equal(initial.status, 'running')
  assert.deepEqual(started, ['plan-options', 'review-boundaries'])
  assert.deepEqual(initial.assignments.map(assignment => ({
    id: assignment.id,
    state: assignment.state,
  })), [
    { id: 'plan-options', state: 'running' },
    { id: 'review-boundaries', state: 'running' },
    { id: 'synthesize-result', state: 'pending' },
  ])

  executions.get('plan-options').resolve({ summary: '已形成规划选项', artifacts: [] })
  await Promise.resolve()
  assert.deepEqual(started, ['plan-options', 'review-boundaries'])
  executions.get('review-boundaries').resolve({ summary: '已完成独立复审', artifacts: [] })
  await synthesisStarted.promise
  assert.deepEqual(started, ['plan-options', 'review-boundaries', 'synthesize-result'])

  executions.get('synthesize-result').resolve({ summary: 'DeepSeek 已汇总结论', artifacts: [] })
  const completed = await service.wait()
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.progress, { completed: 3, total: 3 })
  assert.deepEqual(completed.assignments.map(assignment => assignment.summary), [
    '已形成规划选项',
    '已完成独立复审',
    'DeepSeek 已汇总结论',
  ])
})

test('MissionRun cancellation settles active and pending assignments without completing later', async () => {
  let aborted = 0
  const service = createMissionRunService({
    now: () => '2026-08-17T13:10:00.000Z',
    executeAssignment(_assignment, { signal }) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted += 1
          reject(signal.reason)
        }, { once: true })
      })
    },
  })

  const { startDemo, cancel, wait } = service
  await startDemo()
  const cancelled = await cancel()
  assert.equal(cancelled.status, 'cancelled')
  assert.deepEqual(cancelled.assignments.map(assignment => assignment.state), [
    'cancelled', 'cancelled', 'cancelled',
  ])

  const settled = await wait()
  assert.equal(aborted, 2)
  assert.equal(settled.status, 'cancelled')
  assert.deepEqual(settled.progress, { completed: 0, total: 3 })
})

test('MissionRun reports a failed expert without completing dependent work', async () => {
  const service = createMissionRunService({
    now: () => '2026-08-17T13:20:00.000Z',
    async executeAssignment(assignment, { signal }) {
      if (assignment.id === 'review-boundaries') throw new Error('simulated review failure')
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
  })

  await service.startDemo()
  const failed = await service.wait()
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, 'simulated review failure')
  assert.deepEqual(failed.assignments.map(assignment => assignment.state), [
    'failed', 'failed', 'failed',
  ])
  assert.equal(
    failed.assignments.find(assignment => assignment.id === 'review-boundaries').error,
    'simulated review failure',
  )
})

test('MissionRun waits for its terminal snapshot to become durable', async () => {
  const durableSnapshots = []
  const service = createMissionRunService({
    now: () => '2026-08-17T15:20:00.000Z',
    async executeAssignment(assignment) {
      return { summary: `${assignment.id} completed`, artifacts: [] }
    },
    async onSnapshot(snapshot) {
      durableSnapshots.push(structuredClone(snapshot))
    },
  })

  await service.startDemo()
  const completed = await service.wait()

  assert.equal(completed.status, 'completed')
  assert.equal(durableSnapshots.at(-1).status, 'completed')
  assert.deepEqual(durableSnapshots.at(-1).progress, { completed: 3, total: 3 })
})

test('MissionRun restores the latest projection and continues its durable sequence', async () => {
  const service = createMissionRunService({
    now: () => '2026-08-17T15:30:00.000Z',
    async executeAssignment(assignment) {
      return { summary: `${assignment.id} completed`, artifacts: [] }
    },
  })
  const restored = {
    schemaVersion: 1,
    id: 'mission-demo-7',
    goal: '上次未完成任务',
    strategy: 'expert-team',
    commanderId: 'deepseek',
    status: 'interrupted',
    error: 'Host 重启前任务尚未完成，已安全标记为中断',
    openedAt: '2026-08-17T15:00:00.000Z',
    updatedAt: '2026-08-17T15:10:00.000Z',
    assignments: [{
      id: 'read-only-check',
      title: '读取并验证',
      agentId: 'codex',
      role: 'review',
      mode: 'read',
      dependsOn: [],
      state: 'interrupted',
      summary: null,
      error: 'Host 重启时节点仍未完成',
      startedAt: '2026-08-17T15:00:01.000Z',
      finishedAt: '2026-08-17T15:10:00.000Z',
    }],
    progress: { completed: 0, total: 1 },
    artifacts: [],
  }

  service.restore(restored)
  assert.deepEqual(service.snapshot(), restored)
  assert.equal((await service.startDemo()).id, 'mission-demo-8')
  await service.wait()
})

test('MissionRun keeps memory at the last durable snapshot after persistence fails', async () => {
  const failure = new Error('simulated ledger failure')
  let attempts = 0
  let durable
  const service = createMissionRunService({
    now: () => '2026-08-17T15:40:00.000Z',
    async onSnapshot(snapshot) {
      attempts += 1
      if (attempts === 2) throw failure
      durable = structuredClone(snapshot)
    },
  })

  await assert.rejects(service.startDemo(), failure)
  assert.equal(durable.status, 'planned')
  assert.deepEqual(service.snapshot(), durable)
  assert.equal(attempts, 2)

  await assert.rejects(service.flush(), failure)
  await assert.rejects(service.startDemo(), failure)
  assert.deepEqual(service.snapshot(), durable)
  assert.equal(attempts, 2)
})

test('MissionRun marks Host shutdown as interrupted instead of user cancellation', async () => {
  let aborted = 0
  const service = createMissionRunService({
    now: () => '2026-08-17T15:50:00.000Z',
    executeAssignment(_assignment, { signal }) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted += 1
          reject(signal.reason)
        }, { once: true })
      })
    },
  })

  await service.startDemo()
  const interrupted = await service.interrupt()
  assert.equal(interrupted.status, 'interrupted')
  assert.equal(interrupted.error, 'Host 停止时任务尚未完成，已安全标记为中断')
  assert.deepEqual(interrupted.assignments.map(assignment => assignment.state), [
    'interrupted', 'interrupted', 'interrupted',
  ])

  const settled = await service.wait()
  assert.equal(aborted, 2)
  assert.equal(settled.status, 'interrupted')
})

test('MissionRun preserves user cancellation across immediate shutdown and rerun', async () => {
  const service = createMissionRunService({
    now: () => '2026-08-17T16:00:00.000Z',
    executeAssignment(_assignment, { signal }) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
  })

  await service.startDemo()
  const cancelled = await service.cancel()
  assert.equal(cancelled.status, 'cancelled')
  assert.equal((await service.interrupt()).status, 'cancelled')

  const restarted = await service.startDemo()
  assert.equal(restarted.id, 'mission-demo-2')
  await service.cancel()
})

test('MissionRun does not let concurrent cancellation overwrite durable completion', async () => {
  const completing = deferred()
  const releaseCompletion = deferred()
  const service = createMissionRunService({
    now: () => '2026-08-17T16:10:00.000Z',
    async executeAssignment(assignment) {
      return { summary: `${assignment.id} completed`, artifacts: [] }
    },
    async onSnapshot(snapshot) {
      if (snapshot.status !== 'completed') return
      completing.resolve()
      await releaseCompletion.promise
    },
  })

  await service.startDemo()
  await completing.promise
  const cancelling = service.cancel()
  releaseCompletion.resolve()

  const completed = await cancelling
  assert.equal(completed.status, 'completed')
  assert.equal((await service.wait()).status, 'completed')
})

test('MissionRun does not let concurrent shutdown overwrite durable failure', async () => {
  const failing = deferred()
  const releaseFailure = deferred()
  const service = createMissionRunService({
    now: () => '2026-08-17T16:20:00.000Z',
    async executeAssignment(assignment, { signal }) {
      if (assignment.id === 'review-boundaries') throw new Error('simulated review failure')
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
    async onSnapshot(snapshot) {
      if (snapshot.status !== 'failed') return
      failing.resolve()
      await releaseFailure.promise
    },
  })

  await service.startDemo()
  await failing.promise
  const interrupting = service.interrupt()
  releaseFailure.resolve()

  const failed = await interrupting
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, 'simulated review failure')
  assert.equal((await service.wait()).status, 'failed')
})

test('MissionRun does not let late completion overwrite durable cancellation', async () => {
  const finalAssignmentCompleting = deferred()
  const releaseFinalAssignment = deferred()
  const service = createMissionRunService({
    now: () => '2026-08-17T16:30:00.000Z',
    async executeAssignment(assignment) {
      return { summary: `${assignment.id} completed`, artifacts: [] }
    },
    async onSnapshot(snapshot) {
      if (snapshot.status !== 'running' || snapshot.progress.completed !== 3) return
      finalAssignmentCompleting.resolve()
      await releaseFinalAssignment.promise
    },
  })

  await service.startDemo()
  await finalAssignmentCompleting.promise
  const cancelling = service.cancel()
  releaseFinalAssignment.resolve()

  const cancelled = await cancelling
  assert.equal(cancelled.status, 'cancelled')
  assert.equal((await service.wait()).status, 'cancelled')
})
