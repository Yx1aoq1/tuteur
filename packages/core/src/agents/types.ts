export type SkillAdapterMode = 'symlink' | 'copy';

// 子 agent 定义的投递格式:markdown 可文件级软链共用 canonical;toml 软链不了,从 canonical 转换生成 — design §4。
export type AgentFormat = 'markdown' | 'toml';

// 某平台的子 agent 投递描述符:投到哪个目录、用哪种格式。格式驱动,新工具加一条即可 — design §4.2。
export interface AgentDef {
  target: string;
  format: AgentFormat;
}

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
  // 子 agent 定义投递描述符(可选);声明则该平台参与 agent 投递 — design §4.2。
  agentDef?: AgentDef;
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
