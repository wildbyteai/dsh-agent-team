import { createAgentRoster } from './agent-roster.mjs'
import { createMissionPlan } from './mission-plan.mjs'
import { createRunProjectionStore } from './run-projection.mjs'

export const name = 'dsh-agent-team'

/** Mount the deterministic expert-team domain service into the Harness Host. */
export function apply(ctx, config = {}) {
  const service = {
    roster: createAgentRoster({
      roleOverrides: config.roleOverrides ?? {},
    }),
    createMissionPlan,
    runs: createRunProjectionStore(),
  }
  ctx.provide('agentTeam', service)
}

export default apply
