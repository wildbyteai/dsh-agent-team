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

export async function createBrowserHarness() {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let handoff
  const styles = []
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
  const remote = {
    async $mount(contribution) {
      remoteMounts.push(contribution)
      this.agentTeam = {
        snapshot: async () => remoteResponses.shift(),
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
    removed,
    settingsBindings,
    settingsWrites,
    styles,
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
