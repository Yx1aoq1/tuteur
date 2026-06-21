import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writeWikiFile } from '../../src/store/index.js';
import { listKnowledgePages } from '../../src/knowledge/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-pages-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function pageRaw(id: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${id}`, ...extra, '---', '', `# ${id}`, ''].join('\n');
}

describe('listKnowledgePages — covers field', () => {
  it('parses a frontmatter covers array', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', ['covers: [packages/core/src/**, packages/core/test/**]']));

    const [page] = listKnowledgePages(scope);
    expect(page.covers).toEqual(['packages/core/src/**', 'packages/core/test/**']);
  });

  it('defaults covers to an empty array when the field is absent', () => {
    const scope = createScope();
    writeWikiFile(scope, 'cli.md', pageRaw('cli'));

    const [page] = listKnowledgePages(scope);
    expect(page.covers).toEqual([]);
  });

  it('defaults covers to an empty array when the field is not a list', () => {
    const scope = createScope();
    writeWikiFile(scope, 'web.md', pageRaw('web', ['covers: not-a-list']));

    const [page] = listKnowledgePages(scope);
    expect(page.covers).toEqual([]);
  });
});
