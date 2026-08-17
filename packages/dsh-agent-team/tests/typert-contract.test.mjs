import assert from 'node:assert/strict'
import test from 'node:test'
import AgentTeamPlugin from '../src/index.mjs'
import { TYPERT } from '../lib/typert.host.js'

test('Typert contract validates roster and mission-run snapshots', async () => {
  let service
  let durableMission = null
  AgentTeamPlugin({
    provide(name, value) {
      if (name === 'agentTeam') service = value
    },
  }, {
    ledger: {
      async recoverLatest() { return durableMission },
      async save(snapshot) { durableMission = structuredClone(snapshot) },
      async close() {},
    },
  })

  const descriptor = TYPERT.invocations.find(candidate => candidate.id === 'dsh-agent-team#agentTeam/snapshot')
  assert.ok(descriptor)
  assert.equal(descriptor.service, 'agentTeam')
  assert.equal(descriptor.namespace, 'agentTeam')
  assert.deepEqual(descriptor.parameters, [])

  const snapshot = await service.snapshot()
  assert.deepEqual(descriptor.result.schema.parse(snapshot), snapshot)
  assert.equal(descriptor.result.schema.safeParse({ schemaVersion: 2, agents: [] }).success, false)
  assert.equal(descriptor.result.schema.safeParse({ ...snapshot, unexpected: true }).success, false)
  assert.equal(descriptor.result.schema.safeParse({
    ...snapshot,
    agents: [{ ...snapshot.agents[0], unexpected: true }, ...snapshot.agents.slice(1)],
  }).success, false)

  const missionSnapshot = TYPERT.invocations.find(candidate => (
    candidate.id === 'dsh-agent-team#agentTeam/missionSnapshot'
  ))
  const startDemo = TYPERT.invocations.find(candidate => (
    candidate.id === 'dsh-agent-team#agentTeam/startDemo'
  ))
  const cancelMission = TYPERT.invocations.find(candidate => (
    candidate.id === 'dsh-agent-team#agentTeam/cancelMission'
  ))
  assert.ok(missionSnapshot)
  assert.ok(startDemo)
  assert.ok(cancelMission)
  assert.deepEqual(missionSnapshot.result.schema.parse(await service.missionSnapshot()), null)

  const started = await service.startDemo()
  assert.deepEqual(startDemo.result.schema.parse(started), started)
  assert.equal(started.status, 'running')
  const cancelled = await service.cancelMission()
  assert.deepEqual(cancelMission.result.schema.parse(cancelled), cancelled)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(startDemo.result.schema.safeParse({ ...started, unexpected: true }).success, false)
  await service.missions.wait()
})
