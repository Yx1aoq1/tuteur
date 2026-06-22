import { describe, expect, it } from 'vitest';
import { buildKnowledgeTree, adaptKnowledgeGraph } from '../../src/server/knowledge';
import type { WikiEntry, KnowledgeGraph } from '@withy/core';

describe('buildKnowledgeTree', () => {
  it('nests dirs and files, keeps empty dirs, marks index.md readonly, labels without .md', () => {
    const entries: WikiEntry[] = [
      { relPath: 'design', type: 'dir' },
      { relPath: 'design/core.md', type: 'file' },
      { relPath: 'design/index.md', type: 'file' },
      { relPath: 'empty', type: 'dir' }, // 空目录也要保留
      { relPath: 'top.md', type: 'file' },
    ];

    const tree = buildKnowledgeTree(entries);

    // 目录在前(design, empty),文件在后(top)
    expect(tree.map(n => n.relPath)).toEqual(['design', 'empty', 'top.md']);

    const empty = tree.find(n => n.relPath === 'empty');
    expect(empty?.children).toEqual([]); // 空目录可见且 children 为空

    const design = tree.find(n => n.relPath === 'design');
    expect(design?.children?.map(c => ({ name: c.name, readonly: c.readonly }))).toEqual([
      { name: 'core', readonly: false }, // 去 .md 标签
      { name: 'index', readonly: true }, // index.md 只读
    ]);

    expect(tree.find(n => n.relPath === 'top.md')?.name).toBe('top');
  });
});

describe('adaptKnowledgeGraph', () => {
  it('maps nodes/edges and synthesizes a ghost node for a broken link target', () => {
    const graph: KnowledgeGraph = {
      nodes: [{ id: 'a', title: 'A', path: 'wiki/a.md', scope: 'project', inDegree: 0, outDegree: 1 }],
      edges: [{ from: 'a', to: 'ghost', type: 'link', broken: true }],
    };

    const view = adaptKnowledgeGraph(graph, 'project');

    expect(view.edges).toEqual([{ id: 'e0', source: 'a', target: 'ghost', broken: true, kind: 'link' }]);
    expect(view.nodes.find(n => n.id === 'ghost')).toEqual({
      id: 'ghost',
      label: 'ghost',
      kind: 'missing',
      scope: 'project',
    });
  });

  it('drops cover edges and code nodes (data-only) and passes inDegree through', () => {
    const graph: KnowledgeGraph = {
      nodes: [
        { id: 'a', title: 'A', path: '.withy/knowledge/wiki/a.md', scope: 'project', inDegree: 2, outDegree: 1 },
        {
          id: 'packages/core/src/**',
          title: 'packages/core/src/**',
          kind: 'code',
          path: 'packages/core/src/**',
          scope: 'project',
          inDegree: 1,
          outDegree: 0,
        },
      ],
      edges: [{ from: 'a', to: 'packages/core/src/**', type: 'cover' }],
    };

    const view = adaptKnowledgeGraph(graph, 'project');

    expect(view.nodes).toEqual([
      { id: 'a', label: 'A', kind: undefined, scope: 'project', inDegree: 2, relPath: 'a.md' },
    ]);
    expect(view.edges).toEqual([]);
  });
});
