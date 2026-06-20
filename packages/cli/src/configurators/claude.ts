import type { ConfigureAgentContext, ConfigureAgentResult, AgentPlatformConfig } from '@withy/core';
import { copyAgentTemplates, installAgentSkills } from './shared.js';

export async function configureClaude(
  context: ConfigureAgentContext,
  platform: AgentPlatformConfig,
): Promise<ConfigureAgentResult> {
  const writtenPaths = copyAgentTemplates({
    projectRoot: context.projectRoot,
    templateId: platform.id,
    configDir: platform.configDir,
    templateContext: platform.templateContext,
    createdPaths: context.createdPaths,
  });

  writtenPaths.push(...installAgentSkills(context, platform.skillTarget));

  return {
    configured: true,
    writtenPaths,
  };
}
