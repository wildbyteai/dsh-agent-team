import z from '@deepseek-ai/schemastery'
import { AGENT_IDS } from './agent-roster.mjs'

export const AGENT_TEAM_SETTINGS_NAMESPACE = 'agent-team'
export const AGENT_ROLE_IDS = Object.freeze([
  'coordinate', 'plan', 'execute', 'review', 'research', 'synthesize',
])
export const EDITABLE_AGENT_ROLE_IDS = Object.freeze(['plan', 'execute', 'review', 'research'])

const roleSet = new Set(AGENT_ROLE_IDS)
const agentSet = new Set(AGENT_IDS)

export const AgentTeamSettingsSchema = z.object({
  roleOverrides: z.dict(z.array(z.union([...AGENT_ROLE_IDS])).min(1)).default({}),
})

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Validate and detach role overrides before the live roster observes them. */
export function resolveRoleOverrides(value) {
  if (!isPlainObject(value)) throw new TypeError('roleOverrides must be a plain object')
  const resolved = {}
  for (const [agentId, roles] of Object.entries(value)) {
    if (!agentSet.has(agentId)) throw new TypeError(`unknown Agent role override: ${agentId}`)
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new TypeError(`Agent ${agentId} must keep at least one role`)
    }
    if (roles.some(role => typeof role !== 'string' || !roleSet.has(role))) {
      throw new TypeError(`Agent ${agentId} has an unsupported role`)
    }
    if (new Set(roles).size !== roles.length) {
      throw new TypeError(`Agent ${agentId} has duplicate roles`)
    }
    if (agentId === 'deepseek') {
      if (!roles.includes('coordinate') || !roles.includes('synthesize')) {
        throw new TypeError('DeepSeek must keep coordinate and synthesize roles')
      }
    } else if (roles.includes('coordinate') || roles.includes('synthesize')) {
      throw new TypeError(`Agent ${agentId} cannot replace DeepSeek as commander`)
    }
    const ordered = AGENT_ROLE_IDS.filter(role => roles.includes(role))
    resolved[agentId] = ordered
  }
  return resolved
}
