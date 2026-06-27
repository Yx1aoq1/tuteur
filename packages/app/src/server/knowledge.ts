// 知识库服务端读取层:所有 .withy/knowledge 读取经此处调用 @withy/core,浏览器不碰 fs。
// 仅在 Server Component / route handler 中导入(会拉入 node:fs)。纯转换函数额外导出供单测。

import { readKnowledgePageContent, readGraphCached, listKnowledgeEntries } from '@withy/core';
import type { Scope, KnowledgeTreeEntry, KnowledgeGraph } from '@withy/core';
import type { KnowledgeGraphView, KnowledgeTreeNode, KnowledgeFileView } from '@/types/knowledge';

function baseName(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? relPath : relPath.slice(slash + 1);
}

function dirName(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? '' : relPath.slice(0, slash);
}

// 目录在前、同类按名称;让树渲染稳定(对齐文件管理器直觉)。
function compareNodes(a: KnowledgeTreeNode, b: KnowledgeTreeNode): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * 把 knowledge/ 的扁平条目列表组装成嵌套树(含空目录;生成物 index.md / 根 log.md 标只读)。纯函数,供单测。
 *
 * @param entries core `listKnowledgeEntries` 的扁平 dirs+files
 * @return 排序后的根节点数组(目录在前)
 */
export function buildKnowledgeTree(entries: KnowledgeTreeEntry[]): KnowledgeTreeNode[] {
  const byPath = new Map<string, KnowledgeTreeNode>();
  const roots: KnowledgeTreeNode[] = [];

  // 浅在前:父目录节点先于子项建立,挂载时父必已存在
  const sorted = [...entries].sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const entry of sorted) {
    const name = baseName(entry.relPath);
    const node: KnowledgeTreeNode = {
      name: entry.type === 'file' ? name.replace(/\.md$/, '') : name,
      relPath: entry.relPath,
      type: entry.type,
      readonly: entry.type === 'file' && (name === 'index.md' || entry.relPath === 'log.md'),
      ...(entry.type === 'dir' ? { children: [] } : {}),
    };
    byPath.set(entry.relPath, node);

    const parent = byPath.get(dirName(entry.relPath));
    if (parent?.children) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] => {
    nodes.sort(compareNodes);
    for (const node of nodes) if (node.children) sortTree(node.children);
    return nodes;
  };

  return sortTree(roots);
}

/**
 * 适配 core 关系图到 xyflow 友好视图:断链 link 边的缺失目标补成 kind:missing 幽灵节点,
 * 以便红边两端都有节点可渲染。文档↔代码关系(cover 边 / code 节点)只活在查询/数据层,
 * 视图忽略它们(design.md:视图仅文档节点 + link/source 边)。纯函数,供单测。
 *
 * @param graph core 关系图(`readGraphCached` 结果,可能含 cover 边 / code 节点)
 * @param scopeKind 缺失幽灵节点挂的 scope
 */
export function adaptKnowledgeGraph(graph: KnowledgeGraph, scopeKind: 'global' | 'project'): KnowledgeGraphView {
  const nodes: KnowledgeGraphView['nodes'] = graph.nodes
    .filter(node => node.kind !== 'code')
    .map(node => ({
      id: node.id,
      label: node.title,
      kind: node.kind,
      scope: node.scope,
      inDegree: node.inDegree,
      // core 的 path 形如 `.withy/knowledge/wiki/<rel>`;取 /wiki/ 之后段拼回 `wiki/<rel>`,
      // 与文件树的 knowledge-相对 relPath 一致(点图节点能打开同一文件)。
      // source/missing 节点 path 非 wiki 文件 → 无 relPath(不可打开)。
      relPath: node.path.includes('/wiki/') ? `wiki/${node.path.split('/wiki/')[1]}` : undefined,
    }));
  const known = new Set(nodes.map(node => node.id));

  const edges: KnowledgeGraphView['edges'] = graph.edges
    .filter(edge => edge.type !== 'cover')
    .map((edge, index) => ({
      id: `e${index}`,
      source: edge.from,
      target: edge.to,
      broken: Boolean(edge.broken),
      kind: edge.type === 'source' ? 'source' : 'link',
    }));

  for (const edge of graph.edges) {
    if (edge.type === 'link' && edge.broken && !known.has(edge.to)) {
      known.add(edge.to);
      nodes.push({ id: edge.to, label: edge.to, kind: 'missing', scope: scopeKind });
    }
  }

  return { nodes, edges };
}

/** 文件树视图模型(knowledge/ 全层:sources/wiki/user… + 根 index/log;含空目录、生成物只读),供首屏 Server Component 下传。 */
export function getKnowledgeTree(scope: Scope): KnowledgeTreeNode[] {
  return buildKnowledgeTree(listKnowledgeEntries(scope));
}

/**
 * 单文件正文 + 只读标记;relPath 经 core `assertInsideKnowledge` 校验。
 * @return 文件不存在或越界返回 null(越界时 core 抛错,调用方按 400 处理)
 */
export function getKnowledgeFile(scope: Scope, relPath: string): KnowledgeFileView | null {
  return readKnowledgePageContent(scope, relPath);
}

/** 项目 scope 的关系图(xyflow 友好;broken 边标红;缓存优先,指纹失效自动重建)。 */
export function getKnowledgeGraph(scope: Scope): KnowledgeGraphView {
  return adaptKnowledgeGraph(readGraphCached(scope), scope.kind);
}
