import { readKnowledgeEntry } from './knowledge.js';
import { readContextConfig } from './store.js';
import type { InjectMode } from './knowledge.js';
import type { Scope } from './paths.js';

// 一条已解析的计划注入项(resolvePlannedContext 输出);形态决定 session-start 注正文还是注索引
export interface PlannedEntry {
  // 知识条目 id(context.json 引用的稳定标识)
  id: string;

  // 注入形态:full=注正文,index=注 title+summary+路径
  mode: InjectMode;

  // 标题(读不到知识条目时回退为 id)
  title: string;

  // 一句话摘要(index 形态展示;可空)
  summary?: string;

  // 正文(仅 full 形态带)
  body?: string;

  // 知识页相对路径(供 agent 按需下钻;读不到为空)
  path?: string;
}

// 把一个知识 id 解析成计划注入项;条目缺失时降级为 index 占位(不静默丢,让悬空显形)
function toPlannedEntry(scope: Scope, id: string): PlannedEntry {
  const entry = readKnowledgeEntry(scope, id);
  if (!entry) {
    return { id, mode: 'index', title: id };
  }

  return {
    id: entry.id,
    mode: entry.inject,
    title: entry.title,
    summary: entry.summary,
    body: entry.inject === 'full' ? entry.body : undefined,
    path: entry.path,
  };
}

/**
 * 计算某节点的计划注入清单(harness §4 / knowledge.md §7)。
 * 合并项目 `default` 与该节点覆盖,去掉 `disabled`,按 id 去重,逐条解析成带注入形态的条目。
 * 全局 injectByDefault 层为后续增强(knowledge.md)。
 *
 * @param scope 目标 scope
 * @param _taskId 任务 id(当前未参与计算,保留以备 task 关键产物接入)
 * @param nodeId 当前节点 id;空串表示无活跃节点,只取 default
 * @return 去重后的计划注入项,顺序为 default.required→default.optional→node.required→node.optional
 *
 * @example
 * resolvePlannedContext(scope, taskId, 'dev');
 */
export function resolvePlannedContext(scope: Scope, _taskId: string, nodeId: string): PlannedEntry[] {
  const config = readContextConfig(scope);
  const nodeSet = config.nodes[nodeId];

  const disabled = new Set([...config.default.disabled, ...(nodeSet?.disabled ?? [])]);
  const ids = [
    ...config.default.required,
    ...config.default.optional,
    ...(nodeSet?.required ?? []),
    ...(nodeSet?.optional ?? []),
  ];

  const seen = new Set<string>();
  const entries: PlannedEntry[] = [];

  for (const id of ids) {
    if (disabled.has(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push(toPlannedEntry(scope, id));
  }

  return entries;
}
