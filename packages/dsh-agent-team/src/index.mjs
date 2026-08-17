import { createAgentRoster } from './agent-roster.mjs'
import {
  AGENT_TEAM_SETTINGS_NAMESPACE,
  AgentTeamSettingsSchema,
  resolveRoleOverrides,
} from './agent-team-settings.mjs'
import { createMissionPlan } from './mission-plan.mjs'
import { createRunProjectionStore } from './run-projection.mjs'

export const name = 'dsh-agent-team'

/** Mount the deterministic expert-team domain service into the Harness Host. */
export function apply(ctx, config = {}) {
  let roleOverrides = resolveRoleOverrides(config.roleOverrides ?? {})
  const roster = createAgentRoster({
    getRoleOverrides: () => roleOverrides,
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

  ctx.inject?.(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      AGENT_TEAM_SETTINGS_NAMESPACE,
      AgentTeamSettingsSchema,
      {
        base: { roleOverrides },
        applies: 'live',
        validate(settings) { resolveRoleOverrides(settings.roleOverrides) },
      },
    )
    roleOverrides = resolveRoleOverrides(scope.get().roleOverrides)
    settingsCtx.effect(
      () => scope.watch((next) => { roleOverrides = resolveRoleOverrides(next.roleOverrides) }),
      'dsh-agent-team: role settings',
    )
  })
}

export default apply
