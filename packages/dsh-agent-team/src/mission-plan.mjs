/** Build the runtime-owned mission plan from a proposed expert assignment graph. */
export function createMissionPlan(input) {
  const agents = new Map(input.roster.agents.map(agent => [agent.id, agent]))
  const commander = agents.get(input.commanderId)
  if (commander === undefined) throw new Error(`unknown commander: ${input.commanderId}`)

  const assignments = input.assignments.map(assignment => {
    const agent = agents.get(assignment.agentId)
    if (agent === undefined) throw new Error(`unknown agent: ${assignment.agentId}`)
    if (agent.availability !== 'ready' && agent.availability !== 'detected') {
      throw new Error(
        `unavailable expert ${assignment.agentId} cannot receive assignment ${assignment.id}`,
      )
    }
    if (!agent.positioning.includes(assignment.role)) {
      throw new Error(`expert ${assignment.agentId} is not positioned for role ${assignment.role}`)
    }
    if (assignment.mode === 'write' && agent.supportLevel === 'blocked') {
      throw new Error(
        `blocked expert ${assignment.agentId} cannot receive write assignment ${assignment.id}`,
      )
    }
    return {
      id: assignment.id,
      title: assignment.title,
      agentId: assignment.agentId,
      role: assignment.role,
      mode: assignment.mode,
      dependsOn: [...assignment.dependsOn],
      state: 'pending',
    }
  })

  return {
    schemaVersion: 1,
    id: input.id,
    goal: input.goal,
    strategy: 'expert-team',
    commanderId: input.commanderId,
    status: 'draft',
    assignments,
  }
}
