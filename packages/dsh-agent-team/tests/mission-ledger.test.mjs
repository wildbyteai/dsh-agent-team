import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createMissionLedger } from '../src/mission-ledger.mjs'

function runSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'mission-demo-7',
    goal: '验证持久任务账本',
    strategy: 'expert-team',
    commanderId: 'deepseek',
    status: 'completed',
    error: null,
    openedAt: '2026-08-17T15:00:00.000Z',
    updatedAt: '2026-08-17T15:00:03.000Z',
    assignments: [{
      id: 'read-only-check',
      title: '读取并验证',
      agentId: 'codex',
      role: 'review',
      mode: 'read',
      dependsOn: [],
      state: 'completed',
      summary: '验证完成',
      error: null,
      startedAt: '2026-08-17T15:00:01.000Z',
      finishedAt: '2026-08-17T15:00:02.000Z',
    }],
    progress: { completed: 1, total: 1 },
    artifacts: [],
    ...overrides,
  }
}

test('MissionLedger reopens the latest durable mission snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-agent-team-ledger-'))
  const filename = join(directory, 'missions.json')
  try {
    const first = createMissionLedger({ filename })
    const expected = runSnapshot()
    await first.save(expected)
    await first.close()

    const reopened = createMissionLedger({ filename })
    assert.deepEqual(await reopened.latest(), expected)
    await reopened.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('MissionLedger follows Harness tilde expansion for DSH_HOME', async () => {
  const ledger = createMissionLedger({ env: { DSH_HOME: '~/isolated-dsh-home' } })
  assert.equal(
    ledger.filename,
    join(homedir(), 'isolated-dsh-home', 'dsh-agent-team', 'v1', 'missions.json'),
  )
  await ledger.close()
})

test('MissionLedger rejects a relative explicit ledger path', () => {
  assert.throws(
    () => createMissionLedger({ filename: 'relative/missions.json' }),
    /absolute path/i,
  )
})

test('MissionLedger rejects invalid snapshots without changing the latest run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-agent-team-ledger-'))
  const filename = join(directory, 'missions.json')
  try {
    const ledger = createMissionLedger({ filename })
    const valid = runSnapshot()
    await ledger.save(valid)

    await assert.rejects(
      ledger.save({ ...valid, id: 'unsafe-run', commanderId: 'codex' }),
      /mission snapshot/i,
    )
    assert.deepEqual(await ledger.latest(), valid)
    await ledger.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('MissionLedger recovers an unfinished read-only mission as interrupted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-agent-team-ledger-'))
  const filename = join(directory, 'missions.json')
  try {
    const ledger = createMissionLedger({
      filename,
      now: () => '2026-08-17T15:10:00.000Z',
    })
    const assignments = [
      runSnapshot().assignments[0],
      {
        ...runSnapshot().assignments[0],
        id: 'running-check',
        state: 'running',
        summary: null,
        startedAt: '2026-08-17T15:00:02.000Z',
        finishedAt: null,
      },
      {
        ...runSnapshot().assignments[0],
        id: 'pending-check',
        state: 'pending',
        summary: null,
        startedAt: null,
        finishedAt: null,
      },
    ]
    await ledger.save(runSnapshot({
      status: 'running',
      updatedAt: '2026-08-17T15:00:02.000Z',
      assignments,
      progress: { completed: 1, total: 3 },
    }))

    const { recoverLatest } = ledger
    const recovered = await recoverLatest()
    assert.equal(recovered.status, 'interrupted')
    assert.equal(recovered.error, 'Host 重启前任务尚未完成，已安全标记为中断')
    assert.equal(recovered.updatedAt, '2026-08-17T15:10:00.000Z')
    assert.deepEqual(recovered.assignments.map(assignment => assignment.state), [
      'completed', 'interrupted', 'interrupted',
    ])
    assert.equal(recovered.assignments[0].finishedAt, '2026-08-17T15:00:02.000Z')
    assert.equal(recovered.assignments[1].finishedAt, '2026-08-17T15:10:00.000Z')
    assert.deepEqual(recovered.progress, { completed: 1, total: 3 })
    await ledger.close()

    const reopened = createMissionLedger({ filename })
    assert.deepEqual(await reopened.latest(), recovered)
    await reopened.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
