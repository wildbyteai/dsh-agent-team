;(function registerAgentTeamBrowserBundle() {
  const PLUGIN_ID = 'dsh-agent-team'

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory(require) {
      const React = require('react')
      const h = React.createElement

      function parseRosterSnapshot(value) {
        const availability = new Set(['ready', 'detected', 'missing'])
        const supportLevels = new Set(['core', 'candidate', 'blocked', 'experimental'])
        if (value === null || typeof value !== 'object' || Array.isArray(value)
          || value.schemaVersion !== 1 || typeof value.capturedAt !== 'string'
          || !Array.isArray(value.agents)) {
          throw new TypeError('agentTeam snapshot has an invalid envelope')
        }
        const agents = value.agents.map(agent => {
          if (agent === null || typeof agent !== 'object' || Array.isArray(agent)
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

      const rosterRemoteContribution = {
        package: PLUGIN_ID,
        descriptors: [{
          id: `${PLUGIN_ID}#agentTeam/snapshot`,
          service: 'agentTeam',
          namespace: 'agentTeam',
          method: 'snapshot',
          invocation: { kind: 'direct' },
          parameters: [],
          result: {
            mode: 'strict',
            typeSymbol: 'dsh-agent-team#AgentRosterSnapshot',
            schema: { parse: parseRosterSnapshot },
          },
        }],
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
            positioning: ['指挥', '规划', '执行', '汇总'],
          },
          {
            id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', supportLevel: 'candidate',
            positioning: ['规划', '复审'],
          },
          {
            id: 'codex', displayName: 'Codex', avatar: '🧑‍🔬', supportLevel: 'candidate',
            positioning: ['执行', '复审'],
          },
          {
            id: 'antigravity', displayName: 'Antigravity', avatar: '🧑‍🚀', supportLevel: 'blocked',
            positioning: ['执行'],
          },
          {
            id: 'pi', displayName: 'Pi', avatar: '🧑‍🔧', supportLevel: 'experimental',
            positioning: ['研究', '执行'],
          },
        ],
      }

      const missionSnapshot = {
        phase: 'idle',
        commander: { id: 'deepseek', displayName: 'DeepSeek', avatar: '🧑‍✈️' },
      }
      const rosterStore = createSnapshotStore(rosterSnapshot)

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

      function AgentCard(agent, phase) {
        return h('article', { className: 'dat-agent', key: agent.id },
          h('span', {
            className: 'dat-support',
            'data-level': agent.supportLevel,
          }, agent.supportLevel),
          h('div', { className: 'dat-avatar', 'aria-hidden': 'true' }, agent.avatar),
          h('h3', { className: 'dat-agent-name' }, agent.displayName),
          h('p', { className: 'dat-agent-status' }, availabilityText(agent, phase)),
          h('div', { className: 'dat-roles' },
            agent.positioning.map(role => h('span', { className: 'dat-role', key: role }, roleLabels[role] ?? role))))
      }

      function AgentRosterView(props) {
        const snapshot = React.useSyncExternalStore(
          props.store.subscribe,
          props.store.getSnapshot,
          props.store.getSnapshot,
        )
        return h('section', { className: 'dat-shell dat-roster-view' },
          Header({
            kicker: 'Expert roster',
            title: '专家名册',
            description: 'DeepSeek 按任务需要组建专家团。安装状态来自主机只读扫描，定位来自当前团队配置。',
            mode: snapshot.phase === 'ready' ? '主机已同步' : '只读扫描',
          }),
          h('div', { className: 'dat-grid' }, snapshot.agents.map(agent => AgentCard(agent, snapshot.phase))),
          h('p', { className: 'dat-note' },
            '安装状态与支持等级相互独立：已检测到的 Agent 仍可能因为版本、权限或沙箱条件而被限制。'))
      }

      function MissionCommandView(props) {
        return h('section', { className: 'dat-shell dat-mission-view' },
          Header({
            kicker: 'Mission command',
            title: '任务指挥台',
            description: 'DeepSeek 负责理解目标、选择专家、分派任务与汇总结论；确定性运行时负责权限和状态。',
            mode: '空闲',
          }),
          h('div', { className: 'dat-command-deck' },
            h('article', { className: 'dat-commander' },
              h('div', { className: 'dat-commander-avatar', 'aria-hidden': 'true' },
                props.projection.commander.avatar),
              h('strong', null, props.projection.commander.displayName),
              h('span', null, '专家团指挥 / 结果汇总')),
            h('article', { className: 'dat-mission-empty' },
              h('h3', null, '等待 DeepSeek 组建专家团'),
              h('p', null,
                '提交任务后，指挥台会展示本次选择的专家、并行任务、依赖关系、交接状态和质量关卡。'))))
      }

      return {
        inject: ['slots', 'remote', 'connection'],
        apply(ctx) {
          ctx.effect(async () => {
            let disposeRemote
            try {
              disposeRemote = await ctx.remote.$mount(rosterRemoteContribution)
            } catch (_error) {
              rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'error' })
              return undefined
            }

            let active = true
            const refreshRoster = async () => {
              rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'scanning' })
              try {
                const answered = await ctx.remote.agentTeam.snapshot()
                if (!active) return
                if (answered?.ok !== true) throw new Error('Host rejected Agent roster snapshot')
                rosterStore.setSnapshot({ phase: 'ready', ...parseRosterSnapshot(answered.value) })
              } catch (_error) {
                if (active) rosterStore.setSnapshot({ ...rosterStore.getSnapshot(), phase: 'error' })
              }
            }
            const disposeReset = ctx.on('connection/reset', refreshRoster)
            await refreshRoster()
            return async () => {
              active = false
              disposeReset()
              await disposeRemote()
            }
          }, 'dsh-agent-team: remote roster')

          ctx.effect(() => {
            const disposeSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({
              name: 'settings.section',
              id: 'agent-team',
              order: 45,
              label: '专家团',
              inject: () => ({ store: rosterStore }),
            }, AgentRosterView))
            const disposeMission = ctx.slots.inject('conversation.view', () => ctx.slots.register({
              name: 'conversation.view',
              id: 'agent-team',
              order: 45,
              label: '专家团',
              inject: () => ({ projection: missionSnapshot }),
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
