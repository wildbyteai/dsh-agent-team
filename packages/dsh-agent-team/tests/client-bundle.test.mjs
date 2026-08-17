import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('Browser bundle registers the expert roster and mission command views', async () => {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let handoff
  const styles = []
  const context = {
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
  }
  vm.runInNewContext(code, context)

  assert.equal(handoff.id, 'dsh-agent-team')
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
  const remoteResponses = [{
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:00:00.000Z',
      agents: [
        {
          id: 'deepseek', displayName: 'DeepSeek', avatar: '🧑‍✈️', command: null,
          availability: 'ready', executablePath: null, supportLevel: 'core',
          positioning: ['coordinate', 'plan', 'execute', 'synthesize'],
        },
        {
          id: 'codex', displayName: 'Codex', avatar: '🧑‍🔬', command: 'codex',
          availability: 'detected', executablePath: '/tools/codex', supportLevel: 'candidate',
          positioning: ['execute', 'review'],
        },
      ],
    },
  }]
  const remote = {
    async $mount(contribution) {
      remoteMounts.push(contribution)
      this.agentTeam = {
        snapshot: async () => remoteResponses.shift(),
      }
      return () => { delete this.agentTeam }
    },
  }
  const eventListeners = new Map()
  const effectDisposers = []
  const pendingEffects = []
  const ctx = {
    remote,
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
  await ctx.settle()

  assert.equal(remoteMounts.length, 1)
  assert.equal(remoteMounts[0].package, 'dsh-agent-team')
  assert.equal(remoteMounts[0].descriptors[0].id, 'dsh-agent-team#agentTeam/snapshot')

  const registrations = entries.filter(entry => entry.kind === 'registration')
  assert.deepEqual(registrations.map(entry => ({
    name: entry.options.name,
    id: entry.options.id,
    label: entry.options.label,
  })), [
    { name: 'settings.section', id: 'agent-team', label: '专家团' },
    { name: 'conversation.view', id: 'agent-team', label: '专家团' },
  ])

  const settingsText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(settingsText, /专家名册/)
  assert.match(settingsText, /DeepSeek/)
  assert.match(settingsText, /Codex/)
  assert.match(settingsText, /内置可用/)
  assert.match(settingsText, /已检测/)
  assert.match(settingsText, /\/tools\/codex/)
  assert.match(settingsText, /复审/)
  assert.doesNotMatch(settingsText, /等待主机扫描/)

  remoteResponses.push({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:01:00.000Z',
      agents: [{
        id: 'codex', displayName: 'Codex', avatar: '🧑‍🔬', command: 'codex',
        availability: 'missing', executablePath: null, supportLevel: 'candidate',
        positioning: ['execute', 'review'],
      }],
    },
  })
  await ctx.emit('connection/reset')
  const refreshedText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(refreshedText, /未安装/)

  const staleResponse = deferred()
  const currentResponse = deferred()
  remoteResponses.push(staleResponse.promise, currentResponse.promise)
  const staleRefresh = ctx.emit('connection/reset')
  const currentRefresh = ctx.emit('connection/reset')

  currentResponse.resolve({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:03:00.000Z',
      agents: [{
        id: 'codex', displayName: 'Codex Current', avatar: '🧑‍🔬', command: 'codex',
        availability: 'detected', executablePath: '/tools/current-codex', supportLevel: 'candidate',
        positioning: ['execute', 'review'],
      }],
    },
  })
  await currentRefresh
  staleResponse.resolve({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:02:00.000Z',
      agents: [{
        id: 'codex', displayName: 'Codex Stale', avatar: '🧑‍🔬', command: 'codex',
        availability: 'detected', executablePath: '/tools/stale-codex', supportLevel: 'candidate',
        positioning: ['execute', 'review'],
      }],
    },
  })
  await staleRefresh

  const concurrentRefreshText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(concurrentRefreshText, /Codex Current/)
  assert.match(concurrentRefreshText, /\/tools\/current-codex/)
  assert.doesNotMatch(concurrentRefreshText, /Codex Stale/)

  const staleFailure = deferred()
  const newestSuccess = deferred()
  remoteResponses.push(staleFailure.promise, newestSuccess.promise)
  const failingRefresh = ctx.emit('connection/reset')
  const successfulRefresh = ctx.emit('connection/reset')

  newestSuccess.resolve({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:05:00.000Z',
      agents: [{
        id: 'pi', displayName: 'Pi Current', avatar: '🧑‍🔧', command: 'pi',
        availability: 'detected', executablePath: '/tools/pi', supportLevel: 'experimental',
        positioning: ['research', 'execute'],
      }],
    },
  })
  await successfulRefresh
  staleFailure.reject(new Error('stale connection failed'))
  await failingRefresh

  const staleFailureText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(staleFailureText, /Pi Current/)
  assert.match(staleFailureText, /主机已同步/)
  assert.doesNotMatch(staleFailureText, /扫描失败/)

  remoteResponses.push({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:06:00.000Z',
      unexpected: true,
      agents: [],
    },
  })
  await ctx.emit('connection/reset')
  const unknownEnvelopeText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(unknownEnvelopeText, /扫描失败/)

  remoteResponses.push({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:07:00.000Z',
      agents: [{
        id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', command: 'claude',
        availability: 'detected', executablePath: '/tools/claude', supportLevel: 'candidate',
        positioning: ['plan', 'review'],
      }],
    },
  })
  await ctx.emit('connection/reset')
  const recoveredText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(recoveredText, /Claude Code/)
  assert.match(recoveredText, /主机已同步/)

  remoteResponses.push({
    ok: true,
    value: {
      schemaVersion: 1,
      capturedAt: '2026-08-17T12:08:00.000Z',
      agents: [{
        id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', command: 'claude',
        availability: 'detected', executablePath: '/tools/claude', supportLevel: 'candidate',
        positioning: ['plan', 'review'], unexpected: true,
      }],
    },
  })
  await ctx.emit('connection/reset')
  const unknownAgentText = textOf(registrations[0].component(registrations[0].options.inject()))
  assert.match(unknownAgentText, /扫描失败/)

  const missionText = textOf(registrations[1].component(registrations[1].options.inject()))
  assert.match(missionText, /任务指挥台/)
  assert.match(missionText, /等待 DeepSeek 组建专家团/)

  assert.equal(styles.length, 1)
  assert.equal(styles[0].attributes['data-plugin'], 'dsh-agent-team')

  await ctx.dispose()
  assert.deepEqual(removed, ['agent-team', 'agent-team'])
  assert.equal(remote.agentTeam, undefined)
})
