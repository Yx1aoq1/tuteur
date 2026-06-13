import type {
  AgentPlatformConfig,
  ConfigureAgentContext,
  ConfigureAgentResult,
  PlatformConfigurator,
} from '../types/agent.js';
import { configureClaude } from './claude.js';
import { configureCodex } from './codex.js';
import { configureGemini } from './gemini.js';
import { getSlashCommandPrefix } from '../constants/product.js';

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

const PLATFORM_CONFIGURATORS: Record<AgentTool, PlatformConfigurator> = {
  codex: configureCodex,
  claude: configureClaude,
  gemini: configureGemini,
};

export function configureAgentPlatform(
  platformId: AgentTool,
  context: ConfigureAgentContext,
): Promise<ConfigureAgentResult> {
  return PLATFORM_CONFIGURATORS[platformId](context, AGENT_PLATFORMS[platformId]);
}

export function getAgentPlatform(id: AgentTool): RegisteredAgentPlatformConfig {
  return AGENT_PLATFORMS[id];
}

export function getInitAgentChoices(): RegisteredAgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
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
