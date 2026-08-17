import { z } from 'zod'
import { MissionRunSnapshotSchema } from '../src/mission-snapshot.mjs'

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

const runSnapshotSchema = MissionRunSnapshotSchema

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
