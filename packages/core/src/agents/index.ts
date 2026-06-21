export {
  sessionIdFromHookPayload,
  CANONICAL_SKILL_DIR,
  getInitAgentChoices,
  getProjectSkillDirs,
  getGlobalSkillDirs,
  resolveSessionId,
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

export { logicalSkillName, resolveSkillRef, discoverSkills, skillExists } from './skills.js';
export type { DiscoveredSkill, ResolvedSkill } from './skills.js';

export { serializeToCommand, toSkillAdapterMode, INIT_QUESTIONS } from './init-config.js';
export type { SkillInstallMode, InitQuestion, InitChoice, InitConfig } from './init-config.js';
