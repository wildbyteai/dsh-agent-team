import assert from 'node:assert/strict'
import test from 'node:test'
import { createMissionPlan } from '../src/mission-plan.mjs'

const roster = {
  schemaVersion: 1,
  capturedAt: '2026-08-17T10:00:00.000Z',
  agents: [
    {
      id: 'deepseek', availability: 'ready', supportLevel: 'core',
      positioning: ['coordinate', 'synthesize'],
    },
    {
      id: 'claude-code', availability: 'detected', supportLevel: 'candidate',
      positioning: ['plan', 'review'],
    },
    {
      id: 'codex', availability: 'detected', supportLevel: 'candidate',
      positioning: ['execute', 'review'],
    },
  ],
}

test('MissionPlan validates a dynamic expert team instead of imposing a fixed pipeline', () => {
  const plan = createMissionPlan({
    id: 'mission-001',
    goal: '评估并收敛插件架构',
    commanderId: 'deepseek',
    roster,
    assignments: [
      {
        id: 'architecture-options',
        title: '提出架构选项',
        agentId: 'claude-code',
        role: 'plan',
        mode: 'read',
        dependsOn: [],
      },
      {
        id: 'implementation-audit',
        title: '审计现有实现边界',
        agentId: 'codex',
        role: 'review',
        mode: 'read',
        dependsOn: [],
      },
      {
        id: 'decision',
        title: '综合专家结论',
        agentId: 'deepseek',
        role: 'synthesize',
        mode: 'read',
        dependsOn: ['architecture-options', 'implementation-audit'],
      },
    ],
  })

  assert.equal(plan.schemaVersion, 1)
  assert.equal(plan.strategy, 'expert-team')
  assert.equal(plan.commanderId, 'deepseek')
  assert.equal(plan.status, 'draft')
  assert.deepEqual(plan.assignments.map(assignment => ({
    id: assignment.id,
    agentId: assignment.agentId,
    state: assignment.state,
    dependsOn: assignment.dependsOn,
  })), [
    { id: 'architecture-options', agentId: 'claude-code', state: 'pending', dependsOn: [] },
    { id: 'implementation-audit', agentId: 'codex', state: 'pending', dependsOn: [] },
    {
      id: 'decision',
      agentId: 'deepseek',
      state: 'pending',
      dependsOn: ['architecture-options', 'implementation-audit'],
    },
  ])
})

test('MissionPlan preserves DeepSeek as the expert-team commander', () => {
  assert.throws(() => createMissionPlan({
    id: 'mission-wrong-commander',
    goal: '由 DeepSeek 指挥专家团',
    commanderId: 'codex',
    roster,
    assignments: [],
  }), /DeepSeek must remain the expert-team commander/)
})

test('MissionPlan rejects a write assignment when the selected expert is blocked', () => {
  const blockedRoster = {
    ...roster,
    agents: [
      ...roster.agents,
      {
        id: 'antigravity', availability: 'detected', supportLevel: 'blocked',
        positioning: ['execute'],
      },
    ],
  }

  assert.throws(() => createMissionPlan({
    id: 'mission-unsafe',
    goal: '修改工作区',
    commanderId: 'deepseek',
    roster: blockedRoster,
    assignments: [{
      id: 'write-files',
      title: '写入文件',
      agentId: 'antigravity',
      role: 'execute',
      mode: 'write',
      dependsOn: [],
    }],
  }), /blocked expert antigravity cannot receive write assignment write-files/)
})

test('MissionPlan rejects unavailable experts and role mismatches', () => {
  const unavailableRoster = {
    ...roster,
    agents: roster.agents.map(agent => agent.id === 'codex'
      ? { ...agent, availability: 'missing' }
      : agent),
  }
  const assignment = {
    id: 'review-code',
    title: '复审代码',
    agentId: 'codex',
    role: 'review',
    mode: 'read',
    dependsOn: [],
  }

  assert.throws(() => createMissionPlan({
    id: 'mission-missing',
    goal: '选择可用专家',
    commanderId: 'deepseek',
    roster: unavailableRoster,
    assignments: [assignment],
  }), /unavailable expert codex cannot receive assignment review-code/)

  assert.throws(() => createMissionPlan({
    id: 'mission-role-mismatch',
    goal: '按专家定位分派',
    commanderId: 'deepseek',
    roster,
    assignments: [{ ...assignment, role: 'plan' }],
  }), /expert codex is not positioned for role plan/)
})
