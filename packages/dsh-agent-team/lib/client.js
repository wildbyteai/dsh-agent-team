;(function registerAgentTeamBrowserBundle() {
  const PLUGIN_ID = 'dsh-agent-team'

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory(require) {
      const React = require('react')
      const h = React.createElement
      const AGENT_TEAM_SETTINGS_NAMESPACE = 'agent-team'
      // Keep this self-contained Browser artifact aligned with Host policy via the bundle contract test.
      const agentRolePolicy = Object.freeze({
        commanderAgentId: 'deepseek',
        roleIds: Object.freeze([
          'coordinate', 'plan', 'execute', 'review', 'research', 'synthesize',
        ]),
        editableRoleIds: Object.freeze(['plan', 'execute', 'review', 'research']),
        commanderRoleIds: Object.freeze(['coordinate', 'synthesize']),
        defaultPositioning: Object.freeze({
          deepseek: Object.freeze(['coordinate', 'plan', 'execute', 'synthesize']),
          'claude-code': Object.freeze(['plan', 'review']),
          codex: Object.freeze(['execute', 'review']),
          antigravity: Object.freeze(['execute']),
          pi: Object.freeze(['research', 'execute']),
        }),
      })

      function hasExactKeys(value, expectedKeys) {
        const actualKeys = Object.keys(value)
        return actualKeys.length === expectedKeys.length
          && expectedKeys.every(key => Object.prototype.hasOwnProperty.call(value, key))
      }

      function parseRosterSnapshot(value) {
        const availability = new Set(['ready', 'detected', 'missing'])
        const supportLevels = new Set(['core', 'candidate', 'blocked', 'experimental'])
        if (value === null || typeof value !== 'object' || Array.isArray(value)
          || !hasExactKeys(value, ['schemaVersion', 'capturedAt', 'agents'])
          || value.schemaVersion !== 1 || typeof value.capturedAt !== 'string'
          || !Array.isArray(value.agents)) {
          throw new TypeError('agentTeam snapshot has an invalid envelope')
        }
        const agents = value.agents.map(agent => {
          if (agent === null || typeof agent !== 'object' || Array.isArray(agent)
            || !hasExactKeys(agent, [
              'id', 'displayName', 'avatar', 'command', 'availability',
              'executablePath', 'supportLevel', 'positioning',
            ])
            || typeof agent.id !== 'string' || typeof agent.displayName !== 'string'
            || typeof agent.avatar !== 'string'
            || (agent.command !== null && typeof agent.command !== 'string')
            || !availability.has(agent.availability)
            || (agent.executablePath !== null && typeof agent.executablePath !== 'string')
            || !supportLevels.has(agent.supportLevel)
            || !Array.isArray(agent.positioning)
            || agent.positioning.some(role => typeof role !== 'string')) {
            throw new TypeError('agentTeam snapshot contains an invalid agent')
          }
          return {
            id: agent.id,
            displayName: agent.displayName,
            avatar: agent.avatar,
            command: agent.command,
            availability: agent.availability,
            executablePath: agent.executablePath,
            supportLevel: agent.supportLevel,
            positioning: [...agent.positioning],
          }
        })
        return { schemaVersion: 1, capturedAt: value.capturedAt, agents }
      }

      function nullableString(value) {
        return value === null || typeof value === 'string'
      }

      function parseMissionSnapshot(value) {
        if (value === null) return null
        const runStatuses = new Set(['planned', 'running', 'completed', 'cancelled', 'failed'])
        const assignmentStates = new Set([
          'pending', 'running', 'completed', 'cancelled', 'failed',
        ])
        if (value === null || typeof value !== 'object' || Array.isArray(value)
          || !hasExactKeys(value, [
            'schemaVersion', 'id', 'goal', 'strategy', 'commanderId', 'status', 'error',
            'openedAt', 'updatedAt', 'assignments', 'progress', 'artifacts',
          ])
          || value.schemaVersion !== 1 || typeof value.id !== 'string'
          || typeof value.goal !== 'string' || value.strategy !== 'expert-team'
          || value.commanderId !== 'deepseek' || !runStatuses.has(value.status)
          || !nullableString(value.error) || typeof value.openedAt !== 'string'
          || typeof value.updatedAt !== 'string' || !Array.isArray(value.assignments)
          || value.progress === null || typeof value.progress !== 'object'
          || Array.isArray(value.progress)
          || !hasExactKeys(value.progress, ['completed', 'total'])
          || !Number.isInteger(value.progress.completed) || value.progress.completed < 0
          || !Number.isInteger(value.progress.total) || value.progress.total < 0
          || !Array.isArray(value.artifacts)
          || value.artifacts.some(artifact => typeof artifact !== 'string')) {
          throw new TypeError('agentTeam mission snapshot has an invalid envelope')
        }
        const assignments = value.assignments.map(assignment => {
          if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment)
            || !hasExactKeys(assignment, [
              'id', 'title', 'agentId', 'role', 'mode', 'dependsOn', 'state', 'summary',
              'error', 'startedAt', 'finishedAt',
            ])
            || typeof assignment.id !== 'string' || typeof assignment.title !== 'string'
            || typeof assignment.agentId !== 'string' || typeof assignment.role !== 'string'
            || (assignment.mode !== 'read' && assignment.mode !== 'write')
            || !Array.isArray(assignment.dependsOn)
            || assignment.dependsOn.some(dependency => typeof dependency !== 'string')
            || !assignmentStates.has(assignment.state)
            || !nullableString(assignment.summary) || !nullableString(assignment.error)
            || !nullableString(assignment.startedAt) || !nullableString(assignment.finishedAt)) {
            throw new TypeError('agentTeam mission snapshot contains an invalid assignment')
          }
          return {
            id: assignment.id,
            title: assignment.title,
            agentId: assignment.agentId,
            role: assignment.role,
            mode: assignment.mode,
            dependsOn: [...assignment.dependsOn],
            state: assignment.state,
            summary: assignment.summary,
            error: assignment.error,
            startedAt: assignment.startedAt,
            finishedAt: assignment.finishedAt,
          }
        })
        return {
          schemaVersion: 1,
          id: value.id,
          goal: value.goal,
          strategy: 'expert-team',
          commanderId: 'deepseek',
          status: value.status,
          error: value.error,
          openedAt: value.openedAt,
          updatedAt: value.updatedAt,
          assignments,
          progress: { completed: value.progress.completed, total: value.progress.total },
          artifacts: [...value.artifacts],
        }
      }

      function parseRequiredMissionSnapshot(value) {
        const snapshot = parseMissionSnapshot(value)
        if (snapshot === null) {
          throw new TypeError('agentTeam mission snapshot is required')
        }
        return snapshot
      }

      function remoteDescriptor(method, typeSymbol, schema) {
        return {
          id: `${PLUGIN_ID}#agentTeam/${method}`,
          service: 'agentTeam',
          namespace: 'agentTeam',
          method,
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol, schema: { parse: schema } },
        }
      }

      const agentTeamRemoteContribution = {
        package: PLUGIN_ID,
        descriptors: [
          remoteDescriptor('snapshot', 'dsh-agent-team#AgentRosterSnapshot', parseRosterSnapshot),
          remoteDescriptor(
            'missionSnapshot',
            'dsh-agent-team#MissionRunSnapshotOrNull',
            parseMissionSnapshot,
          ),
          remoteDescriptor(
            'startDemo',
            'dsh-agent-team#MissionRunSnapshot',
            parseRequiredMissionSnapshot,
          ),
          remoteDescriptor(
            'cancelMission',
            'dsh-agent-team#MissionRunSnapshotOrNull',
            parseMissionSnapshot,
          ),
        ],
      }

      function createSnapshotStore(initialSnapshot) {
        let snapshot = initialSnapshot
        const listeners = new Set()
        return {
          getSnapshot: () => snapshot,
          subscribe(listener) {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
          setSnapshot(nextSnapshot) {
            snapshot = nextSnapshot
            for (const listener of [...listeners]) listener()
          },
        }
      }

      function roleOverridesOf(snapshot) {
        const overrides = snapshot?.value?.roleOverrides
        return overrides !== null && typeof overrides === 'object' && !Array.isArray(overrides)
          ? overrides
          : {}
      }

      function positioningOf(agent, settingsSnapshot) {
        const override = roleOverridesOf(settingsSnapshot)[agent.id]
        return Array.isArray(override) ? override : agent.positioning
      }

      function createRoleEditor(settings) {
        let tail = Promise.resolve()
        return {
          toggle(agent, role) {
            const task = tail.then(async () => {
              const snapshot = settings.getSnapshot()
              if (snapshot.status !== 'ready' || snapshot.writable !== true
                || !agentRolePolicy.editableRoleIds.includes(role)) return
              const current = positioningOf(agent, snapshot)
              const selected = new Set(current.filter(candidate => (
                agentRolePolicy.editableRoleIds.includes(candidate)
              )))
              if (selected.has(role)) selected.delete(role)
              else selected.add(role)
              if (agent.id !== agentRolePolicy.commanderAgentId && selected.size === 0) return
              const nextRoles = agentRolePolicy.roleIds.filter(candidate => (
                agent.id === agentRolePolicy.commanderAgentId
                  && agentRolePolicy.commanderRoleIds.includes(candidate)
              ) || selected.has(candidate))
              const nextOverrides = { ...roleOverridesOf(snapshot), [agent.id]: nextRoles }
              await settings.set('roleOverrides', nextOverrides)
            })
            tail = task.catch(() => {})
            return task
          },
        }
      }

      function createMissionController(remote, store) {
        const terminalStatuses = new Set(['completed', 'cancelled', 'failed'])
        const staleResponse = Symbol('stale mission response')
        let pollTimer
        let requestGeneration = 0

        function stopPolling() {
          if (pollTimer === undefined) return
          clearInterval(pollTimer)
          pollTimer = undefined
        }

        function publish(run) {
          store.setSnapshot({ phase: 'ready', run })
          if (run === null || terminalStatuses.has(run.status)) stopPolling()
        }

        async function invoke(method) {
          const generation = ++requestGeneration
          try {
            const answered = await remote.agentTeam[method]()
            if (generation !== requestGeneration) return staleResponse
            if (answered?.ok !== true) throw new Error(`Host rejected Agent mission ${method}`)
            const run = parseMissionSnapshot(answered.value)
            publish(run)
            return run
          } catch (error) {
            if (generation !== requestGeneration) return staleResponse
            throw error
          }
        }

        async function refresh() {
          try {
            const run = await invoke('missionSnapshot')
            if (run === staleResponse) return undefined
            if (run?.status === 'running' && pollTimer === undefined) startPolling()
            return run
          } catch (_error) {
            store.setSnapshot({ ...store.getSnapshot(), phase: 'error' })
            return undefined
          }
        }

        function startPolling() {
          stopPolling()
          pollTimer = setInterval(refresh, 180)
        }

        return {
          refresh,
          async start() {
            store.setSnapshot({ ...store.getSnapshot(), phase: 'starting' })
            try {
              const run = await invoke('startDemo')
              if (run === staleResponse) return undefined
              if (run?.status === 'running') startPolling()
              return run
            } catch (_error) {
              store.setSnapshot({ ...store.getSnapshot(), phase: 'error' })
              return undefined
            }
          },
          async cancel() {
            stopPolling()
            try {
              const run = await invoke('cancelMission')
              return run === staleResponse ? undefined : run
            } catch (_error) {
              store.setSnapshot({ ...store.getSnapshot(), phase: 'error' })
              return undefined
            }
          },
          dispose() {
            requestGeneration += 1
            stopPolling()
          },
        }
      }

      if (typeof document !== 'undefined'
        && document.querySelector?.(`style[data-plugin="${PLUGIN_ID}"]`) == null) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', PLUGIN_ID)
        style.textContent = `
.dat-shell {
  --dat-ink: #17202a;
  --dat-muted: #66717c;
  --dat-paper: #f2efe6;
  --dat-panel: rgba(255, 253, 247, .82);
  --dat-line: rgba(28, 41, 51, .14);
  --dat-signal: #0f9d8a;
  --dat-amber: #d88924;
  --dat-danger: #b64b45;
  color: var(--dat-ink);
  min-height: 100%;
  padding: 28px;
  background:
    radial-gradient(circle at 12% 8%, rgba(15, 157, 138, .12), transparent 31%),
    radial-gradient(circle at 90% 18%, rgba(216, 137, 36, .13), transparent 28%),
    repeating-linear-gradient(0deg, transparent 0 27px, rgba(23, 32, 42, .028) 28px),
    var(--dat-paper);
  font-family: "Avenir Next", "PingFang SC", sans-serif;
}
.dat-heading {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 18px;
  margin-bottom: 24px;
}
.dat-kicker {
  margin: 0 0 5px;
  color: var(--dat-signal);
  font: 700 11px/1.2 ui-monospace, "SFMono-Regular", monospace;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.dat-title {
  margin: 0;
  font-family: "Iowan Old Style", "Songti SC", serif;
  font-size: clamp(28px, 4vw, 46px);
  font-weight: 650;
  letter-spacing: -.035em;
}
.dat-description {
  max-width: 680px;
  margin: 8px 0 0;
  color: var(--dat-muted);
  line-height: 1.7;
}
.dat-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--dat-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, .58);
  color: var(--dat-muted);
  font: 700 11px/1 ui-monospace, "SFMono-Regular", monospace;
  white-space: nowrap;
}
.dat-mode::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dat-amber);
  box-shadow: 0 0 0 0 rgba(216, 137, 36, .36);
  content: "";
  animation: dat-signal 2.1s ease-out infinite;
}
.dat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.dat-agent {
  position: relative;
  overflow: hidden;
  min-height: 190px;
  padding: 18px;
  border: 1px solid var(--dat-line);
  border-radius: 20px 20px 20px 7px;
  background: var(--dat-panel);
  box-shadow: 0 15px 36px rgba(28, 41, 51, .07);
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}
.dat-agent:hover {
  transform: translateY(-3px);
  border-color: rgba(15, 157, 138, .34);
  box-shadow: 0 19px 42px rgba(28, 41, 51, .11);
}
.dat-agent::after {
  position: absolute;
  right: -20px;
  bottom: -28px;
  width: 88px;
  height: 88px;
  border: 1px solid var(--dat-line);
  border-radius: 50%;
  content: "";
}
.dat-avatar {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin-bottom: 18px;
  border: 1px solid rgba(23, 32, 42, .12);
  border-radius: 17px;
  background: linear-gradient(145deg, #fff, #e7e1d2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9), 0 8px 18px rgba(23, 32, 42, .08);
  font-size: 30px;
  animation: dat-float 3.4s ease-in-out infinite;
}
.dat-agent:nth-child(2n) .dat-avatar { animation-delay: -.8s; }
.dat-agent:nth-child(3n) .dat-avatar { animation-delay: -1.6s; }
.dat-agent-name {
  margin: 0;
  font-size: 16px;
  letter-spacing: -.01em;
}
.dat-agent-status {
  margin: 5px 0 14px;
  color: var(--dat-muted);
  font-size: 12px;
}
.dat-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dat-role {
  padding: 5px 8px;
  border: 1px solid var(--dat-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, .52);
  color: #46515b;
  font: 650 10px/1 ui-monospace, "SFMono-Regular", monospace;
}
.dat-role-toggle {
  appearance: none;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, color .18s ease, transform .18s ease;
}
.dat-role-toggle:hover:not(:disabled) { transform: translateY(-1px); }
.dat-role-toggle[aria-pressed="true"] {
  border-color: rgba(15, 157, 138, .42);
  background: rgba(15, 157, 138, .12);
  color: #087868;
}
.dat-role-toggle:disabled { cursor: not-allowed; opacity: .48; }
.dat-support {
  position: absolute;
  top: 15px;
  right: 15px;
  padding: 5px 7px;
  border-radius: 7px;
  background: rgba(15, 157, 138, .1);
  color: #087868;
  font: 750 9px/1 ui-monospace, "SFMono-Regular", monospace;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.dat-support[data-level="blocked"] {
  background: rgba(182, 75, 69, .11);
  color: var(--dat-danger);
}
.dat-support[data-level="experimental"] {
  background: rgba(216, 137, 36, .13);
  color: #9a5e13;
}
.dat-note {
  margin-top: 18px;
  padding: 14px 16px;
  border-left: 3px solid var(--dat-amber);
  background: rgba(255, 255, 255, .48);
  color: var(--dat-muted);
  font-size: 13px;
  line-height: 1.6;
}
.dat-command-deck {
  display: grid;
  grid-template-columns: minmax(220px, .72fr) minmax(300px, 1.28fr);
  gap: 18px;
}
.dat-commander,
.dat-mission-empty {
  min-height: 310px;
  border: 1px solid var(--dat-line);
  background: var(--dat-panel);
  box-shadow: 0 15px 36px rgba(28, 41, 51, .07);
}
.dat-commander {
  display: grid;
  align-content: center;
  justify-items: center;
  padding: 26px;
  border-radius: 28px 9px 28px 28px;
  text-align: center;
}
.dat-commander-avatar {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  margin-bottom: 17px;
  border-radius: 29px;
  background: linear-gradient(145deg, #fff, #dceee9);
  box-shadow: 0 18px 34px rgba(15, 157, 138, .17);
  font-size: 50px;
  animation: dat-float 3.4s ease-in-out infinite;
}
.dat-commander strong {
  font-family: "Iowan Old Style", "Songti SC", serif;
  font-size: 22px;
}
.dat-commander span {
  margin-top: 7px;
  color: var(--dat-muted);
  font-size: 12px;
}
.dat-mission-empty {
  position: relative;
  display: grid;
  align-content: center;
  padding: 34px;
  overflow: hidden;
  border-radius: 9px 28px 28px 28px;
}
.dat-mission-empty::before,
.dat-mission-empty::after {
  position: absolute;
  width: 160px;
  height: 160px;
  border: 1px dashed rgba(15, 157, 138, .24);
  border-radius: 50%;
  content: "";
}
.dat-mission-empty::before { top: -82px; right: -30px; }
.dat-mission-empty::after { right: 54px; bottom: -118px; }
.dat-mission-empty h3 {
  position: relative;
  margin: 0 0 10px;
  font-family: "Iowan Old Style", "Songti SC", serif;
  font-size: clamp(23px, 3vw, 34px);
  letter-spacing: -.025em;
}
.dat-mission-empty p {
  position: relative;
  max-width: 500px;
  margin: 0;
  color: var(--dat-muted);
  line-height: 1.7;
}
.dat-action {
  position: relative;
  justify-self: start;
  margin-top: 18px;
  padding: 10px 14px;
  border: 1px solid rgba(15, 157, 138, .34);
  border-radius: 12px;
  background: rgba(15, 157, 138, .11);
  color: #087868;
  cursor: pointer;
  font: 750 12px/1 ui-monospace, "SFMono-Regular", monospace;
  transition: transform .18s ease, background .18s ease;
}
.dat-action:hover:not(:disabled) { transform: translateY(-1px); background: rgba(15, 157, 138, .16); }
.dat-action:disabled { cursor: wait; opacity: .55; }
.dat-action[data-tone="danger"] {
  border-color: rgba(182, 75, 69, .3);
  background: rgba(182, 75, 69, .09);
  color: var(--dat-danger);
}
.dat-mission-board {
  min-height: 310px;
  padding: 24px;
  border: 1px solid var(--dat-line);
  border-radius: 9px 28px 28px 28px;
  background: var(--dat-panel);
  box-shadow: 0 15px 36px rgba(28, 41, 51, .07);
}
.dat-mission-board h3 { margin: 4px 0 7px; font: 650 24px/1.2 "Iowan Old Style", "Songti SC", serif; }
.dat-mission-meta { color: var(--dat-muted); font-size: 12px; }
.dat-progress { margin: 18px 0 12px; color: var(--dat-signal); font: 750 12px/1 ui-monospace, "SFMono-Regular", monospace; }
.dat-task-grid { display: grid; gap: 9px; }
.dat-task {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--dat-line);
  border-radius: 13px;
  background: rgba(255, 255, 255, .52);
}
.dat-task[data-state="running"] { border-color: rgba(15, 157, 138, .4); animation: dat-task-pulse 1.6s ease-in-out infinite; }
.dat-task[data-state="failed"] { border-color: rgba(182, 75, 69, .4); }
.dat-task-avatar { font-size: 22px; }
.dat-task strong { display: block; font-size: 13px; }
.dat-task p { margin: 4px 0 0; color: var(--dat-muted); font-size: 11px; line-height: 1.45; }
.dat-task-state { color: var(--dat-muted); font: 700 10px/1 ui-monospace, "SFMono-Regular", monospace; }
@keyframes dat-task-pulse { 50% { box-shadow: 0 0 0 3px rgba(15, 157, 138, .08); } }
@keyframes dat-signal {
  0% { box-shadow: 0 0 0 0 rgba(216, 137, 36, .36); }
  72%, 100% { box-shadow: 0 0 0 9px rgba(216, 137, 36, 0); }
}
@keyframes dat-float {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50% { transform: translateY(-4px) rotate(1deg); }
}
@media (prefers-color-scheme: dark) {
  .dat-shell {
    --dat-ink: #edf2ef;
    --dat-muted: #aeb9b4;
    --dat-paper: #101817;
    --dat-panel: rgba(24, 35, 33, .88);
    --dat-line: rgba(226, 238, 233, .12);
    background:
      radial-gradient(circle at 12% 8%, rgba(35, 198, 172, .13), transparent 31%),
      radial-gradient(circle at 90% 18%, rgba(224, 151, 55, .11), transparent 28%),
      repeating-linear-gradient(0deg, transparent 0 27px, rgba(255, 255, 255, .018) 28px),
      var(--dat-paper);
  }
  .dat-avatar { background: linear-gradient(145deg, #263431, #17211f); }
  .dat-role, .dat-mode, .dat-note { background: rgba(255, 255, 255, .035); color: #c7d0cc; }
}
@media (max-width: 760px) {
  .dat-shell { padding: 20px; }
  .dat-heading { grid-template-columns: 1fr; align-items: start; }
  .dat-command-deck { grid-template-columns: 1fr; }
  .dat-commander, .dat-mission-empty { min-height: 240px; }
}
@media (prefers-reduced-motion: reduce) {
  .dat-shell *, .dat-shell *::before, .dat-shell *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
`
        document.head.appendChild(style)
      }

      const rosterSnapshot = {
        phase: 'awaiting-host',
        agents: [
          {
            id: 'deepseek', displayName: 'DeepSeek', avatar: '🧑‍✈️', supportLevel: 'core',
            positioning: agentRolePolicy.defaultPositioning.deepseek,
          },
          {
            id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', supportLevel: 'candidate',
            positioning: agentRolePolicy.defaultPositioning['claude-code'],
          },
          {
            id: 'codex', displayName: 'Codex', avatar: '🧑‍🔬', supportLevel: 'candidate',
            positioning: agentRolePolicy.defaultPositioning.codex,
          },
          {
            id: 'antigravity', displayName: 'Antigravity', avatar: '🧑‍🚀', supportLevel: 'blocked',
            positioning: agentRolePolicy.defaultPositioning.antigravity,
          },
          {
            id: 'pi', displayName: 'Pi', avatar: '🧑‍🔧', supportLevel: 'experimental',
            positioning: agentRolePolicy.defaultPositioning.pi,
          },
        ],
      }

      const rosterStore = createSnapshotStore(rosterSnapshot)
      const missionStore = createSnapshotStore({ phase: 'awaiting-host', run: null })

      function Header(props) {
        return h('header', { className: 'dat-heading' },
          h('div', null,
            h('p', { className: 'dat-kicker' }, props.kicker),
            h('h2', { className: 'dat-title' }, props.title),
            h('p', { className: 'dat-description' }, props.description)),
          h('span', { className: 'dat-mode' }, props.mode))
      }

      function availabilityText(agent, phase) {
        if (phase === 'scanning') return '正在扫描…'
        if (phase === 'error') return '扫描失败'
        if (agent.availability === 'ready') return '内置可用'
        if (agent.availability === 'detected') {
          return agent.executablePath === null ? '已检测' : `已检测 · ${agent.executablePath}`
        }
        if (agent.availability === 'missing') return '未安装'
        return '等待主机扫描'
      }

      const roleLabels = {
        coordinate: '指挥',
        plan: '规划',
        execute: '执行',
        synthesize: '汇总',
        review: '复审',
        research: '研究',
      }
      const missionAgentLabels = {
        deepseek: { name: 'DeepSeek', avatar: '🧑‍✈️' },
        'claude-code': { name: 'Claude Code', avatar: '🧑‍💼' },
        codex: { name: 'Codex', avatar: '🧑‍🔬' },
        antigravity: { name: 'Antigravity', avatar: '🧑‍🚀' },
        pi: { name: 'Pi', avatar: '🧑‍🔧' },
      }
      const missionStateLabels = {
        planned: '已计划',
        pending: '等待',
        running: '运行中',
        completed: '已完成',
        cancelled: '已取消',
        failed: '失败',
      }

      function AgentCard(agent, phase, settingsSnapshot, roleEditor) {
        const positioning = positioningOf(agent, settingsSnapshot)
        const selectedEditable = positioning.filter(role => (
          agentRolePolicy.editableRoleIds.includes(role)
        ))
        const settingsWritable = settingsSnapshot.status === 'ready' && settingsSnapshot.writable === true
        const fixedRoles = agent.id === agentRolePolicy.commanderAgentId
          ? positioning.filter(role => agentRolePolicy.commanderRoleIds.includes(role))
          : []
        return h('article', { className: 'dat-agent', key: agent.id },
          h('span', {
            className: 'dat-support',
            'data-level': agent.supportLevel,
          }, agent.supportLevel),
          h('div', { className: 'dat-avatar', 'aria-hidden': 'true' }, agent.avatar),
          h('h3', { className: 'dat-agent-name' }, agent.displayName),
          h('p', { className: 'dat-agent-status' }, availabilityText(agent, phase)),
          h('div', { className: 'dat-roles' },
            fixedRoles.map(role => h('span', {
              className: 'dat-role',
              key: role,
              'data-agent-id': agent.id,
              'data-role': role,
            }, roleLabels[role] ?? role)),
            agentRolePolicy.editableRoleIds.map(role => h('button', {
              className: 'dat-role dat-role-toggle',
              key: role,
              type: 'button',
              'data-agent-id': agent.id,
              'data-role': role,
              'aria-pressed': selectedEditable.includes(role),
              disabled: !settingsWritable
                || (agent.id !== agentRolePolicy.commanderAgentId
                  && selectedEditable.length === 1 && selectedEditable.includes(role)),
              onClick: () => roleEditor.toggle(agent, role),
            }, roleLabels[role] ?? role))))
      }

      function AgentRosterView(props) {
        const snapshot = React.useSyncExternalStore(
          props.store.subscribe,
          props.store.getSnapshot,
          props.store.getSnapshot,
        )
        const settingsSnapshot = React.useSyncExternalStore(
          props.settings.subscribe,
          props.settings.getSnapshot,
          props.settings.getSnapshot,
        )
        return h('section', { className: 'dat-shell dat-roster-view' },
          Header({
            kicker: 'Expert roster',
            title: '专家名册',
            description: 'DeepSeek 按任务需要组建专家团。安装状态来自主机只读扫描，定位来自当前团队配置。',
            mode: snapshot.phase === 'ready' ? '主机已同步' : '只读扫描',
          }),
          h('div', { className: 'dat-grid' }, snapshot.agents.map(agent => AgentCard(
            agent, snapshot.phase, settingsSnapshot, props.roleEditor,
          ))),
          h('p', { className: 'dat-note' },
            settingsSnapshot.status === 'ready' && settingsSnapshot.writable
              ? '点击角色即可调整团队定位，修改会保存到 Harness 用户设置。安装状态与支持等级仍相互独立。'
              : '当前设置连接只读；安装状态与支持等级相互独立。'))
      }

      function MissionCommandView(props) {
        const snapshot = React.useSyncExternalStore(
          props.store.subscribe,
          props.store.getSnapshot,
          props.store.getSnapshot,
        )
        const run = snapshot.run
        const mode = snapshot.phase === 'error'
          ? '连接异常'
          : run === null ? '空闲' : missionStateLabels[run.status]
        const missionBody = run === null
          ? h('article', { className: 'dat-mission-empty' },
            h('h3', null, '等待 DeepSeek 组建专家团'),
            h('p', null,
              '先运行一次无模型演示，验证并行分派、依赖交接、状态刷新和取消；不会启动任何真实 Provider。'),
            h('button', {
              className: 'dat-action',
              type: 'button',
              'data-action': 'start-demo',
              disabled: snapshot.phase === 'starting',
              onClick: () => props.controller.start(),
            }, snapshot.phase === 'starting' ? '正在启动…' : '运行无模型演示'))
          : h('article', { className: 'dat-mission-board' },
            h('span', { className: 'dat-kicker' }, 'No-model demo'),
            h('h3', null, run.goal),
            h('div', { className: 'dat-mission-meta' },
              `任务 ${run.id} · ${missionStateLabels[run.status]}`),
            h('div', { className: 'dat-progress' },
              `${run.progress.completed} / ${run.progress.total}`),
            h('div', { className: 'dat-task-grid' }, run.assignments.map(assignment => {
              const agent = missionAgentLabels[assignment.agentId] ?? {
                name: assignment.agentId,
                avatar: '🧑‍💻',
              }
              const detail = assignment.error ?? assignment.summary
                ?? (assignment.dependsOn.length > 0
                  ? `等待 ${assignment.dependsOn.join(' + ')}`
                  : `${roleLabels[assignment.role] ?? assignment.role} 节点`)
              return h('div', {
                className: 'dat-task',
                key: assignment.id,
                'data-state': assignment.state,
              },
              h('span', { className: 'dat-task-avatar', 'aria-hidden': 'true' }, agent.avatar),
              h('div', null,
                h('strong', null, `${agent.name} · ${assignment.title}`),
                h('p', null, detail)),
              h('span', { className: 'dat-task-state' }, missionStateLabels[assignment.state]))
            })),
            run.error === null ? null : h('p', { className: 'dat-note' }, run.error),
            h('button', {
              className: 'dat-action',
              type: 'button',
              'data-action': run.status === 'running' ? 'cancel-demo' : 'start-demo',
              'data-tone': run.status === 'running' ? 'danger' : 'normal',
              disabled: snapshot.phase === 'starting',
              onClick: () => run.status === 'running'
                ? props.controller.cancel()
                : props.controller.start(),
            }, snapshot.phase === 'starting'
              ? '正在启动…'
              : run.status === 'running' ? '取消演示' : '再次运行'))
        return h('section', { className: 'dat-shell dat-mission-view' },
          Header({
            kicker: 'Mission command',
            title: '任务指挥台',
            description: 'DeepSeek 负责理解目标、选择专家、分派任务与汇总结论；确定性运行时负责权限和状态。',
            mode,
          }),
          h('div', { className: 'dat-command-deck' },
            h('article', { className: 'dat-commander' },
              h('div', { className: 'dat-commander-avatar', 'aria-hidden': 'true' },
                missionAgentLabels.deepseek.avatar),
              h('strong', null, missionAgentLabels.deepseek.name),
              h('span', null, '专家团指挥 / 结果汇总')),
            missionBody))
      }

      return {
        inject: ['slots', 'remote', 'connection', 'settingsScope'],
        apply(ctx) {
          const roleSettings = ctx.settingsScope.bind({ namespace: AGENT_TEAM_SETTINGS_NAMESPACE })
          const roleEditor = createRoleEditor(roleSettings)
          const missionController = createMissionController(ctx.remote, missionStore)
          ctx.effect(async () => {
            let disposeRemote
            try {
              disposeRemote = await ctx.remote.$mount(agentTeamRemoteContribution)
            } catch (_error) {
              rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'error' })
              missionStore.setSnapshot({ ...missionStore.getSnapshot(), phase: 'error' })
              return undefined
            }

            let active = true
            let refreshGeneration = 0
            const refreshRoster = async () => {
              const generation = ++refreshGeneration
              rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'scanning' })
              try {
                const answered = await ctx.remote.agentTeam.snapshot()
                if (!active || generation !== refreshGeneration) return
                if (answered?.ok !== true) throw new Error('Host rejected Agent roster snapshot')
                rosterStore.setSnapshot({ phase: 'ready', ...parseRosterSnapshot(answered.value) })
              } catch (_error) {
                if (active && generation === refreshGeneration) {
                  rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'error' })
                }
              }
            }
            const refreshAll = () => Promise.all([
              refreshRoster(),
              missionController.refresh(),
            ])
            const disposeReset = ctx.on('connection/reset', refreshAll)
            await refreshAll()
            return async () => {
              active = false
              disposeReset()
              missionController.dispose()
              await disposeRemote()
            }
          }, 'dsh-agent-team: remote roster')

          ctx.effect(() => {
            const disposeSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({
              name: 'settings.section',
              id: 'agent-team',
              order: 45,
              label: '专家团',
              inject: () => ({ store: rosterStore, settings: roleSettings, roleEditor }),
            }, AgentRosterView))
            const disposeMission = ctx.slots.inject('conversation.view', () => ctx.slots.register({
              name: 'conversation.view',
              id: 'agent-team',
              order: 45,
              label: '专家团',
              inject: () => ({ store: missionStore, controller: missionController }),
            }, MissionCommandView))
            return () => {
              disposeMission()
              disposeSettings()
            }
          }, 'dsh-agent-team: browser slots')
        },
      }
    },
  })
})()
