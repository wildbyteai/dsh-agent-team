import assert from 'node:assert/strict'
import test from 'node:test'
import AgentTeamPlugin from '../src/index.mjs'
import { TYPERT } from '../lib/typert.host.js'

test('Typert contract accepts the Host roster snapshot and rejects malformed wire data', async () => {
  let service
  AgentTeamPlugin({
    provide(name, value) {
      if (name === 'agentTeam') service = value
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
})
