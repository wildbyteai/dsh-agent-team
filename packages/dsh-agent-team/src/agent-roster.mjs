import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const AGENTS = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    avatar: '🧑‍✈️',
    command: null,
    supportLevel: 'core',
    positioning: ['coordinate', 'plan', 'execute', 'synthesize'],
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    avatar: '🧑‍💼',
    command: 'claude',
    supportLevel: 'candidate',
    positioning: ['plan', 'review'],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    avatar: '🧑‍🔬',
    command: 'codex',
    supportLevel: 'candidate',
    positioning: ['execute', 'review'],
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    avatar: '🧑‍🚀',
    command: 'agy',
    supportLevel: 'blocked',
    positioning: ['execute'],
  },
  {
    id: 'pi',
    displayName: 'Pi',
    avatar: '🧑‍🔧',
    command: 'pi',
    supportLevel: 'experimental',
    positioning: ['research', 'execute'],
  },
]

/** Locate one executable without starting it or touching its configuration. */
export async function locateOnPath(command, options = {}) {
  const pathValue = options.pathValue ?? process.env.PATH ?? ''
  const accessExecutable = options.accessExecutable ?? (path => access(path, constants.X_OK))
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command)
    try {
      await accessExecutable(candidate)
      return candidate
    } catch {
      // Keep scanning PATH; absence and non-executable entries are equivalent here.
    }
  }
  return null
}

/** Create the read-only expert roster exposed to the runtime and UI projection. */
export function createAgentRoster(options = {}) {
  const locate = options.locate ?? locateOnPath
  const now = options.now ?? (() => new Date().toISOString())
  const roleOverrides = options.roleOverrides ?? {}

  return {
    async snapshot() {
      const agents = await Promise.all(AGENTS.map(async definition => {
        const executablePath = definition.command === null ? null : await locate(definition.command)
        return {
          id: definition.id,
          displayName: definition.displayName,
          avatar: definition.avatar,
          command: definition.command,
          availability: definition.command === null
            ? 'ready'
            : executablePath === null ? 'missing' : 'detected',
          executablePath,
          supportLevel: definition.supportLevel,
          positioning: [...(roleOverrides[definition.id] ?? definition.positioning)],
        }
      }))

      return {
        schemaVersion: 1,
        capturedAt: now(),
        agents,
      }
    },
  }
}
