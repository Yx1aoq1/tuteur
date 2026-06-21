import { readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { type Scope, knowledgeGraphCachePath, knowledgeWikiPath, knowledgeDir } from '../paths.js';
import {
  readTextFileIfExists,
  writeJsonFile,
  writeTextFile,
  readTextFile,
  isDirectory,
  ensureDir,
  moveDir,
} from '../utils/index.js';

// ── Knowledge entries by id (raw markdown; frontmatter parsed in knowledge/) ──

export function readKnowledgeSource(scope: Scope, id: string): string | null {
  return readTextFileIfExists(knowledgeWikiPath(scope, id));
}

// One wiki page file on disk (raw; frontmatter parsed in knowledge/).
export interface KnowledgeFile {
  // File basename without the .md extension (the default entry id).
  id: string;

  // Path relative to knowledge/wiki/, posix separators (e.g. "api.md", "backend/api.md").
  wikiRelPath: string;

  // Raw file contents.
  raw: string;
}

/**
 * List every wiki page under `knowledge/wiki/` (recursive), skipping the generated
 * `index.md` navigation files. Returns raw contents for the knowledge module to parse.
 *
 * @param scope target scope (project or global)
 * @return one entry per page; empty when there is no wiki dir
 */
export function listKnowledgeFiles(scope: Scope): KnowledgeFile[] {
  const wikiRoot = resolve(knowledgeDir(scope), 'wiki');
  if (!existsSync(wikiRoot)) return [];

  const files: KnowledgeFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        files.push({
          id: entry.name.slice(0, -'.md'.length),
          wikiRelPath: relative(wikiRoot, full).split(/[\\/]/).join('/'),
          raw: readTextFile(full),
        });
      }
    }
  };

  walk(wikiRoot);
  return files;
}

/** Write text to a path relative to `knowledge/` (creates parents). Backs `withy knowledge index`. */
export function writeKnowledgeFile(scope: Scope, relPath: string, content: string): void {
  writeTextFile(resolve(knowledgeDir(scope), relPath), content);
}

// ── Derived graph cache + content fingerprint (knowledge/cache.ts is the consumer) ──

// Content fingerprint of the wiki page set: the max page mtime + page count. Backs the
// cache invalidation check (rebuild when a page is newer / pages added or removed).
export interface WikiFingerprint {
  // Largest mtimeMs across non-index wiki pages (0 when there are none).
  maxMtimeMs: number;

  // Number of non-index wiki pages.
  pageCount: number;
}

/**
 * Stat every non-index wiki page and fold it into a content fingerprint. Mirrors
 * {@link listKnowledgeFiles}'s walk but reads only metadata, not contents.
 *
 * @param scope target scope
 * @return max page mtime + page count; `{ maxMtimeMs: 0, pageCount: 0 }` when no wiki dir
 */
export function statWikiPages(scope: Scope): WikiFingerprint {
  const wikiRoot = resolve(knowledgeDir(scope), 'wiki');
  if (!existsSync(wikiRoot)) return { maxMtimeMs: 0, pageCount: 0 };

  let maxMtimeMs = 0;
  let pageCount = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        maxMtimeMs = Math.max(maxMtimeMs, statSync(full).mtimeMs);
        pageCount++;
      }
    }
  };

  walk(wikiRoot);
  return { maxMtimeMs, pageCount };
}

/** Read and JSON-parse the graph cache, or null when missing/corrupt (caller rebuilds). */
export function readGraphCacheFile(scope: Scope): unknown {
  const raw = readTextFileIfExists(knowledgeGraphCachePath(scope));
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupt cache = treat as missing, rebuild (design: 不抛)
  }
}

/** Atomically write the derived graph cache to `knowledge/graph.json`. */
export function writeGraphCacheFile(scope: Scope, value: unknown): void {
  writeJsonFile(knowledgeGraphCachePath(scope), value);
}

// ── Wiki entries by path (relative to knowledge/wiki/; callers guard with assertInsideWiki) ──
// These are the by-path carry-disk primitives backing the knowledge module's CRUD. Unlike the
// by-id readers above, they address files/dirs directly under wiki/ and never interpret frontmatter.

// One node in the wiki/ directory tree (file or empty/non-empty dir).
export interface WikiEntry {
  // Path relative to knowledge/wiki/, posix separators (e.g. "api.md", "backend", "backend/api.md").
  relPath: string;

  // Whether the entry is a directory or a markdown file.
  type: 'file' | 'dir';
}

function wikiEntryPath(scope: Scope, relPath: string): string {
  return resolve(knowledgeDir(scope), 'wiki', relPath);
}

/** Read a wiki file by its wiki-relative path, or null when absent. */
export function readWikiFile(scope: Scope, relPath: string): string | null {
  return readTextFileIfExists(wikiEntryPath(scope, relPath));
}

/** Write a wiki file by its wiki-relative path (creates parent dirs). */
export function writeWikiFile(scope: Scope, relPath: string, content: string): void {
  const full = wikiEntryPath(scope, relPath);
  ensureDir(dirname(full), []);
  writeTextFile(full, content);
}

/** Classify a wiki-relative path as a dir, a file, or absent. */
export function wikiEntryType(scope: Scope, relPath: string): 'file' | 'dir' | null {
  const full = wikiEntryPath(scope, relPath);
  if (!existsSync(full)) return null;
  return isDirectory(full) ? 'dir' : 'file';
}

/** Create an (empty) wiki directory by its wiki-relative path. */
export function makeWikiDir(scope: Scope, relPath: string): void {
  ensureDir(wikiEntryPath(scope, relPath), []);
}

/** Move/rename a wiki entry (file or dir) within wiki/; creates the target's parent. */
export function moveWikiEntry(scope: Scope, fromRelPath: string, toRelPath: string): void {
  moveDir(wikiEntryPath(scope, fromRelPath), wikiEntryPath(scope, toRelPath));
}

/** Remove a wiki entry (file, or directory recursively). No-op when already absent. */
export function removeWikiEntry(scope: Scope, relPath: string): void {
  rmSync(wikiEntryPath(scope, relPath), { recursive: true, force: true });
}

/**
 * Walk `knowledge/wiki/` and list every directory (including empty ones) and `.md`
 * file as wiki-relative entries. Unlike {@link listKnowledgeFiles} this keeps empty
 * dirs and the generated `index.md` files so the tree view and orphan-index cleanup
 * can see the real on-disk shape.
 *
 * @param scope target scope
 * @return flat entry list (dirs + md files); empty when there is no wiki dir
 */
export function listWikiEntries(scope: Scope): WikiEntry[] {
  const wikiRoot = resolve(knowledgeDir(scope), 'wiki');
  if (!existsSync(wikiRoot)) return [];

  const entries: WikiEntry[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      const rel = relative(wikiRoot, full).split(/[\\/]/).join('/');
      if (entry.isDirectory()) {
        entries.push({ relPath: rel, type: 'dir' });
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        entries.push({ relPath: rel, type: 'file' });
      }
    }
  };

  walk(wikiRoot);
  return entries;
}
