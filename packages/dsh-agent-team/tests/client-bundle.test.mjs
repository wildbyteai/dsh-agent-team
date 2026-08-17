import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_ROLE_IDS,
  DEFAULT_AGENT_POSITIONING,
  EDITABLE_AGENT_ROLE_IDS,
} from '../src/agent-role-policy.mjs'
import {
  createBrowserHarness,
  findNodes,
  standardRosterResponse,
  textOf,
} from './browser-harness.mjs'

test('Browser bundle registers aligned expert roster and mission views', async () => {
  const harness = await createBrowserHarness()
  assert.equal(harness.handoff.id, 'dsh-agent-team')

  const initialView = harness.renderSettings()
  const initialRoleNodes = findNodes(initialView, node => (
    node.props?.['data-agent-id'] !== undefined && node.props?.['data-role'] !== undefined
  ))
  const browserDefaultPositioning = Object.fromEntries(
    Object.keys(DEFAULT_AGENT_POSITIONING).map(agentId => {
      const selected = initialRoleNodes
        .filter(node => node.props['data-agent-id'] === agentId
          && (node.type === 'span' || node.props['aria-pressed'] === true))
        .map(node => node.props['data-role'])
      return [agentId, AGENT_ROLE_IDS.filter(role => selected.includes(role))]
    }),
  )
  const hostDefaultPositioning = Object.fromEntries(
    Object.entries(DEFAULT_AGENT_POSITIONING).map(([agentId, roles]) => [
      agentId,
      AGENT_ROLE_IDS.filter(role => roles.includes(role)),
    ]),
  )
  assert.equal(JSON.stringify(browserDefaultPositioning), JSON.stringify(hostDefaultPositioning))
  const browserEditableRoles = initialRoleNodes
    .filter(node => node.type === 'button' && node.props['data-agent-id'] === 'codex')
    .map(node => node.props['data-role'])
  assert.equal(JSON.stringify(browserEditableRoles), JSON.stringify(EDITABLE_AGENT_ROLE_IDS))
  assert.match(textOf(initialView), /指挥/)
  assert.match(textOf(initialView), /汇总/)

  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  assert.equal(harness.remoteMounts.length, 1)
  assert.equal(harness.remoteMounts[0].package, 'dsh-agent-team')
  assert.equal(
    harness.remoteMounts[0].descriptors[0].id,
    'dsh-agent-team#agentTeam/snapshot',
  )
  const registrations = harness.entries.filter(entry => entry.kind === 'registration')
  assert.deepEqual(registrations.map(entry => ({
    name: entry.options.name,
    id: entry.options.id,
    label: entry.options.label,
  })), [
    { name: 'settings.section', id: 'agent-team', label: '专家团' },
    { name: 'conversation.view', id: 'agent-team', label: '专家团' },
  ])

  const settingsText = textOf(harness.renderSettings())
  assert.match(settingsText, /专家名册/)
  assert.match(settingsText, /DeepSeek/)
  assert.match(settingsText, /Codex/)
  assert.match(settingsText, /内置可用/)
  assert.match(settingsText, /已检测/)
  assert.match(settingsText, /\/tools\/codex/)
  assert.doesNotMatch(settingsText, /等待主机扫描/)
  assert.match(textOf(harness.renderMission()), /等待 DeepSeek 组建专家团/)
  assert.equal(harness.styles.length, 1)
  assert.equal(harness.styles[0].attributes['data-plugin'], 'dsh-agent-team')

  await harness.ctx.dispose()
  assert.deepEqual(harness.removed, ['agent-team', 'agent-team'])
  assert.equal(harness.remote.agentTeam, undefined)
})

test('Browser role editor serializes writes and respects writable role limits', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  assert.equal(harness.settingsBindings.length, 1)
  assert.equal(harness.settingsBindings[0].namespace, 'agent-team')
  const codexPlanButton = findNodes(
    harness.renderSettings(),
    node => node.type === 'button'
      && node.props['data-agent-id'] === 'codex'
      && node.props['data-role'] === 'plan',
  )[0]
  const codexResearchButton = findNodes(
    harness.renderSettings(),
    node => node.type === 'button'
      && node.props['data-agent-id'] === 'codex'
      && node.props['data-role'] === 'research',
  )[0]
  const planWrite = codexPlanButton.props.onClick()
  const researchWrite = codexResearchButton.props.onClick()
  await Promise.all([planWrite, researchWrite])
  assert.deepEqual(harness.settingsWrites.map(write => ({
    field: write.field,
    value: JSON.parse(JSON.stringify(write.value)),
  })), [
    { field: 'roleOverrides', value: { codex: ['plan', 'execute', 'review'] } },
    {
      field: 'roleOverrides',
      value: { codex: ['plan', 'execute', 'review', 'research'] },
    },
  ])

  harness.setSettingsSnapshot({
    ...harness.getSettingsSnapshot(),
    value: { roleOverrides: { codex: ['review'] } },
  })
  const singleRoleView = harness.renderSettings()
  const lastRole = findNodes(singleRoleView, node => node.type === 'button'
    && node.props['data-agent-id'] === 'codex'
    && node.props['data-role'] === 'review')[0]
  const addRole = findNodes(singleRoleView, node => node.type === 'button'
    && node.props['data-agent-id'] === 'codex'
    && node.props['data-role'] === 'plan')[0]
  assert.equal(lastRole.props.disabled, true)
  assert.equal(addRole.props.disabled, false)

  harness.setSettingsSnapshot({ ...harness.getSettingsSnapshot(), writable: false })
  const readOnlyButtons = findNodes(
    harness.renderSettings(),
    node => node.type === 'button' && node.props.className === 'dat-role dat-role-toggle',
  )
  assert.ok(readOnlyButtons.length > 0)
  assert.ok(readOnlyButtons.every(button => button.props.disabled === true))
  await harness.ctx.dispose()
})
