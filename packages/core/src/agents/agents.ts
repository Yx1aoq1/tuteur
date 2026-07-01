import { homedir } from 'node:os';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getGlobalAgentDirs, getProjectAgentDirs, CANONICAL_AGENT_DIR, AGENT_PLATFORMS } from './registry.js';
import { scanAgentDirs, findAgentFile, readEngine } from '../store/agents.js';
import { writeTextFile, readTextFileIfExists } from '../utils/index.js';
import type { ScannedAgent } from '../store/agents.js';
import type { AgentTool } from './registry.js';
import type { Scope } from '../paths.js';

// 角色名安全校验:单段 kebab(字母数字 + 连字符),拒绝路径分隔符与 . / ..,防越界写。
const SAFE_ROLE = /^[a-z0-9][a-z0-9-]*$/i;

// 一个被发现的子 agent 角色,按角色名去重(同一角色可在 canonical + 各工具目录各有一份)。
export interface DiscoveredAgent {
  name: string; // 角色名(canonical .md 的 basename,如 `review`)
  description?: string;
  // 声明的 engine(原始字符串,未校验;缺省=inherit)—— cross-tool-dispatch design §Components。
  engine?: string;
  source: 'project' | 'global';
  /** 该角色被发现的文件路径(canonical + 已投递的工具目录副本)。 */
  paths: string[];
}

/**
 * Discover agent roles across project + home dirs, deduped by role name. The
 * scanned dirs come from the single agent registry (core §5.1) — canonical
 * `.agents/agents` plus each platform's `agentDef.target` — so the location set
 * is maintained in one place; the fs scan lives in `store/agents.ts`. Workflows
 * reference this role name verbatim in a node's `agent` field.
 *
 * @param scope 目标 scope(项目或全局)
 * @return 去重后的角色列表,按名称排序
 */
export function discoverAgents(scope: Scope): DiscoveredAgent[] {
  const byName = new Map<string, DiscoveredAgent>();

  const collect = (agents: ScannedAgent[], source: 'project' | 'global'): void => {
    for (const agent of agents) {
      const existing = byName.get(agent.name);
      if (existing) {
        existing.paths.push(agent.file);
        if (!existing.description && agent.description) existing.description = agent.description;
        if (!existing.engine && agent.engine) existing.engine = agent.engine;
      } else {
        byName.set(agent.name, {
          name: agent.name,
          description: agent.description,
          engine: agent.engine,
          source,
          paths: [agent.file],
        });
      }
    }
  };

  collect(scanAgentDirs(scope.root, getProjectAgentDirs()), 'project');
  collect(scanAgentDirs(homedir(), getGlobalAgentDirs()), 'global');

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ResolvedAgent {
  name: string;
  path: string;
}

/**
 * Resolve a node's `agent` role name to a concrete role definition file. Throws
 * when nothing resolves — the non-throwing {@link agentExists} backs validation,
 * where a dangling agent is a warning, not a block (design §1.1, §4.4).
 */
export function resolveAgentRef(scope: Scope, role: string): ResolvedAgent {
  const file = findAgentFile(scope.root, getProjectAgentDirs(), [role]);
  if (file) return { name: role, path: file };
  throw new Error(`agent "${role}" not found in agent definitions`);
}

/** Non-throwing form of {@link resolveAgentRef} for validation (design §1.1). */
export function agentExists(scope: Scope, role: string): boolean {
  try {
    resolveAgentRef(scope, role);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a role's declared `engine` (raw, unvalidated string) — undefined when the
 * role doesn't resolve, or resolves but declares no engine (inherit). Backs
 * `routeAgent`/`validateWorkflow`'s engine warning — cross-tool-dispatch design §Components.
 */
export function resolveAgentEngine(scope: Scope, role: string): string | undefined {
  const file = findAgentFile(scope.root, getProjectAgentDirs(), [role]);
  return file ? readEngine(file) : undefined;
}

/**
 * Whether `id` is a registered platform with its `configDir` present in the project
 * (i.e. `withy init` has set it up) — the same "configured" test `deployAgents` uses
 * (agents/deploy.ts). An unregistered id and a known-but-unconfigured one both
 * collapse to `false`; the engine warning message doesn't need to distinguish them.
 * Backs `validateWorkflow`'s engine warning ctx injection.
 */
export function enginePlatformAvailable(scope: Scope, id: string): boolean {
  if (!(id in AGENT_PLATFORMS)) return false;
  const platform = AGENT_PLATFORMS[id as AgentTool];
  return existsSync(resolve(scope.root, platform.configDir));
}

// ── Canonical role definition read/write (.agents/agents/<role>.md) — web CRUD ──

/** Absolute path of a role's canonical definition. Throws on an unsafe role name. */
export function canonicalAgentPath(scope: Scope, role: string): string {
  if (!SAFE_ROLE.test(role)) throw new Error(`unsafe agent role name: ${role}`);
  return resolve(scope.root, CANONICAL_AGENT_DIR, `${role}.md`);
}

/** Read a role's canonical definition (frontmatter + body), or null when absent. */
export function readAgentDefinition(scope: Scope, role: string): string | null {
  return readTextFileIfExists(canonicalAgentPath(scope, role));
}

/** Write a role's canonical definition. Callers then run {@link deployAgents} to deliver. */
export function writeAgentDefinition(scope: Scope, role: string, content: string): void {
  const file = canonicalAgentPath(scope, role);
  mkdirSync(dirname(file), { recursive: true });
  writeTextFile(file, content);
}

/** Delete a role's canonical definition (delivered copies are removed separately). */
export function removeAgentDefinition(scope: Scope, role: string): void {
  rmSync(canonicalAgentPath(scope, role), { force: true });
}
