import picomatch from 'picomatch';
import { type Scope } from '../paths.js';
import { listKnowledgePages } from './pages.js';
import { KnowledgeError } from './errors.js';
import type { KnowledgeGraph } from './graph.js';

// 关系查询纯函数:文档↔文档(relatedDocs)、文档→代码(coverageForDoc)、代码→文档
// (docsCoveringPath)。relatedDocs 吃图、不碰盘;coverage 两支读页(covers 在 frontmatter)。
// glob→文件展开实时,不缓存;指纹只跟踪 wiki 页 mtime(见 cache.ts)。

// 非文档节点的 kind(source 源、code 代码 glob、missing 断链幽灵):relatedDocs 不计入
const NON_DOC_KINDS = new Set(['source', 'code', 'missing']);

function isDocNode(graph: KnowledgeGraph, id: string): boolean {
  const node = graph.nodes.find(n => n.id === id);
  return Boolean(node) && !NON_DOC_KINDS.has(node?.kind ?? '');
}

/**
 * 文档→文档:与 `id` 有直接 `[[link]]`(出或入)的去重文档 id 集合。仅 link 边、1 跳;
 * 只返回同 scope 仍存在的文档节点(断链/跨 scope 目标不计入);`source`/`cover` 边不参与。
 *
 * @param graph 单 scope 关系图(通常来自 `readGraphCached`)
 * @param id 起点文档 id
 * @return 邻居文档 id(去重、不含自身);`id` 不在图中 → 抛 KnowledgeError
 */
export function relatedDocs(graph: KnowledgeGraph, id: string): string[] {
  if (!graph.nodes.some(node => node.id === id)) {
    throw new KnowledgeError(`unknown knowledge id "${id}"`);
  }

  const related = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== 'link') continue;

    const neighbor = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
    if (neighbor && neighbor !== id && isDocNode(graph, neighbor)) related.add(neighbor);
  }

  return [...related];
}

// 找一页或抛(coverage 两支共用);未知 id 不静默空集。
function requirePage(scope: Scope, id: string): { covers: string[] } {
  const page = listKnowledgePages(scope).find(p => p.id === id);
  if (!page) throw new KnowledgeError(`unknown knowledge id "${id}"`);

  return page;
}

/**
 * 文档→代码:该页声明的 `covers` globs **原样**返回(不展开为文件、不碰 fast-glob/picomatch)。
 *
 * @param scope 目标 scope
 * @param id 文档 id
 * @return 声明的 globs(原样);未知 id → 抛 KnowledgeError
 */
export function coverageForDoc(scope: Scope, id: string): string[] {
  return requirePage(scope, id).covers;
}

/**
 * 代码→文档:`covers` glob 命中传入 `path` 的文档 id(单向 `picomatch(页glob, path)`)。
 *
 * @param scope 目标 scope
 * @param path 仓库相对路径(posix)
 * @return 命中页 id(去重);无命中 → 空集(非错)
 */
export function docsCoveringPath(scope: Scope, path: string): string[] {
  const hits = new Set<string>();
  for (const page of listKnowledgePages(scope)) {
    if (page.covers.some(glob => picomatch.isMatch(path, glob))) hits.add(page.id);
  }

  return [...hits];
}
