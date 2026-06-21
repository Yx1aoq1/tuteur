import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writeWikiFile } from '../../src/store/index.js';
import { deriveKnowledgeGraph } from '../../src/knowledge/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-graph-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function pageRaw(id: string, body: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${id}`, ...extra, '---', '', body, ''].join('\n');
}

describe('deriveKnowledgeGraph — cover edges', () => {
  it('produces one cover edge + a code node per declared covers glob', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', '# core', ['covers: [packages/core/src/**]']));

    const graph = deriveKnowledgeGraph(scope);
    const cover = graph.edges.filter(edge => edge.type === 'cover');
    expect(cover).toEqual([{ from: 'core', to: 'packages/core/src/**', type: 'cover' }]);

    const codeNode = graph.nodes.find(node => node.id === 'packages/core/src/**');
    expect(codeNode).toMatchObject({ kind: 'code', path: 'packages/core/src/**', inDegree: 1 });
  });

  it('reuses one code node when two pages cover the same glob', () => {
    const scope = createScope();
    writeWikiFile(scope, 'core.md', pageRaw('core', '# core', ['covers: [packages/core/src/**]']));
    writeWikiFile(scope, 'cli.md', pageRaw('cli', '# cli', ['covers: [packages/core/src/**]']));

    const graph = deriveKnowledgeGraph(scope);
    const codeNodes = graph.nodes.filter(node => node.kind === 'code');
    expect(codeNodes).toHaveLength(1);
    expect(codeNodes[0].inDegree).toBe(2);
    expect(graph.edges.filter(edge => edge.type === 'cover')).toHaveLength(2);
  });

  it('emits no cover edges for pages without covers', () => {
    const scope = createScope();
    writeWikiFile(scope, 'web.md', pageRaw('web', '# web'));

    const graph = deriveKnowledgeGraph(scope);
    expect(graph.edges.some(edge => edge.type === 'cover')).toBe(false);
    expect(graph.nodes.some(node => node.kind === 'code')).toBe(false);
  });
});
