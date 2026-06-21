import { type Scope } from '../paths.js';
import { writeGraphCacheFile, readGraphCacheFile, statWikiPages } from '../store/index.js';
import { deriveKnowledgeGraph } from './graph.js';
import { nowIso } from '../utils/index.js';
import type { KnowledgeGraph } from './graph.js';

// 派生关系图的本地缓存(knowledge/graph.json,gitignore)。把内存即用的 deriveKnowledgeGraph
// 升级为「带内容指纹的落盘缓存」:查询走缓存,指纹失效(页更新/增删/文件缺失)才重派生。
// 失效靠内容指纹,绝不靠时间 TTL;last-writer-wins、幂等、不上锁(并发重建算同一份数据)。

// graph.json 的生成元信息(内容指纹 + 生成时间戳)
interface GraphCacheMeta {
  // 生成时刻(ISO);装饰性,失效判定不看它
  generatedAt: string;

  // 生成时 wiki/**/*.md 的最大 mtimeMs(指纹)
  maxMtime: number;

  // 生成时非 index 页数(指纹)
  pageCount: number;
}

// 落盘的缓存结构 = 指纹 meta + 派生图
interface GraphCache {
  meta: GraphCacheMeta;
  nodes: KnowledgeGraph['nodes'];
  edges: KnowledgeGraph['edges'];
}

// 宽松校验读回的缓存:形状不符当损坏(返回 null,触发重建)
function asCache(value: unknown): GraphCache | null {
  if (typeof value !== 'object' || value === null) return null;
  const cache = value as Partial<GraphCache>;
  const meta = cache.meta;
  if (!meta || typeof meta.maxMtime !== 'number' || typeof meta.pageCount !== 'number') return null;
  if (!Array.isArray(cache.nodes) || !Array.isArray(cache.edges)) return null;

  return cache as GraphCache;
}

/**
 * 重派生当前 scope 的关系图并写回 `graph.json`(带当下内容指纹)。eager 刷新入口:
 * `rebuildKnowledgeIndexes` 末尾调一次,与查询的 lazy 刷新并存。
 *
 * @param scope 目标 scope
 * @return 刚写回的关系图
 */
export function writeGraphCache(scope: Scope): KnowledgeGraph {
  const graph = deriveKnowledgeGraph(scope);
  const { maxMtimeMs, pageCount } = statWikiPages(scope);
  const cache: GraphCache = {
    meta: { generatedAt: nowIso(), maxMtime: maxMtimeMs, pageCount },
    nodes: graph.nodes,
    edges: graph.edges,
  };
  writeGraphCacheFile(scope, cache);

  return graph;
}

/**
 * 缓存优先读关系图:读 `graph.json` → `stat` wiki 页求指纹 → 与 meta 比对;
 * 缺失/损坏/有页更新/页数变化 → 重派生并写回;否则返回缓存。
 *
 * @param scope 目标 scope
 * @return 关系图(缓存命中即缓存,否则刚重建的)
 */
export function readGraphCached(scope: Scope): KnowledgeGraph {
  const cache = asCache(readGraphCacheFile(scope));
  if (!cache) return writeGraphCache(scope);

  const { maxMtimeMs, pageCount } = statWikiPages(scope);
  if (maxMtimeMs > cache.meta.maxMtime || pageCount !== cache.meta.pageCount) {
    return writeGraphCache(scope);
  }

  return { nodes: cache.nodes, edges: cache.edges };
}
