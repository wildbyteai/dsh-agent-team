import { z } from 'zod'

const agentSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatar: z.string(),
  command: z.string().nullable(),
  availability: z.enum(['ready', 'detected', 'missing']),
  executablePath: z.string().nullable(),
  supportLevel: z.enum(['core', 'candidate', 'blocked', 'experimental']),
  positioning: z.array(z.string()),
}).strict()

const rosterSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string(),
  agents: z.array(agentSchema),
}).strict()

const assignmentSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentId: z.string(),
  role: z.string(),
  mode: z.enum(['read', 'write']),
  dependsOn: z.array(z.string()),
  state: z.enum(['pending', 'running', 'completed', 'cancelled', 'failed']),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
}).strict()

const runSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  goal: z.string(),
  strategy: z.literal('expert-team'),
  commanderId: z.literal('deepseek'),
  status: z.enum(['planned', 'running', 'completed', 'cancelled', 'failed']),
  error: z.string().nullable(),
  openedAt: z.string(),
  updatedAt: z.string(),
  assignments: z.array(assignmentSnapshotSchema),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).strict(),
  artifacts: z.array(z.string()),
}).strict()

/** Host Typert contribution loaded automatically for the plugin's Loader entry. */
export const TYPERT = {
  package: 'dsh-agent-team',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: 'dsh-agent-team#agentTeam/snapshot',
      service: 'agentTeam',
      namespace: 'agentTeam',
      method: 'snapshot',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-agent-team#AgentRosterSnapshot',
        schema: rosterSnapshotSchema,
      },
    },
    {
      id: 'dsh-agent-team#agentTeam/missionSnapshot',
      service: 'agentTeam',
      namespace: 'agentTeam',
      method: 'missionSnapshot',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-agent-team#MissionRunSnapshotOrNull',
        schema: runSnapshotSchema.nullable(),
      },
    },
    {
      id: 'dsh-agent-team#agentTeam/startDemo',
      service: 'agentTeam',
      namespace: 'agentTeam',
      method: 'startDemo',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-agent-team#MissionRunSnapshot',
        schema: runSnapshotSchema,
      },
    },
    {
      id: 'dsh-agent-team#agentTeam/cancelMission',
      service: 'agentTeam',
      namespace: 'agentTeam',
      method: 'cancelMission',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-agent-team#MissionRunSnapshotOrNull',
        schema: runSnapshotSchema.nullable(),
      },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
