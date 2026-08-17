import assert from 'node:assert/strict'
import test from 'node:test'
import AgentTeamPlugin, { name } from '../src/index.mjs'

test('Host plugin publishes the expert-team service without starting providers', async () => {
  const services = new Map()
  const ctx = {
    provide(serviceName, value) {
      services.set(serviceName, value)
    },
  }

  AgentTeamPlugin(ctx, {
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
  assert.equal(typeof service.runs.open, 'function')
  assert.equal(typeof service.runs.record, 'function')
  assert.equal(typeof service.runs.snapshot, 'function')
  assert.equal(typeof service.missions.startDemo, 'function')
  assert.equal(typeof service.missions.cancel, 'function')
  assert.equal(typeof service.missionSnapshot, 'function')
  assert.equal(typeof service.startDemo, 'function')
  assert.equal(typeof service.cancelMission, 'function')
  assert.equal(service.missionSnapshot(), null)

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

  AgentTeamPlugin(ctx, { roleOverrides: { codex: ['review'] } })
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
