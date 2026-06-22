import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writeWikiFile } from '../../src/store/index.js';
import { lintKnowledge } from '../../src/knowledge/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-lint-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function pageRaw(id: string, body: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${id}`, ...extra, '---', '', body, ''].join('\n');
}

// 在仓库根下放一个真实源文件,供 covers glob 命中。
function seedRepoFile(scope: Scope, relPath: string): void {
  const full = resolve(scope.root, relPath);
  mkdirSync(resolve(full, '..'), { recursive: true });
  writeFileSync(full, '// real file\n');
}

describe('lintKnowledge — dangling covers', () => {
  it('reports a covers glob that matches no repo files', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'self [[a]]', ['covers: [packages/ghost/src/**]']));

    const dangling = lintKnowledge(scope).filter(issue => issue.kind === 'dangling-cover');
    expect(dangling).toEqual([expect.objectContaining({ level: 'error', id: 'a', target: 'packages/ghost/src/**' })]);
  });

  it('does not report a covers glob that matches a real repo file', () => {
    const scope = createScope();
    seedRepoFile(scope, 'packages/core/src/store/checklist.ts');
    writeWikiFile(scope, 'a.md', pageRaw('a', 'self [[a]]', ['covers: [packages/core/src/**]']));

    expect(lintKnowledge(scope).some(issue => issue.kind === 'dangling-cover')).toBe(false);
  });
});
