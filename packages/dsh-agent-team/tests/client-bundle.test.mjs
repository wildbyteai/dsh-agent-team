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
  }
  const browserPlugin = handoff.factory(specifier => {
    if (specifier === 'react') return React
    throw new Error(`unexpected browser dependency: ${specifier}`)
  })

  const entries = []
  const removed = []
  const ctx = {
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
    effect(effect) {
      this.dispose = effect()
    },
  }

  browserPlugin.apply(ctx)

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
  assert.match(settingsText, /Claude Code/)
  assert.match(settingsText, /Codex/)
  assert.match(settingsText, /Antigravity/)
  assert.match(settingsText, /Pi/)
  assert.match(settingsText, /等待主机扫描/)

  const missionText = textOf(registrations[1].component(registrations[1].options.inject()))
  assert.match(missionText, /任务指挥台/)
  assert.match(missionText, /等待 DeepSeek 组建专家团/)

  assert.equal(styles.length, 1)
  assert.equal(styles[0].attributes['data-plugin'], 'dsh-agent-team')

  ctx.dispose()
  assert.deepEqual(removed, ['agent-team', 'agent-team'])
})
