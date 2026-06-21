import { basename } from 'node:path';
import { type Scope } from '../paths.js';
import { listKnowledgePages } from './pages.js';
import type { KnowledgePage } from './pages.js';

// 关系图节点(一页 wiki 或一个被引用的原始源)
export interface KnowledgeGraphNode {
  id: string;
  title: string;
  kind?: string;
  path: string;
  scope: 'global' | 'project';

  // 入链数(仅统计 [[link]] 边,孤儿判定用)
  inDegree: number;

  // 出边数([[link]] + source)
  outDegree: number;
}

// 关系图边:link=正文 [[id]] 引用;source=frontmatter 源引用;cover=文档→代码 glob
export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: 'link' | 'source' | 'cover';

  // 合并图中项目页指向仅存在于全局的 id(跨 scope 边)
  crossScope?: boolean;

  // link 边指向不存在的页(lint 也会单独报)
  broken?: boolean;
}

// 文档关系图(节点/边);供 web 图谱视图 + lint
export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

// 由一组页派生关系图;source 引用补成 kind:source 的节点
function buildGraph(pages: KnowledgePage[]): KnowledgeGraph {
  const nodes = new Map<string, KnowledgeGraphNode>();
  for (const page of pages) {
    nodes.set(page.id, {
      id: page.id,
      title: page.title,
      kind: page.kind,
      path: page.path,
      scope: page.scope,
      inDegree: 0,
      outDegree: 0,
    });
  }

  const edges: KnowledgeGraphEdge[] = [];
  for (const page of pages) {
    const from = nodes.get(page.id);

    for (const target of page.links) {
      const to = nodes.get(target);
      const edge: KnowledgeGraphEdge = { from: page.id, to: target, type: 'link' };
      if (!to) {
        edge.broken = true;
      } else {
        to.inDegree++;
        if (page.scope === 'project' && to.scope === 'global') edge.crossScope = true;
      }
      if (from) from.outDegree++;
      edges.push(edge);
    }

    for (const source of page.sources) {
      let to = nodes.get(source);
      if (!to) {
        to = {
          id: source,
          title: basename(source),
          kind: 'source',
          path: source,
          scope: page.scope,
          inDegree: 0,
          outDegree: 0,
        };
        nodes.set(source, to);
      }
      to.inDegree++;
      if (from) from.outDegree++;
      edges.push({ from: page.id, to: source, type: 'source' });
    }

    for (const glob of page.covers) {
      let to = nodes.get(glob);
      if (!to) {
        to = {
          id: glob,
          title: glob,
          kind: 'code',
          path: glob,
          scope: page.scope,
          inDegree: 0,
          outDegree: 0,
        };
        nodes.set(glob, to);
      }
      to.inDegree++;
      if (from) from.outDegree++;
      edges.push({ from: page.id, to: glob, type: 'cover' });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * 从 `[[链接]]` 与 frontmatter `sources` 派生单 scope 的文档关系图(knowledge.md §9)。
 *
 * @param scope 目标 scope
 */
export function deriveKnowledgeGraph(scope: Scope): KnowledgeGraph {
  return buildGraph(listKnowledgePages(scope));
}

/**
 * 派生全局+项目合并的全景图(web「合并」视图)。id 撞车项目覆盖全局,
 * 跨 scope 边(项目页引用仅存在于全局的 id)标 `crossScope`。
 *
 * @param project 项目 scope
 * @param global 全局 scope
 */
export function deriveMergedGraph(project: Scope, global: Scope): KnowledgeGraph {
  const projectPages = listKnowledgePages(project);
  const overridden = new Set(projectPages.map(page => page.id));
  const globalPages = listKnowledgePages(global).filter(page => !overridden.has(page.id));

  return buildGraph([...globalPages, ...projectPages]);
}
