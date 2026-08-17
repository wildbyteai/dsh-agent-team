import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentRoster } from '../src/agent-roster.mjs'

test('AgentRoster.snapshot exposes the five experts without conflating installation and support', async () => {
  const locations = new Map([
    ['claude', '/opt/agents/claude'],
    ['codex', '/opt/agents/codex'],
    ['pi', '/opt/agents/pi'],
  ])
  const roster = createAgentRoster({
    locate: async command => locations.get(command) ?? null,
    now: () => '2026-08-17T10:00:00.000Z',
    roleOverrides: {
      codex: ['review'],
      pi: ['research', 'execute'],
    },
  })

  const snapshot = await roster.snapshot()

  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.capturedAt, '2026-08-17T10:00:00.000Z')
  assert.deepEqual(snapshot.agents.map(agent => ({
    id: agent.id,
    avatar: agent.avatar,
    availability: agent.availability,
    supportLevel: agent.supportLevel,
  })), [
    { id: 'deepseek', avatar: '🧑‍✈️', availability: 'ready', supportLevel: 'core' },
    { id: 'claude-code', avatar: '🧑‍💼', availability: 'detected', supportLevel: 'candidate' },
    { id: 'codex', avatar: '🧑‍🔬', availability: 'detected', supportLevel: 'candidate' },
    { id: 'antigravity', avatar: '🧑‍🚀', availability: 'missing', supportLevel: 'blocked' },
    { id: 'pi', avatar: '🧑‍🔧', availability: 'detected', supportLevel: 'experimental' },
  ])
  assert.deepEqual(snapshot.agents.find(agent => agent.id === 'codex')?.positioning, ['review'])
  assert.deepEqual(snapshot.agents.find(agent => agent.id === 'pi')?.positioning, ['research', 'execute'])
  assert.equal(snapshot.agents.find(agent => agent.id === 'claude-code')?.executablePath, '/opt/agents/claude')
})
