import { z } from 'zod'

export const AssignmentSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentId: z.string(),
  role: z.string(),
  mode: z.enum(['read', 'write']),
  dependsOn: z.array(z.string()),
  state: z.enum(['pending', 'running', 'completed', 'cancelled', 'failed', 'interrupted']),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
}).strict()

export const MissionRunSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  goal: z.string(),
  strategy: z.literal('expert-team'),
  commanderId: z.literal('deepseek'),
  status: z.enum(['planned', 'running', 'completed', 'cancelled', 'failed', 'interrupted']),
  error: z.string().nullable(),
  openedAt: z.string(),
  updatedAt: z.string(),
  assignments: z.array(AssignmentSnapshotSchema),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).strict(),
  artifacts: z.array(z.string()),
}).strict()

/** Parse and clone one strict MissionRun wire snapshot. */
export function parseMissionRunSnapshot(value) {
  try {
    return MissionRunSnapshotSchema.parse(value)
  } catch (error) {
    throw new TypeError('MissionRun mission snapshot is invalid', { cause: error })
  }
}
