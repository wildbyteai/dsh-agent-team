import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBrowserHarness,
  findNodes,
  missionSnapshot,
  standardRosterResponse,
  textOf,
} from './browser-harness.mjs'

function action(view, name) {
  return findNodes(view, node => (
    node.type === 'button' && node.props['data-action'] === name
  ))[0]
}

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

test('Browser remote contract requires startDemo to return a mission snapshot', async () => {
  const harness = await createBrowserHarness()
  const descriptors = harness.remoteMounts[0].descriptors
  const startDemo = descriptors.find(descriptor => descriptor.method === 'startDemo')
  const missionSnapshotDescriptor = descriptors.find(
    descriptor => descriptor.method === 'missionSnapshot',
  )

  assert.throws(() => startDemo.result.schema.parse(null), /snapshot is required/)
  assert.equal(missionSnapshotDescriptor.result.schema.parse(null), null)
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()
  await harness.ctx.dispose()
})

test('Browser mission view starts and follows the no-model expert-team demo', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  const emptyView = harness.renderMission()
  assert.match(textOf(emptyView), /无模型演示/)
  const startButton = action(emptyView, 'start-demo')
  assert.ok(startButton)

  harness.startDemoResponses.push({ ok: true, value: missionSnapshot() })
  await startButton.props.onClick()
  const runningText = textOf(harness.renderMission())
  assert.match(runningText, /验证 DeepSeek 专家团的并行协作/)
  assert.match(runningText, /Claude Code/)
  assert.match(runningText, /Codex/)
  assert.match(runningText, /运行中/)
  assert.match(runningText, /0 \/ 3/)
  assert.equal(harness.activeIntervalCount(), 1)

  const completedAssignments = missionSnapshot().assignments.map(assignment => ({
    ...assignment,
    state: 'completed',
    summary: `${assignment.title}已完成`,
    finishedAt: '2026-08-17T13:00:03.000Z',
  }))
  harness.missionResponses.push({
    ok: true,
    value: missionSnapshot({
      status: 'completed',
      updatedAt: '2026-08-17T13:00:03.000Z',
      assignments: completedAssignments,
      progress: { completed: 3, total: 3 },
    }),
  })
  await harness.tickIntervals()

  const completedText = textOf(harness.renderMission())
  assert.match(completedText, /已完成/)
  assert.match(completedText, /3 \/ 3/)
  assert.match(completedText, /汇总专家结论已完成/)
  assert.equal(harness.activeIntervalCount(), 0)
  await harness.ctx.dispose()
})

test('Browser mission view disables repeated starts while Host is answering', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()
  const pendingStart = deferred()
  harness.startDemoResponses.push(pendingStart.promise)

  const starting = action(harness.renderMission(), 'start-demo').props.onClick()
  const startingButton = action(harness.renderMission(), 'start-demo')
  assert.equal(startingButton.props.disabled, true)
  assert.match(textOf(startingButton), /正在启动/)

  pendingStart.resolve({ ok: true, value: missionSnapshot() })
  await starting
  assert.equal(harness.activeIntervalCount(), 1)
  await harness.ctx.dispose()
})

test('Browser mission view resumes polling a running Host mission after reconnect', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  harness.missionResponses.push({ ok: true, value: missionSnapshot() })
  await harness.ctx.emit('connection/reset')

  assert.match(textOf(harness.renderMission()), /运行中/)
  assert.equal(harness.activeIntervalCount(), 1)
  await harness.ctx.dispose()
})

test('Browser mission view renders a recovered Host mission as interrupted', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()
  harness.missionResponses.push({
    ok: true,
    value: missionSnapshot({
      status: 'interrupted',
      error: 'Host 重启前任务尚未完成，已安全标记为中断',
      assignments: missionSnapshot().assignments.map(assignment => ({
        ...assignment,
        state: assignment.state === 'pending' ? 'interrupted' : assignment.state,
        error: assignment.state === 'pending' ? 'Host 重启时节点仍未完成' : assignment.error,
        finishedAt: assignment.state === 'pending'
          ? '2026-08-17T13:05:00.000Z'
          : assignment.finishedAt,
      })),
      updatedAt: '2026-08-17T13:05:00.000Z',
    }),
  })

  await harness.ctx.emit('connection/reset')

  const view = harness.renderMission()
  assert.match(textOf(view), /已中断/)
  assert.match(textOf(view), /Host 重启前任务尚未完成/)
  assert.ok(action(view, 'start-demo'))
  assert.equal(harness.activeIntervalCount(), 0)
  await harness.ctx.dispose()
})

test('Browser mission polling ignores an older running snapshot after completion', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()
  harness.startDemoResponses.push({ ok: true, value: missionSnapshot() })
  await action(harness.renderMission(), 'start-demo').props.onClick()

  const staleRunning = deferred()
  harness.missionResponses.push(staleRunning.promise, {
    ok: true,
    value: missionSnapshot({
      status: 'completed',
      progress: { completed: 3, total: 3 },
      assignments: missionSnapshot().assignments.map(assignment => ({
        ...assignment,
        state: 'completed',
        summary: `${assignment.title}已完成`,
        finishedAt: '2026-08-17T13:00:03.000Z',
      })),
      updatedAt: '2026-08-17T13:00:03.000Z',
    }),
  })
  const olderTick = harness.tickIntervals()
  await Promise.resolve()
  await harness.tickIntervals()
  assert.match(textOf(harness.renderMission()), /已完成/)
  assert.equal(harness.activeIntervalCount(), 0)

  staleRunning.resolve({ ok: true, value: missionSnapshot() })
  await olderTick
  assert.match(textOf(harness.renderMission()), /已完成/)
  assert.equal(harness.activeIntervalCount(), 0)
  await harness.ctx.dispose()
})

test('Browser mission view cancels the active no-model demo', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  harness.startDemoResponses.push({ ok: true, value: missionSnapshot() })
  await action(harness.renderMission(), 'start-demo').props.onClick()
  const cancelledAssignments = missionSnapshot().assignments.map(assignment => ({
    ...assignment,
    state: 'cancelled',
    finishedAt: '2026-08-17T13:00:02.000Z',
  }))
  harness.cancelMissionResponses.push({
    ok: true,
    value: missionSnapshot({
      status: 'cancelled',
      assignments: cancelledAssignments,
      updatedAt: '2026-08-17T13:00:02.000Z',
    }),
  })
  await action(harness.renderMission(), 'cancel-demo').props.onClick()

  const cancelledText = textOf(harness.renderMission())
  assert.match(cancelledText, /已取消/)
  assert.equal(harness.activeIntervalCount(), 0)
  await harness.ctx.dispose()
})
