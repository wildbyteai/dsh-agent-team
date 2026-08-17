import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AgentTeamSettingsSchema,
  resolveRoleOverrides,
} from '../src/agent-team-settings.mjs'

test('Agent team settings accept a validated composition base', () => {
  const roleOverrides = resolveRoleOverrides({ codex: ['review'] })

  assert.deepEqual(AgentTeamSettingsSchema({ roleOverrides }), {
    roleOverrides: { codex: ['review'] },
  })
})

test('Agent role settings preserve DeepSeek as commander', () => {
  assert.throws(
    () => resolveRoleOverrides({ codex: ['coordinate'] }),
    /cannot replace DeepSeek as commander/,
  )
  assert.throws(
    () => resolveRoleOverrides({ deepseek: ['plan', 'execute'] }),
    /must keep coordinate and synthesize/,
  )
  assert.throws(
    () => resolveRoleOverrides({ unknown: ['review'] }),
    /unknown Agent role override/,
  )
  assert.throws(
    () => resolveRoleOverrides({ pi: [] }),
    /must keep at least one role/,
  )
})
