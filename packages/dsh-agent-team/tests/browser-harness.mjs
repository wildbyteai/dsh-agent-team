import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

export function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children)
}

export function findNodes(node, predicate, matches = []) {
  if (node === null || node === undefined || typeof node !== 'object') return matches
  if (Array.isArray(node)) {
    for (const child of node) findNodes(child, predicate, matches)
    return matches
  }
  if (predicate(node)) matches.push(node)
  for (const child of node.children ?? []) findNodes(child, predicate, matches)
  return matches
}

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

export function agent(overrides = {}) {
  return {
    id: 'codex',
    displayName: 'Codex',
    avatar: '🧑‍🔬',
    command: 'codex',
    availability: 'detected',
    executablePath: '/tools/codex',
    supportLevel: 'candidate',
    positioning: ['execute', 'review'],
    ...overrides,
  }
}

export function rosterResponse(capturedAt, agents, envelopeOverrides = {}) {
  return {
    ok: true,
    value: { schemaVersion: 1, capturedAt, agents, ...envelopeOverrides },
  }
}

export function standardRosterResponse() {
  return rosterResponse('2026-08-17T12:00:00.000Z', [
    agent({
      id: 'deepseek', displayName: 'DeepSeek', avatar: '🧑‍✈️', command: null,
      availability: 'ready', executablePath: null, supportLevel: 'core',
      positioning: ['coordinate', 'plan', 'execute', 'synthesize'],
    }),
    agent(),
  ])
}

export function missionSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'mission-demo-1',
    goal: '验证 DeepSeek 专家团的并行协作',
    strategy: 'expert-team',
    commanderId: 'deepseek',
    status: 'running',
    error: null,
    openedAt: '2026-08-17T13:00:00.000Z',
    updatedAt: '2026-08-17T13:00:01.000Z',
    assignments: [
      {
        id: 'plan-options', title: '提出任务方案', agentId: 'claude-code', role: 'plan',
        mode: 'read', dependsOn: [], state: 'running', summary: null, error: null,
        startedAt: '2026-08-17T13:00:01.000Z', finishedAt: null,
      },
      {
        id: 'review-boundaries', title: '复审实现边界', agentId: 'codex', role: 'review',
        mode: 'read', dependsOn: [], state: 'running', summary: null, error: null,
        startedAt: '2026-08-17T13:00:01.000Z', finishedAt: null,
      },
      {
        id: 'synthesize-result', title: '汇总专家结论', agentId: 'deepseek', role: 'synthesize',
        mode: 'read', dependsOn: ['plan-options', 'review-boundaries'], state: 'pending',
        summary: null, error: null, startedAt: null, finishedAt: null,
      },
    ],
    progress: { completed: 0, total: 3 },
    artifacts: [],
    ...overrides,
  }
}

export async function createBrowserHarness() {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let handoff
  const styles = []
  const intervals = new Map()
  let nextIntervalId = 0
  vm.runInNewContext(code, {
    window: {
      __ModuleLoader__: {
        load(value) { handoff = value },
      },
    },
    document: {
      createElement() {
        return {
          attributes: {},
          setAttribute(key, value) { this.attributes[key] = value },
          textContent: '',
        }
      },
      head: {
        appendChild(node) { styles.push(node) },
      },
    },
    setInterval(callback) {
      const id = ++nextIntervalId
      intervals.set(id, callback)
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },
  })

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
  const browserPlugin = handoff.factory(specifier => {
    if (specifier === 'react') return React
    throw new Error(`unexpected browser dependency: ${specifier}`)
  })

  const entries = []
  const removed = []
  const remoteMounts = []
  const initialRoster = deferred()
  const remoteResponses = [initialRoster.promise]
  const missionResponses = [{ ok: true, value: null }]
  const startDemoResponses = []
  const cancelMissionResponses = []
  const remote = {
    async $mount(contribution) {
      remoteMounts.push(contribution)
      this.agentTeam = {
        snapshot: async () => remoteResponses.shift(),
        missionSnapshot: async () => (
          missionResponses.shift() ?? { ok: true, value: null }
        ),
        startDemo: async () => startDemoResponses.shift(),
        cancelMission: async () => cancelMissionResponses.shift(),
      }
      return () => { delete this.agentTeam }
    },
  }
  const settingsBindings = []
  const settingsWrites = []
  const settingsListeners = new Set()
  let settingsSnapshot = {
    status: 'ready',
    value: { roleOverrides: {} },
    base: { roleOverrides: {} },
    user: undefined,
    revision: 0,
    writable: true,
    mode: 'host',
  }
  const roleSettings = {
    getSnapshot: () => settingsSnapshot,
    subscribe(listener) {
      settingsListeners.add(listener)
      return () => { settingsListeners.delete(listener) }
    },
    async set(field, value) {
      settingsWrites.push({ field, value })
      settingsSnapshot = {
        ...settingsSnapshot,
        value: { ...settingsSnapshot.value, [field]: value },
        revision: settingsSnapshot.revision + 1,
      }
      for (const listener of [...settingsListeners]) listener()
    },
  }
  const eventListeners = new Map()
  const effectDisposers = []
  const pendingEffects = []
  const ctx = {
    remote,
    settingsScope: {
      bind(spec) {
        settingsBindings.push(spec)
        return roleSettings
      },
    },
    slots: {
      inject(name, mount) {
        entries.push({ kind: 'injection', name })
        const dispose = mount()
        return () => dispose?.()
      },
      register(options, component) {
        entries.push({ kind: 'registration', options, component })
        return () => { removed.push(options.id) }
      },
    },
    on(name, listener) {
      const listeners = eventListeners.get(name) ?? []
      listeners.push(listener)
      eventListeners.set(name, listeners)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    effect(effect) {
      const pending = Promise.resolve().then(effect).then(dispose => {
        if (typeof dispose === 'function') effectDisposers.push(dispose)
      })
      pendingEffects.push(pending)
    },
    async settle() {
      await Promise.all(pendingEffects)
    },
    async emit(name) {
      await Promise.all((eventListeners.get(name) ?? []).map(listener => listener()))
    },
    async dispose() {
      for (const dispose of effectDisposers.reverse()) await dispose()
    },
  }

  browserPlugin.apply(ctx)
  await Promise.resolve()

  function registration(name) {
    return entries.find(entry => entry.kind === 'registration' && entry.options.name === name)
  }

  return {
    ctx,
    entries,
    handoff,
    initialRoster,
    remote,
    remoteMounts,
    remoteResponses,
    missionResponses,
    startDemoResponses,
    cancelMissionResponses,
    removed,
    settingsBindings,
    settingsWrites,
    styles,
    activeIntervalCount: () => intervals.size,
    async tickIntervals() {
      await Promise.all([...intervals.values()].map(callback => callback()))
    },
    getSettingsSnapshot: () => settingsSnapshot,
    setSettingsSnapshot(next) { settingsSnapshot = next },
    renderMission: () => {
      const entry = registration('conversation.view')
      return entry.component(entry.options.inject())
    },
    renderSettings: () => {
      const entry = registration('settings.section')
      return entry.component(entry.options.inject())
    },
  }
}
