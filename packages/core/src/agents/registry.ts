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
    skillDirs: { project: ['.agent/skill', '.codex/skills'], global: ['.codex/skills'] },
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
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'claude',
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    configDir: '.gemini',
    cliFlag: 'gemini',
    defaultChecked: false,
    skillTarget: null,
    supportsAgentSkills: true,
    skillDirs: { project: ['.agent/skill'], global: ['.gemini/skills'] },
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'gemini',
    },
  },
});

export type AgentTool = keyof typeof AGENT_PLATFORMS;
export type RegisteredAgentPlatformConfig = (typeof AGENT_PLATFORMS)[AgentTool];

export function getAgentPlatform(id: AgentTool): RegisteredAgentPlatformConfig {
  return AGENT_PLATFORMS[id];
}

export function getInitAgentChoices(): RegisteredAgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
}

/** Canonical (cross-agent) skill directory, relative to the project root. */
export const CANONICAL_SKILL_DIR = '.agent/skill';

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
