import { existsSync, rmSync } from 'node:fs';
import { type Scope, currentTaskPointerPath, projectsRegistryPath } from '../paths.js';
import { type ProjectsRegistry, type ProjectRef, ProjectsRegistrySchema } from '../types.js';
import { writeJsonFile, readTextFile, nowIso } from '../utils/index.js';
import { readValidated } from './errors.js';

// ── Global root: project registry (core.md §2.1) ─────────────────────────────

export function readProjects(scope: Scope): ProjectsRegistry {
  const file = projectsRegistryPath(scope);
  if (!existsSync(file)) return ProjectsRegistrySchema.parse({});
  return readValidated(file, ProjectsRegistrySchema, 'projects.json');
}

/**
 * Look up a registered project by its (URL-identity) name. Names are the unique
 * key the web dashboard routes on (`/<name>`), so the add flow checks this to
 * reject duplicates before registering. core.md §2.1, web.md §2.1.
 *
 * @param scope global scope holding the registry
 * @param name project name to match (exact)
 * @return the matching project, or null when the name is free
 */
export function findProjectByName(scope: Scope, name: string): ProjectRef | null {
  return readProjects(scope).projects.find(entry => entry.name === name) ?? null;
}

/** Register (or refresh) a project in the global registry, deduped by path. */
export function upsertProject(scope: Scope, project: { path: string; name: string }): ProjectsRegistry {
  const registry = readProjects(scope);
  const existing = registry.projects.find(entry => entry.path === project.path);
  if (existing) {
    existing.name = project.name;
  } else {
    registry.projects.push({ path: project.path, name: project.name, addedAt: nowIso() });
  }
  writeJsonFile(projectsRegistryPath(scope), registry);
  return registry;
}

/**
 * Drop a project from the global registry by path. The dashboard delete flow
 * calls this whether or not it also ran `withy uninstall` — uninstall removes
 * the project's `.withy/` but never touches this global registry (core.md §2.1).
 *
 * @param scope global scope holding the registry
 * @param path absolute project path to unregister
 * @return the registry after removal (unchanged when the path was absent)
 */
export function removeProject(scope: Scope, path: string): ProjectsRegistry {
  const registry = readProjects(scope);
  const next = registry.projects.filter(entry => entry.path !== path);
  if (next.length !== registry.projects.length) {
    registry.projects = next;
    writeJsonFile(projectsRegistryPath(scope), registry);
  }
  return registry;
}

// ── Current-task pointer (runtime/current-task.json — transient, gitignored) ──

export function readCurrentTaskPointer(scope: Scope): string | null {
  const file = currentTaskPointerPath(scope);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readTextFile(file)) as { taskId?: unknown };
    return typeof raw.taskId === 'string' ? raw.taskId : null;
  } catch {
    return null;
  }
}

export function writeCurrentTaskPointer(scope: Scope, taskId: string): void {
  writeJsonFile(currentTaskPointerPath(scope), { taskId, updatedAt: nowIso() });
}

export function clearCurrentTaskPointer(scope: Scope): void {
  const file = currentTaskPointerPath(scope);
  if (existsSync(file)) rmSync(file);
}
