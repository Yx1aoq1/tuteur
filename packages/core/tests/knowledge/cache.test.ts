import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { knowledgeGraphCachePath, type Scope } from '../../src/paths.js';
import { writeWikiFile } from '../../src/store/index.js';
import { readGraphCached, writeGraphCache } from '../../src/knowledge/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-cache-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function pageRaw(id: string, body: string): string {
  return ['---', `id: ${id}`, `title: ${id}`, '---', '', body, ''].join('\n');
}

// 把 graph.json 的 meta.maxMtime 抹回 0,模拟「缓存比页旧」而不用等待真实 mtime 推进。
function ageCache(scope: Scope): void {
  const path = knowledgeGraphCachePath(scope);
  const cache = JSON.parse(readFileSync(path, 'utf8'));
  cache.meta.maxMtime = 0;
  writeFileSync(path, JSON.stringify(cache));
}

describe('readGraphCached', () => {
  it('generates graph.json on first read when absent', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'see [[b]]'));
    writeWikiFile(scope, 'b.md', pageRaw('b', 'leaf'));

    const graph = readGraphCached(scope);
    expect(graph.nodes.map(n => n.id).sort()).toEqual(['a', 'b']);

    const onDisk = JSON.parse(readFileSync(knowledgeGraphCachePath(scope), 'utf8'));
    expect(onDisk.meta).toMatchObject({ pageCount: 2 });
  });

  it('returns the cached graph when the fingerprint is unchanged (stale content survives)', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'one'));
    writeGraphCache(scope);

    // 直接改写 graph.json 注入哨兵节点;指纹未变 → 读应原样返回这份被污染的缓存。
    const path = knowledgeGraphCachePath(scope);
    const cache = JSON.parse(readFileSync(path, 'utf8'));
    cache.nodes.push({ id: 'SENTINEL', title: 'x', path: 'x', scope: 'project', inDegree: 0, outDegree: 0 });
    writeFileSync(path, JSON.stringify(cache));

    expect(readGraphCached(scope).nodes.some(n => n.id === 'SENTINEL')).toBe(true);
  });

  it('rebuilds when a page is newer than the cache fingerprint', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'one'));
    writeGraphCache(scope);
    ageCache(scope); // meta.maxMtime=0 < page mtime → 失效

    writeWikiFile(scope, 'a.md', pageRaw('a', 'see [[b]]'));
    writeWikiFile(scope, 'b.md', pageRaw('b', 'leaf'));

    expect(readGraphCached(scope).nodes.map(n => n.id).sort()).toEqual(['a', 'b']);
  });

  it('rebuilds when the page count changes', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'one'));
    writeGraphCache(scope);

    // 删页 → pageCount 变化 → 重建(即便 mtime 没推进)
    rmSync(resolve(scope.withyDir, 'knowledge/wiki/a.md'));
    writeWikiFile(scope, 'b.md', pageRaw('b', 'leaf'));

    expect(readGraphCached(scope).nodes.map(n => n.id)).toEqual(['b']);
  });

  it('treats a corrupt cache as missing and rebuilds', () => {
    const scope = createScope();
    writeWikiFile(scope, 'a.md', pageRaw('a', 'one'));
    writeGraphCache(scope);
    writeFileSync(knowledgeGraphCachePath(scope), 'not json{{');

    expect(readGraphCached(scope).nodes.map(n => n.id)).toEqual(['a']);
  });
});
