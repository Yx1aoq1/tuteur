export {
  sessionIdFromHookPayload,
  resolveCurrentPlatform,
  getProjectAgentDirs,
  getGlobalAgentDirs,
  CANONICAL_SKILL_DIR,
  CANONICAL_AGENT_DIR,
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
  AgentFormat,
  AgentDef,
} from './types.js';

export { logicalSkillName, resolveSkillRef, discoverSkills, skillExists } from './skills.js';
export type { DiscoveredSkill, ResolvedSkill } from './skills.js';

export {
  enginePlatformAvailable,
  removeAgentDefinition,
  writeAgentDefinition,
  readAgentDefinition,
  canonicalAgentPath,
  resolveAgentEngine,
  resolveAgentRef,
  discoverAgents,
  agentExists,
} from './agents.js';
export type { DiscoveredAgent, ResolvedAgent } from './agents.js';

export { getAgentDeliveryStatus, removeAgentDelivery, deployAgents } from './deploy.js';
export type { AgentDeliveryStatus, AgentDeliveryState } from './deploy.js';

export { serializeToCommand, toSkillAdapterMode, INIT_QUESTIONS } from './init-config.js';
export type { SkillInstallMode, InitQuestion, InitChoice, InitConfig } from './init-config.js';
