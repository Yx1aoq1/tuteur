import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readTextFile, isDirectory } from '../utils/index.js';

// One skill directory found on disk (a subdir containing SKILL.md); `description`
// is parsed from its frontmatter. Dedup/grouping/matching is the caller's job
// (agents/skills.ts) — this layer only does the fs scan + description scrape.
export interface ScannedSkill {
  // Installed skill directory name (e.g. `withy-dev`).
  name: string;

  // Absolute path to the skill directory.
  dir: string;

  // `description:` from SKILL.md frontmatter, when present.
  description?: string;
}

/**
 * Scan each `rel` skill directory under `baseDir` and return every immediate
 * subdirectory that contains a `SKILL.md`, with its parsed description. The fs
 * half of skill discovery (core §5.1); the registry-driven directory list and
 * dedup live in agents/skills.ts.
 *
 * @param baseDir root the `rels` are resolved against (project root or home)
 * @param rels relative skill directories to scan (from the agent registry)
 * @return one entry per discovered skill dir, in scan order
 */
export function scanSkillDirs(baseDir: string, rels: string[]): ScannedSkill[] {
  const found: ScannedSkill[] = [];
  for (const rel of rels) {
    const root = resolve(baseDir, rel);
    if (!isDirectory(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = resolve(root, entry.name);
      if (!existsSync(resolve(dir, 'SKILL.md'))) continue;
      found.push({ name: entry.name, dir, description: readDescription(resolve(dir, 'SKILL.md')) });
    }
  }
  return found;
}

/**
 * Return the absolute directory of the first `candidate` name (under any `rel`)
 * whose `SKILL.md` exists, or null when none resolve. Backs `resolveSkillRef`.
 *
 * @param baseDir root the `rels` are resolved against
 * @param rels relative skill directories to search (from the agent registry)
 * @param candidates skill directory names to try, in priority order
 */
export function findSkillDir(baseDir: string, rels: string[], candidates: string[]): string | null {
  for (const rel of rels) {
    for (const candidate of candidates) {
      const dir = resolve(baseDir, rel, candidate);
      if (existsSync(resolve(dir, 'SKILL.md'))) return dir;
    }
  }
  return null;
}

// Parse the `description:` line out of a SKILL.md frontmatter (simple scan).
function readDescription(skillFile: string): string | undefined {
  try {
    const text = readTextFile(skillFile);
    const match = text.match(/^description:\s*(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}
