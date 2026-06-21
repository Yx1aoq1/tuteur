import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { GLOBAL_DIR_NAME, PROJECT_DIR_NAME } from './constants.js';
import { isDirectory } from './utils/fs.js';

export interface Scope {
  kind: 'global' | 'project';
  /** Repo root (project) or home (global) — the dir that *contains* the .withy dir. */
  root: string;
  /** Absolute path to the .withy directory. */
  withyDir: string;
}

/** Global scope: ~/.withy (config + project registry + templates; no tasks). */
export function resolveGlobalScope(): Scope {
  const root = homedir();
  return { kind: 'global', root, withyDir: resolve(root, GLOBAL_DIR_NAME) };
}

/**
 * Project scope: walk up from `from` (or WITHY_PROJECT_ROOT / INIT_CWD / cwd)
 * looking for a directory that contains a `.withy/` dir. Returns null if none.
 */
export function resolveProjectScope(from?: string): Scope | null {
  const start = from ?? process.env.WITHY_PROJECT_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  let current = resolve(start);

  // Never treat the home directory's own ~/.withy as a project scope.
  const home = homedir();

  while (true) {
    const candidate = resolve(current, PROJECT_DIR_NAME);
    if (current !== home && isDirectory(candidate)) {
      return { kind: 'project', root: current, withyDir: candidate };
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/** True if `path` looks like an initialized Withy project (has a .withy dir). */
export function detectWithy(path: string): boolean {
  return isDirectory(resolve(path, PROJECT_DIR_NAME));
}

export function tasksDir(scope: Scope): string {
  return resolve(scope.withyDir, 'tasks');
}

export function taskDir(scope: Scope, id: string): string {
  return resolve(tasksDir(scope), id);
}

export function archiveDir(scope: Scope): string {
  return resolve(tasksDir(scope), 'archive');
}

export function taskPath(scope: Scope, id: string, rel: string): string {
  return resolve(taskDir(scope, id), rel);
}

export function workflowsDir(scope: Scope): string {
  return resolve(scope.withyDir, 'workflows');
}

export function workflowPath(scope: Scope, id: string): string {
  return resolve(workflowsDir(scope), `${id}.workflow.json`);
}

// `.withy/runtime/` — the on-disk *transient* state dir (gitignored, core.md §2.2):
// the project-level current-task pointer (cleared by clearCurrentTaskPointer when a
// workflow finishes) and the global-level dashboard daemon state. "runtime" names
// three unrelated things in this repo — see the design wiki (design/core.md, the
// "三处 runtime 命名" 节) for the full distinction. The other two ("runtime" code
// shells) are `workflow/runtime.ts` (state-machine IO shell) and the CLI's
// `harness/runtime.ts` (output layer); neither is related to this directory.
export function runtimeDir(scope: Scope): string {
  return resolve(scope.withyDir, 'runtime');
}

export function guidePath(scope: Scope): string {
  return resolve(scope.withyDir, 'guide.md');
}

export function knowledgeDir(scope: Scope): string {
  return resolve(scope.withyDir, 'knowledge');
}

export function knowledgeWikiPath(scope: Scope, id: string): string {
  return resolve(knowledgeDir(scope), 'wiki', `${id}.md`);
}

// Derived relation-graph cache (`.withy/knowledge/graph.json`, gitignored): the
// persisted nodes/edges + content fingerprint that `readGraphCached` validates and
// rebuilds. Deletable at any time — the next query/`index` regenerates it.
export function knowledgeGraphCachePath(scope: Scope): string {
  return resolve(knowledgeDir(scope), 'graph.json');
}

// Project-level transient pointer under `.withy/runtime/` (see runtimeDir): the
// "current task" cursor that `withy task start`/hook resolve and that
// clearCurrentTaskPointer drops when the workflow finishes.
export function currentTaskPointerPath(scope: Scope): string {
  return resolve(runtimeDir(scope), 'current-task.json');
}

// Per-session pending-injection files under `.withy/runtime/sessions/<sid>.json`
// (transient, gitignored): a SessionStart injection parked when no task is active,
// later claimed by `withy task start` to backfill the creating session's session_start.
export function sessionsDir(scope: Scope): string {
  return resolve(runtimeDir(scope), 'sessions');
}

export function pendingInjectionPath(scope: Scope, sessionId: string): string {
  return resolve(sessionsDir(scope), `${sessionId}.json`);
}

// ── Global root files (config + project registry — core.md §2.1) ─────────────

export function globalConfigPath(scope: Scope): string {
  return resolve(scope.withyDir, 'config.yaml');
}

export function projectsRegistryPath(scope: Scope): string {
  return resolve(scope.withyDir, 'projects.json');
}
