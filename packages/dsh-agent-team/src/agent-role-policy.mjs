export const COMMANDER_AGENT_ID = 'deepseek'
export const AGENT_ROLE_IDS = Object.freeze([
  'coordinate', 'plan', 'execute', 'review', 'research', 'synthesize',
])
export const EDITABLE_AGENT_ROLE_IDS = Object.freeze(['plan', 'execute', 'review', 'research'])
export const COMMANDER_ROLE_IDS = Object.freeze(['coordinate', 'synthesize'])
export const DEFAULT_AGENT_POSITIONING = Object.freeze({
  deepseek: Object.freeze(['coordinate', 'plan', 'execute', 'synthesize']),
  'claude-code': Object.freeze(['plan', 'review']),
  codex: Object.freeze(['execute', 'review']),
  antigravity: Object.freeze(['execute']),
  pi: Object.freeze(['research', 'execute']),
})
