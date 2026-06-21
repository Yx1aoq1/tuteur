export type SkillAdapterMode = 'symlink' | 'copy';

export interface TemplateContext<TAgentTool extends string = string> {
  cmdRefPrefix: string;
  userActionLabel: 'Skills' | 'Slash commands';
  cliFlag: TAgentTool;
}

export interface AgentPlatformConfig<TAgentTool extends string = string> {
  id: TAgentTool;
  name: string;
  configDir: string;
  cliFlag: TAgentTool;
  defaultChecked: boolean;
  skillTarget: string | null;
  skillDirs: { project: string[]; global: string[] };
  supportsAgentSkills?: boolean;
  templateContext: TemplateContext<TAgentTool>;
  // Env var carrying this platform's session id on the CLI/bash side (e.g. Claude's
  // CLAUDE_CODE_SESSION_ID), read by resolveSessionId for injection backfill.
  sessionIdEnv?: string;
  // Field name carrying the session id in this platform's hook stdin JSON (e.g.
  // Claude's `session_id`), read by sessionIdFromHookPayload.
  hookSessionIdField?: string;
}

export interface ConfigureAgentContext {
  projectRoot: string;
  createdPaths: string[];
  skillAdapterMode: SkillAdapterMode;
}

export interface ConfigureAgentResult {
  configured: boolean;
  writtenPaths: string[];
}

export type PlatformConfigurator<TAgentTool extends string = string> = (
  context: ConfigureAgentContext,
  platform: AgentPlatformConfig<TAgentTool>,
) => Promise<ConfigureAgentResult>;
