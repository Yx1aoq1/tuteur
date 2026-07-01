import { getSlashCommandPrefix } from '../constants.js';
import type { AgentPlatformConfig } from './types.js';

/**
 * Single source of truth for agent-platform metadata (pure data, no behavior).
 * Both the CLI configurators and core skill discovery read from this — so
 * directories/flags/skillDirs are maintained in exactly one place.
 */
export const AGENT_PLATFORMS = defineAgentPlatforms({
  codex: {
    id: 'codex',
    name: 'Codex',
    configDir: '.codex',
    cliFlag: 'codex',
    defaultChecked: true,
    skillTarget: null,
    supportsAgentSkills: true,
    skillDirs: {
      project: ['.agents/skills'],
      global: ['.agents/skills'],
    },
    agentDef: { target: '.codex/agents', format: 'toml' },
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
    agentDef: { target: '.claude/agents', format: 'markdown' },
    sessionIdEnv: 'CLAUDE_CODE_SESSION_ID',
    hookSessionIdField: 'session_id',
    templateContext: {
      cmdRefPrefix: getSlashCommandPrefix(),
      userActionLabel: 'Slash commands',
      cliFlag: 'claude',
    },
  },
  opencode: {
    id: 'opencode',
    name: 'opencode',
    configDir: '.opencode',
    cliFlag: 'opencode',
    // Config/format conventions unverified against a real install — cross-tool-dispatch design §Risk 2.
    defaultChecked: false,
    skillTarget: '.opencode/skills',
    skillDirs: { project: ['.opencode/skills'], global: ['.opencode/skills'] },
    agentDef: { target: '.opencode/agents', format: 'markdown' },
    supportsAgentSkills: true,
    templateContext: {
      cmdRefPrefix: '/',
      userActionLabel: 'Slash commands',
      cliFlag: 'opencode',
    },
    // sessionIdEnv omitted: opencode ships no ambient session-id env var today
    // (OPENCODE_SESSION_ID is an unreleased proposal, anomalyco/opencode#12158) —
    // cross-tool-dispatch design §Risk 1. resolveCurrentPlatform safely returns null.
  },
});

export type AgentTool = keyof typeof AGENT_PLATFORMS;
export type RegisteredAgentPlatformConfig = (typeof AGENT_PLATFORMS)[AgentTool];

export function getAgentPlatform(id: AgentTool): RegisteredAgentPlatformConfig {
  return AGENT_PLATFORMS[id];
}

// Entries as the common `AgentPlatformConfig` shape (optional fields uniformly
// `| undefined`), for call sites that scan all platforms generically rather than
// needing each entry's own precise per-key literal type (that's `getInitAgentChoices`,
// which keeps `RegisteredAgentPlatformConfig[]` on purpose).
function platformList(): AgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
}

/**
 * Resolve the current agent session id from whichever platform env var is set
 * (e.g. Claude's CLAUDE_CODE_SESSION_ID). Returns null when none is present —
 * callers degrade (skip injection backfill) rather than fail.
 * @param env Environment to read (defaults to process.env; injectable for tests).
 */
export function resolveSessionId(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const platform of platformList()) {
    const key = platform.sessionIdEnv;
    const value = key ? env[key] : undefined;
    if (value) return value;
  }
  return null;
}

/**
 * Resolve which agent platform the current orchestrating session is running under,
 * from whichever platform env var is set (e.g. Claude's CLAUDE_CODE_SESSION_ID).
 * Returns null when none is present — routeAgent treats that as "unknown", not an
 * error (cross-tool-dispatch design §Risk 1: codex/opencode ship no such signal yet).
 * @param env Environment to read (defaults to process.env; injectable for tests).
 */
export function resolveCurrentPlatform(env: NodeJS.ProcessEnv = process.env): AgentTool | null {
  for (const platform of platformList()) {
    const key = platform.sessionIdEnv;
    if (key && env[key]) return platform.id as AgentTool;
  }
  return null;
}

/**
 * Extract the session id from a hook's stdin JSON payload, trying each platform's
 * declared field (e.g. Claude's `session_id`). Returns null when absent.
 * @param payload Parsed hook stdin JSON object.
 */
export function sessionIdFromHookPayload(payload: Record<string, unknown>): string | null {
  for (const platform of platformList()) {
    const field = platform.hookSessionIdField;
    const value = field ? payload[field] : undefined;
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

export function getInitAgentChoices(): RegisteredAgentPlatformConfig[] {
  return Object.values(AGENT_PLATFORMS);
}

/** Canonical (cross-agent) skill directory, relative to the project root. */
export const CANONICAL_SKILL_DIR = '.agents/skills';

/** Canonical (cross-agent) agent-definition directory, relative to the project root. */
export const CANONICAL_AGENT_DIR = '.agents/agents';

/** Project-relative skill dirs to scan, deduped across all platforms + canonical. */
export function getProjectSkillDirs(): string[] {
  return unique([CANONICAL_SKILL_DIR, ...platformList().flatMap(p => p.skillDirs.project)]);
}

/** Home-relative skill dirs to scan, deduped across all platforms. */
export function getGlobalSkillDirs(): string[] {
  return unique(platformList().flatMap(p => p.skillDirs.global));
}

// Every platform's declared agent target dir (delivery destinations) — the seed
// for discovery's markdown scan. Codex's toml target yields no `.md`, so scanning
// it is harmless; canonical + the Claude symlink dedupe by role name.
function agentTargets(): string[] {
  return platformList().flatMap(p => (p.agentDef ? [p.agentDef.target] : []));
}

/** Project-relative agent dirs to scan for canonical `*.md`, deduped — core §5.1. */
export function getProjectAgentDirs(): string[] {
  return unique([CANONICAL_AGENT_DIR, ...agentTargets()]);
}

/** Home-relative agent dirs to scan, deduped across canonical + platform targets. */
export function getGlobalAgentDirs(): string[] {
  return unique([CANONICAL_AGENT_DIR, ...agentTargets()]);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// Infers `AGENT_PLATFORMS`'s type as the literal object passed in (via the `const`
// type parameter), rather than widening to `Record<string, AgentPlatformConfig<string>>`
// — that's what keeps `AgentTool = keyof typeof AGENT_PLATFORMS` a narrow union
// (`'codex' | 'claude' | 'opencode'`), which downstream exhaustive `Record<AgentTool, X>`
// maps (e.g. cli's `PLATFORM_CONFIGURATORS`) depend on to flag a missing platform.
//
// Deliberately NOT a mapped-type parameter/return (`{ [K in keyof TPlatforms]: ... }`):
// that form type-checks fine inside this file, but a generic mapped-type return
// position doesn't survive declaration-emission for cross-package consumers — the
// emitted `.d.ts` collapses it to a generic `{ [x: string]: AgentPlatformConfig<string> }`
// index signature, silently turning `AgentTool` into plain `string` everywhere outside
// `@withy/core` and breaking exactly the exhaustiveness check this exists for (verified
// by reproduction — confirmed against the previous version of this function, which used
// that mapped-type form). That form also doesn't actually enforce each entry's `id`/
// `cliFlag` matching its key (verified: it silently accepted a mismatch) — so this
// simpler shape gives up nothing that was really being checked.
function defineAgentPlatforms<const TPlatforms extends Record<string, AgentPlatformConfig<string>>>(
  platforms: TPlatforms,
): TPlatforms {
  return platforms;
}
