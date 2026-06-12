import type {
  AgentPlatformConfig,
  AgentPlatformDefinition,
  ConfigureAgentContext,
  ConfigureAgentResult,
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
    skillLinkDir: null,
    templateContext: {
      cmdRefPrefix: '$',
      userActionLabel: 'Skills',
      cliFlag: 'codex',
    },
    configure: configureCodex,
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    configDir: '.claude',
    cliFlag: 'claude',
    defaultChecked: true,
    skillLinkDir: '.claude/skills',
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'claude',
    },
    configure: configureClaude,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    configDir: '.gemini',
    cliFlag: 'gemini',
    defaultChecked: false,
    skillLinkDir: null,
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'gemini',
    },
    configure: configureGemini,
  },
});

export type AgentTool = keyof typeof AGENT_PLATFORMS;
export type RegisteredAgentPlatformConfig = AgentPlatformConfig<AgentTool>;

export function configureAgentPlatform(
  platformId: AgentTool,
  context: ConfigureAgentContext,
): Promise<ConfigureAgentResult> {
  const platform = AGENT_PLATFORMS[platformId];
  return platform.configure(context, platform);
}

export function getAgentPlatform(id: AgentTool): RegisteredAgentPlatformConfig {
  return AGENT_PLATFORMS[id];
}

export function getInitAgentChoices(): RegisteredAgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
}

function defineAgentPlatforms<const TPlatforms extends Record<string, AgentPlatformDefinition<string>>>(platforms: {
  [TAgentTool in keyof TPlatforms]: AgentPlatformDefinition<TAgentTool & string>;
}): {
  [TAgentTool in keyof TPlatforms]: AgentPlatformDefinition<TAgentTool & string>;
} {
  return platforms;
}
