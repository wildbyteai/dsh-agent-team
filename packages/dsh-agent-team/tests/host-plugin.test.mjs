import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import AgentTeamPlugin, { name } from '../src/index.mjs'
import { createMissionLedger } from '../src/mission-ledger.mjs'

function createMemoryLedger() {
  let latest = null
  return {
    async recoverLatest() { return latest },
    async save(snapshot) { latest = structuredClone(snapshot) },
    async close() {},
  }
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

test('Host plugin publishes the expert-team service without starting providers', async () => {
  const services = new Map()
  const ctx = {
    provide(serviceName, value) {
      services.set(serviceName, value)
    },
  }

  AgentTeamPlugin(ctx, {
    ledger: createMemoryLedger(),
    roleOverrides: {
      codex: ['review'],
    },
  })

  assert.equal(name, 'dsh-agent-team')
  const service = services.get('agentTeam')
  assert.ok(service)
  assert.equal(service.typertRemote.service, service)
  assert.equal(service.typertRemote.serviceKey, 'agentTeam')
  assert.equal(service.typertRemote.namespace, 'agentTeam')
  assert.equal(typeof service.snapshot, 'function')
  assert.equal(typeof service.roster.snapshot, 'function')
  assert.equal(typeof service.createMissionPlan, 'function')
  assert.equal(service.runs, undefined)
  assert.equal(service.ledger, undefined)
  assert.equal(typeof service.missions.startDemo, 'function')
  assert.equal(typeof service.missions.cancel, 'function')
  assert.equal(service.missions.restore, undefined)
  assert.equal(typeof service.missionSnapshot, 'function')
  assert.equal(typeof service.startDemo, 'function')
  assert.equal(typeof service.cancelMission, 'function')
  assert.equal(await service.missionSnapshot(), null)

  const snapshot = await service.snapshot()
  assert.equal(snapshot.agents.length, 5)
  assert.deepEqual(snapshot.agents.find(agent => agent.id === 'codex')?.positioning, ['review'])
})

test('Host plugin applies durable role settings to the live roster', async () => {
  let service
  let publishSettings
  const settings = {
    register(namespace, _schema, options) {
      assert.equal(namespace, 'agent-team')
      assert.deepEqual(options.base, { roleOverrides: { codex: ['review'] } })
      assert.equal(options.applies, 'live')
      let current = options.base
      return {
        get: () => current,
        watch(callback) {
          publishSettings = async (next) => {
            const previous = current
            current = next
            await callback(next, previous)
          }
          return () => {}
        },
      }
    },
  }
  const ctx = {
    provide(_name, value) {
      service = value
    },
    inject(dependencies, mount) {
      assert.deepEqual(dependencies, ['settings'])
      mount({
        settings,
        effect(effect) { effect() },
      })
    },
  }

  AgentTeamPlugin(ctx, {
    ledger: createMemoryLedger(),
    roleOverrides: { codex: ['review'] },
  })
  assert.deepEqual(
    (await service.snapshot()).agents.find(agent => agent.id === 'codex')?.positioning,
    ['review'],
  )

  await publishSettings({ roleOverrides: { codex: ['plan', 'review'] } })
  assert.deepEqual(
    (await service.snapshot()).agents.find(agent => agent.id === 'codex')?.positioning,
    ['plan', 'review'],
  )
})

test('Host plugin restores an unfinished durable mission before accepting new work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-agent-team-host-'))
  const ledgerPath = join(directory, 'missions.json')
  try {
    const seed = createMissionLedger({ filename: ledgerPath })
    await seed.save({
      schemaVersion: 1,
      id: 'mission-demo-9',
      goal: '等待 Host 恢复',
      strategy: 'expert-team',
      commanderId: 'deepseek',
      status: 'running',
      error: null,
      openedAt: '2026-08-17T15:00:00.000Z',
      updatedAt: '2026-08-17T15:00:01.000Z',
      assignments: [{
        id: 'read-only-check',
        title: '读取并验证',
        agentId: 'codex',
        role: 'review',
        mode: 'read',
        dependsOn: [],
        state: 'running',
        summary: null,
        error: null,
        startedAt: '2026-08-17T15:00:01.000Z',
        finishedAt: null,
      }],
      progress: { completed: 0, total: 1 },
      artifacts: [],
    })
    await seed.close()

    let service
    AgentTeamPlugin({
      provide(_serviceName, value) { service = value },
    }, {
      ledgerPath,
      now: () => '2026-08-17T15:40:00.000Z',
    })

    const recovered = await service.missionSnapshot()
    assert.equal(recovered.status, 'interrupted')
    assert.equal(recovered.assignments[0].state, 'interrupted')
    const started = await service.startDemo()
    assert.equal(started.id, 'mission-demo-10')
    await service.cancelMission()
    await service.missions.wait()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Host mission facade waits for recovery before accepting work', async () => {
  const recovery = deferred()
  let executions = 0
  let service
  AgentTeamPlugin({
    provide(_serviceName, value) { service = value },
  }, {
    ledger: {
      recoverLatest: () => recovery.promise,
      async save() {},
      async close() {},
    },
    async executeAssignment(assignment) {
      executions += 1
      return { summary: `${assignment.id} completed`, artifacts: [] }
    },
  })

  const starting = service.missions.startDemo()
  await Promise.resolve()
  assert.equal(executions, 0)
  recovery.resolve({
    schemaVersion: 1,
    id: 'mission-demo-9',
    goal: '等待恢复门禁',
    strategy: 'expert-team',
    commanderId: 'deepseek',
    status: 'interrupted',
    error: '此前 Host 已中断',
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
      error: '此前 Host 已中断',
      startedAt: '2026-08-17T15:00:01.000Z',
      finishedAt: '2026-08-17T15:10:00.000Z',
    }],
    progress: { completed: 0, total: 1 },
    artifacts: [],
  })

  const started = await starting
  assert.equal(started.id, 'mission-demo-10')
  assert.equal(executions, 2)
  await service.missions.wait()
})

test('Host disposal persists an active mission as interrupted', async () => {
  const ledger = createMemoryLedger()
  let service
  let dispose
  AgentTeamPlugin({
    provide(_serviceName, value) { service = value },
    effect(register) { dispose = register() },
  }, { ledger })

  const started = await service.startDemo()
  assert.equal(started.status, 'running')
  await dispose()

  const durable = await ledger.recoverLatest()
  assert.equal(durable.status, 'interrupted')
  assert.deepEqual(durable.assignments.map(assignment => assignment.state), [
    'interrupted', 'interrupted', 'interrupted',
  ])
})
