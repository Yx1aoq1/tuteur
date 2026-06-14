export {
  CANONICAL_SKILL_DIR,
  getInitAgentChoices,
  getProjectSkillDirs,
  getGlobalSkillDirs,
  getAgentPlatform,
  AGENT_PLATFORMS,
} from './registry.js';

export type { RegisteredAgentPlatformConfig, AgentTool } from './registry.js';
export type {
  ConfigureAgentContext,
  ConfigureAgentResult,
  PlatformConfigurator,
  AgentPlatformConfig,
  SkillAdapterMode,
  TemplateContext,
} from './types.js';
