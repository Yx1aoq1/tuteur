import { getInitAgentChoices, getAgentPlatform } from './agents/index.js';
import { CLI_COMMAND_NAME } from './constants.js';
import type { SkillAdapterMode, AgentTool } from './agents/index.js';

// Skill landing mode in the public init surface (CLI flag / web form). Maps to
// the internal `SkillAdapterMode` at the cli boundary via `toSkillAdapterMode`.
export type SkillInstallMode = 'link' | 'copy';

// The single structured init model. CLI flags, CLI interactive answers, and the
// web form all produce one of these, then a single executor runs it (core §8).
export interface InitConfig {
  // Which root to initialize: a project repo, or the global ~/.withy root.
  scope: 'project' | 'global';

  // Selected agent tools to configure; always empty in global scope (core §2.3).
  agents: AgentTool[];

  // How bundled skills land in agent dirs; ignored in global scope.
  skills: SkillInstallMode;

  // Local developer identity name; ignored in global scope.
  user?: string;
}

// One declarative init question, shared by CLI interactive prompts and the web
// form so both stay in sync. Dynamic defaults (e.g. git user name) are filled by
// the caller — this layer carries no environment lookups.
export interface InitChoice<TValue extends string = string> {
  value: TValue;
  label: string;
  description?: string;
  // Pre-checked in a multiselect (agent defaults).
  checked?: boolean;
}

export type InitQuestion =
  | { key: 'agents'; type: 'multiselect'; message: string; choices: InitChoice<AgentTool>[] }
  | {
      key: 'skills';
      type: 'select';
      message: string;
      default: SkillInstallMode;
      choices: InitChoice<SkillInstallMode>[];
    }
  | { key: 'user'; type: 'text'; message: string };

/** Map the public skill mode to the internal adapter mode used by configurators. */
export function toSkillAdapterMode(skills: SkillInstallMode): SkillAdapterMode {
  return skills === 'copy' ? 'copy' : 'symlink';
}

/**
 * Render an `InitConfig` back to its equivalent `withy init ...` command line.
 * The web "initialize" button spawns exactly this (web §2.4); CLI prints it as
 * the copyable equivalent of an interactive run.
 *
 * @param config the structured init selection
 */
export function serializeToCommand(config: InitConfig): string {
  const parts = [CLI_COMMAND_NAME, 'init'];

  if (config.scope === 'global') {
    parts.push('--global');
    return parts.join(' ');
  }

  for (const agent of config.agents) {
    parts.push(`--${getAgentPlatform(agent).cliFlag}`);
  }
  if (config.skills === 'copy') parts.push('--copy');
  if (config.user) parts.push('-u', quoteArg(config.user));

  return parts.join(' ');
}

// Declarative init questions (agent choices derive from the agent registry, the
// single source). Consumed by CLI prompts and the web form alike.
export const INIT_QUESTIONS: InitQuestion[] = [
  {
    key: 'agents',
    type: 'multiselect',
    message: 'Select agent tools to configure',
    choices: getInitAgentChoices().map(platform => ({
      value: platform.id,
      label: `${platform.name} (${platform.id})`,
      checked: platform.defaultChecked,
    })),
  },
  {
    key: 'skills',
    type: 'select',
    message: 'How should agent-specific skill directories be created?',
    default: 'link',
    choices: [
      {
        value: 'link',
        label: 'Symlink to .agents/skills',
        description: 'One canonical skill copy; agent directories point to it.',
      },
      {
        value: 'copy',
        label: 'Copy into each agent directory',
        description: 'Creates independent files under agent-specific skill directories.',
      },
    ],
  },
  { key: 'user', type: 'text', message: 'User name for local task ownership' },
];

// Wrap a flag value in double quotes when it carries whitespace/quotes, so the
// serialized command round-trips through a shell.
function quoteArg(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
