import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunProjectionStore } from '../src/run-projection.mjs'

const plan = {
  schemaVersion: 1,
  id: 'mission-001',
  goal: '评估并收敛插件架构',
  strategy: 'expert-team',
  commanderId: 'deepseek',
  status: 'draft',
  assignments: [
    {
      id: 'architecture-options', title: '提出架构选项', agentId: 'claude-code',
      role: 'plan', mode: 'read', dependsOn: [], state: 'pending',
    },
    {
      id: 'implementation-audit', title: '审计现有实现边界', agentId: 'codex',
      role: 'review', mode: 'read', dependsOn: [], state: 'pending',
    },
    {
      id: 'decision', title: '综合专家结论', agentId: 'deepseek',
      role: 'synthesize', mode: 'read',
      dependsOn: ['architecture-options', 'implementation-audit'], state: 'pending',
    },
  ],
}

test('RunProjection folds expert activity into one UI-safe mission snapshot', () => {
  const store = createRunProjectionStore({ now: () => '2026-08-17T10:10:00.000Z' })
  store.open(plan)
  store.record('mission-001', { type: 'mission.started', at: '2026-08-17T10:01:00.000Z' })
  store.record('mission-001', {
    type: 'assignment.completed',
    assignmentId: 'architecture-options',
    at: '2026-08-17T10:04:00.000Z',
    summary: '形成两个可选架构',
    artifacts: ['artifact://architecture-options.md'],
  })
  store.record('mission-001', {
    type: 'assignment.completed',
    assignmentId: 'implementation-audit',
    at: '2026-08-17T10:05:00.000Z',
    summary: '确认三项运行边界',
    artifacts: ['artifact://implementation-audit.md'],
  })
  store.record('mission-001', {
    type: 'assignment.started',
    assignmentId: 'decision',
    at: '2026-08-17T10:06:00.000Z',
  })

  const snapshot = store.snapshot('mission-001')

  assert.deepEqual({
    status: snapshot.status,
    progress: snapshot.progress,
    updatedAt: snapshot.updatedAt,
  }, {
    status: 'running',
    progress: { completed: 2, total: 3 },
    updatedAt: '2026-08-17T10:06:00.000Z',
  })
  assert.deepEqual(snapshot.assignments.map(assignment => ({
    id: assignment.id,
    state: assignment.state,
    summary: assignment.summary,
  })), [
    { id: 'architecture-options', state: 'completed', summary: '形成两个可选架构' },
    { id: 'implementation-audit', state: 'completed', summary: '确认三项运行边界' },
    { id: 'decision', state: 'running', summary: null },
  ])
  assert.deepEqual(snapshot.artifacts, [
    'artifact://architecture-options.md',
    'artifact://implementation-audit.md',
  ])
})

test('RunProjection leaves the snapshot unchanged when an event is rejected', () => {
  const store = createRunProjectionStore({ now: () => '2026-08-17T10:10:00.000Z' })
  store.open(plan)
  const before = store.snapshot('mission-001')

  assert.throws(() => store.record('mission-001', {
    type: 'assignment.teleported',
    assignmentId: 'decision',
    at: '2026-08-17T10:11:00.000Z',
  }), /unsupported run event: assignment.teleported/)

  assert.deepEqual(store.snapshot('mission-001'), before)
})
