import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writeWikiFile } from '../../src/store/index.js';
import {
  deriveKnowledgeGraph,
  docsCoveringPath,
  coverageForDoc,
  KnowledgeError,
  relatedDocs,
} from '../../src/knowledge/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-query-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function pageRaw(id: string, body: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${id}`, ...extra, '---', '', body, ''].join('\n');
}

describe('relatedDocs', () => {
  it('returns deduped bidirectional link neighbors, excluding self', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'see [[b]] and [[b|别名]] and [[c]]'));
    writeWikiFile(scope, 'b.md', pageRaw('b', 'back to [[a]]'));
    writeWikiFile(scope, 'c.md', pageRaw('c', 'leaf'));

    const graph = deriveKnowledgeGraph(scope);
    expect(relatedDocs(graph, 'a').sort()).toEqual(['b', 'c']);
    expect(relatedDocs(graph, 'b')).toEqual(['a']); // 入链也算
    expect(relatedDocs(graph, 'c')).toEqual(['a']);
  });

  it('drops broken links (missing targets) and never returns code/source nodes', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'see [[gone]]', ['covers: [packages/core/src/**]', 'sources: [sources/x.md]']));

    const graph = deriveKnowledgeGraph(scope);
    expect(relatedDocs(graph, 'a')).toEqual([]);
  });

  it('throws on an unknown id', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'solo'));

    const graph = deriveKnowledgeGraph(scope);
    expect(() => relatedDocs(graph, 'nope')).toThrow(KnowledgeError);
  });
});

describe('coverageForDoc', () => {
  it('returns the declared covers globs verbatim (no expansion)', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', '# core', ['covers: [packages/core/src/**]']));

    expect(coverageForDoc(scope, 'core')).toEqual(['packages/core/src/**']);
  });

  it('returns an empty array for a page without covers', () => {
    const scope = createScope();
    writeWikiFile(scope, 'web.md', pageRaw('web', '# web'));

    expect(coverageForDoc(scope, 'web')).toEqual([]);
  });

  it('throws on an unknown id', () => {
    const scope = createScope();
    expect(() => coverageForDoc(scope, 'nope')).toThrow(KnowledgeError);
  });
});

describe('docsCoveringPath', () => {
  it('returns deduped page ids whose covers glob matches the path (one-way)', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', '# core', ['covers: [packages/core/src/**]']));
    writeWikiFile(scope, 'cli.md', pageRaw('cli', '# cli', ['covers: [packages/cli/src/**]']));

    expect(docsCoveringPath(scope, 'packages/core/src/store/checklist.ts')).toEqual(['core']);
    expect(docsCoveringPath(scope, 'packages/cli/src/index.ts')).toEqual(['cli']);
  });

  it('returns an empty array when no glob matches', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', '# core', ['covers: [packages/core/src/**]']));

    expect(docsCoveringPath(scope, 'packages/app/src/page.tsx')).toEqual([]);
  });
});
