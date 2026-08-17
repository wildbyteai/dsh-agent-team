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

  const initial = service.startDemo()
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
  startDemo()
  const cancelled = cancel()
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

  service.startDemo()
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
