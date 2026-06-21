import { getSlashCommandPrefix } from '../constants.js';
import type { AgentPlatformConfig } from './types.js';

/**
 * Single source of truth for agent-platform metadata (pure data, no behavior).
 * Both the CLI configurators and core skill discovery read from this — so
 * directories/flags/skillDirs are maintained in exactly one place.
 */
export const AGENT_PLATFORMS = defineAgentPlatforms({
  codex: {
    id: 'codex',
    name: 'Codex',
    configDir: '.codex',
    cliFlag: 'codex',
    defaultChecked: true,
    skillTarget: null,
    supportsAgentSkills: true,
    skillDirs: {
      project: ['.agents/skills'],
      global: ['.agents/skills'],
    },
    templateContext: {
      cmdRefPrefix: '$',
      userActionLabel: 'Skills',
      cliFlag: 'codex',
    },
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    configDir: '.claude',
    cliFlag: 'claude',
    defaultChecked: true,
    skillTarget: '.claude/skills',
    skillDirs: { project: ['.claude/skills'], global: ['.claude/skills'] },
    sessionIdEnv: 'CLAUDE_CODE_SESSION_ID',
    hookSessionIdField: 'session_id',
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'claude',
    },
  },
});

export type AgentTool = keyof typeof AGENT_PLATFORMS;
export type RegisteredAgentPlatformConfig = (typeof AGENT_PLATFORMS)[AgentTool];

export function getAgentPlatform(id: AgentTool): RegisteredAgentPlatformConfig {
  return AGENT_PLATFORMS[id];
}

/**
 * Resolve the current agent session id from whichever platform env var is set
 * (e.g. Claude's CLAUDE_CODE_SESSION_ID). Returns null when none is present —
 * callers degrade (skip injection backfill) rather than fail.
 * @param env Environment to read (defaults to process.env; injectable for tests).
 */
export function resolveSessionId(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const platform of Object.values(AGENT_PLATFORMS)) {
    const key = platform.sessionIdEnv;
    const value = key ? env[key] : undefined;
    if (value) return value;
  }
  return null;
}

/**
 * Extract the session id from a hook's stdin JSON payload, trying each platform's
 * declared field (e.g. Claude's `session_id`). Returns null when absent.
 * @param payload Parsed hook stdin JSON object.
 */
export function sessionIdFromHookPayload(payload: Record<string, unknown>): string | null {
  for (const platform of Object.values(AGENT_PLATFORMS)) {
    const field = platform.hookSessionIdField;
    const value = field ? payload[field] : undefined;
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

export function getInitAgentChoices(): RegisteredAgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
}

/** Canonical (cross-agent) skill directory, relative to the project root. */
export const CANONICAL_SKILL_DIR = '.agents/skills';

/** Project-relative skill dirs to scan, deduped across all platforms + canonical. */
export function getProjectSkillDirs(): string[] {
  return unique([CANONICAL_SKILL_DIR, ...Object.values(AGENT_PLATFORMS).flatMap(p => p.skillDirs.project)]);
}

/** Home-relative skill dirs to scan, deduped across all platforms. */
export function getGlobalSkillDirs(): string[] {
  return unique(Object.values(AGENT_PLATFORMS).flatMap(p => p.skillDirs.global));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// Pins each entry's `id`/`cliFlag` to its registry key so `AgentTool` stays a
// narrow union (and the key↔id↔cliFlag invariant is checked at compile time).
function defineAgentPlatforms<const TPlatforms extends Record<string, AgentPlatformConfig<string>>>(platforms: {
  [TAgentTool in keyof TPlatforms]: AgentPlatformConfig<TAgentTool & string>;
}): {
  [TAgentTool in keyof TPlatforms]: AgentPlatformConfig<TAgentTool & string>;
} {
  return platforms;
}
