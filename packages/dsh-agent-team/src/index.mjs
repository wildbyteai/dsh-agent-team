import { createAgentRoster } from './agent-roster.mjs'
import {
  AGENT_TEAM_SETTINGS_NAMESPACE,
  AgentTeamSettingsSchema,
  resolveRoleOverrides,
} from './agent-team-settings.mjs'
import { createMissionPlan } from './mission-plan.mjs'
import { createMissionLedger } from './mission-ledger.mjs'
import { createMissionRunService } from './mission-run.mjs'
import { createRunProjectionStore } from './run-projection.mjs'

export const name = 'dsh-agent-team'

/** Mount the deterministic expert-team domain service into the Harness Host. */
export function apply(ctx, config = {}) {
  let roleOverrides = resolveRoleOverrides(config.roleOverrides ?? {})
  const roster = createAgentRoster({
    getRoleOverrides: () => roleOverrides,
  })
  const ledger = config.ledger ?? createMissionLedger({
    filename: config.ledgerPath,
    dshHome: config.dshHome,
    now: config.now,
  })
  const runs = createRunProjectionStore()
  const missions = createMissionRunService({
    projections: runs,
    now: config.now,
    executeAssignment: config.executeAssignment,
    onSnapshot: snapshot => ledger.save(snapshot),
  })
  let readyPromise

  function ready() {
    readyPromise ??= ledger.recoverLatest().then((restored) => {
      if (restored !== null) missions.restore(restored)
    })
    return readyPromise
  }

  async function missionSnapshot() {
    await ready()
    await missions.flush()
    return missions.snapshot() ?? null
  }

  async function startDemo() {
    await ready()
    return missions.startDemo()
  }

  async function cancelMission() {
    await ready()
    return (await missions.cancel()) ?? null
  }

  const missionService = Object.freeze({
    snapshot: missionSnapshot,
    startDemo,
    cancel: cancelMission,
    async wait() {
      await ready()
      return missions.wait()
    },
  })

  const service = {
    roster,
    snapshot: () => roster.snapshot(),
    createMissionPlan,
    ready,
    missions: missionService,
    missionSnapshot,
    startDemo,
    cancelMission,
  }
  service.typertRemote = Object.freeze({
    service,
    serviceKey: 'agentTeam',
    namespace: 'agentTeam',
  })
  ctx.provide('agentTeam', service)

  ctx.effect?.(() => async () => {
    try {
      await ready()
      await missions.interrupt()
      await missions.wait()
    } finally {
      await ledger.close()
    }
  }, 'dsh-agent-team: mission ledger')

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
