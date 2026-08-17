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
  assert.equal(typeof service.roster.snapshot, 'function')
  assert.equal(typeof service.createMissionPlan, 'function')
  assert.equal(typeof service.runs.open, 'function')
  assert.equal(typeof service.runs.record, 'function')
  assert.equal(typeof service.runs.snapshot, 'function')

  const snapshot = await service.roster.snapshot()
  assert.equal(snapshot.agents.length, 5)
  assert.deepEqual(snapshot.agents.find(agent => agent.id === 'codex')?.positioning, ['review'])
})
