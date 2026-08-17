import { createAgentRoster } from './agent-roster.mjs'
import { createMissionPlan } from './mission-plan.mjs'
import { createRunProjectionStore } from './run-projection.mjs'

export const name = 'dsh-agent-team'

/** Mount the deterministic expert-team domain service into the Harness Host. */
export function apply(ctx, config = {}) {
  const roster = createAgentRoster({
    roleOverrides: config.roleOverrides ?? {},
  })
  const service = {
    roster,
    snapshot: () => roster.snapshot(),
    createMissionPlan,
    runs: createRunProjectionStore(),
  }
  service.typertRemote = Object.freeze({
    service,
    serviceKey: 'agentTeam',
    namespace: 'agentTeam',
  })
  ctx.provide('agentTeam', service)
}

export default apply
