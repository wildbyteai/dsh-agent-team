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

/** Host Typert contribution loaded automatically for the plugin's Loader entry. */
export const TYPERT = {
  package: 'dsh-agent-team',
  face: 'host',
  schemas: [],
  invocations: [{
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
  }],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
