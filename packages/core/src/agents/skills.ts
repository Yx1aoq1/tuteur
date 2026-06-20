import { homedir } from 'node:os';
import { getGlobalSkillDirs, getProjectSkillDirs } from './registry.js';
import { PRODUCT_SLUG } from '../constants.js';
import { scanSkillDirs, findSkillDir } from '../store/skills.js';
import type { ScannedSkill } from '../store/skills.js';
import type { Scope } from '../paths.js';

export interface DiscoveredSkill {
  name: string; // real installed skill directory name (e.g. `withy-dev`)
  description?: string;
  source: 'project' | 'global';
  /** Directories this skill was found in (one skill may be installed in several tools). */
  paths: string[];
}

/** Strip the bundled `withy-` prefix to get the logical (workflow-referenced) name. */
export function logicalSkillName(dirName: string): string {
  const prefix = `${PRODUCT_SLUG}-`;
  return dirName.startsWith(prefix) ? dirName.slice(prefix.length) : dirName;
}

/**
 * Discover skills across project + agent home dirs, deduped by their real
 * installed directory name. Skill directories come from the single agent
 * registry (core §5.1), so the set of scanned locations is maintained in
 * exactly one place; the fs scan itself lives in `store/skills.ts`. Workflows
 * reference and store this real name verbatim.
 */
export function discoverSkills(scope: Scope): DiscoveredSkill[] {
  const byName = new Map<string, DiscoveredSkill>();

  const collect = (skills: ScannedSkill[], source: 'project' | 'global'): void => {
    for (const skill of skills) {
      const existing = byName.get(skill.name);
      if (existing) {
        existing.paths.push(skill.dir);
      } else {
        byName.set(skill.name, { name: skill.name, description: skill.description, source, paths: [skill.dir] });
      }
    }
  };

  collect(scanSkillDirs(scope.root, getProjectSkillDirs()), 'project');
  collect(scanSkillDirs(homedir(), getGlobalSkillDirs()), 'global');

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ResolvedSkill {
  name: string;
  path: string;
}

/**
 * Resolve a workflow `skill` name to a concrete SKILL.md directory in the project.
 * Checks the logical name and the bundled `withy-<name>` form across skill dirs.
 * Throws when nothing resolves (surfaced at validate / run time — harness §5).
 */
export function resolveSkillRef(scope: Scope, skill: string): ResolvedSkill {
  const dir = findSkillDir(scope.root, getProjectSkillDirs(), [skill, `${PRODUCT_SLUG}-${skill}`]);
  if (dir) return { name: skill, path: dir };
  throw new Error(`skill "${skill}" not found in project skill directories`);
}

/** Non-throwing form of {@link resolveSkillRef} for validation (harness §5). */
export function skillExists(scope: Scope, skill: string): boolean {
  try {
    resolveSkillRef(scope, skill);
    return true;
  } catch {
    return false;
  }
}
