import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readTextFile, isDirectory } from '../utils/index.js';

// One agent definition file found on disk (a `<role>.md` directly inside a scanned
// dir); `description` is parsed from its frontmatter. Dedup/grouping is the caller's
// job (agents/agents.ts) — this layer only does the fs scan + description scrape.
// Unlike skills (a dir with SKILL.md), a role is a single Markdown file — design §4.1.
export interface ScannedAgent {
  // Role name (the `.md` basename, e.g. `review`).
  name: string;

  // Absolute path to the role definition file.
  file: string;

  // `description:` from the frontmatter, when present.
  description?: string;
}

/**
 * Scan each `rel` agent directory under `baseDir` and return every immediate
 * `<role>.md` file with its parsed description. The fs half of agent discovery
 * (core §5.1); the registry-driven directory list and dedup live in agents/agents.ts.
 *
 * @param baseDir root the `rels` are resolved against (project root or home)
 * @param rels relative agent directories to scan (from the agent registry)
 * @return one entry per discovered role file, in scan order
 */
export function scanAgentDirs(baseDir: string, rels: string[]): ScannedAgent[] {
  const found: ScannedAgent[] = [];
  for (const rel of rels) {
    const root = resolve(baseDir, rel);
    if (!isDirectory(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      // Accept regular files and symlinks (Claude delivery is a file-level symlink
      // to the canonical, so `isFile()` alone would skip it); existsSync follows the
      // link to confirm a live target — design §4.2.
      if (!entry.name.endsWith('.md')) continue;
      const file = resolve(root, entry.name);
      if (!existsSync(file)) continue;
      found.push({ name: entry.name.slice(0, -'.md'.length), file, description: readDescription(file) });
    }
  }
  return found;
}

/**
 * Return the absolute path of the first `candidate` role name (under any `rel`)
 * whose `<candidate>.md` exists, or null when none resolve. Backs `resolveAgentRef`.
 *
 * @param baseDir root the `rels` are resolved against
 * @param rels relative agent directories to search (from the agent registry)
 * @param candidates role names to try, in priority order
 */
export function findAgentFile(baseDir: string, rels: string[], candidates: string[]): string | null {
  for (const rel of rels) {
    for (const candidate of candidates) {
      const file = resolve(baseDir, rel, `${candidate}.md`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

// Parse the `description:` line out of a role definition's frontmatter (simple scan).
function readDescription(file: string): string | undefined {
  try {
    const match = readTextFile(file).match(/^description:\s*(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}
