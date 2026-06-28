export { configureAgentPlatform, getInitAgentChoices, getAgentPlatform, AGENT_PLATFORMS } from './registry.js';
export { installCanonicalWorkflowAgents, installCanonicalWorkflowSkills } from './shared.js';

export type { ConfigureAgentContext, ConfigureAgentResult, SkillAdapterMode, TemplateContext } from '@withy/core';
export type { RegisteredAgentPlatformConfig as AgentPlatformConfig, AgentTool } from './registry.js';
