import { type Scope } from '../paths.js';
import { readContextConfig } from '../store/index.js';
import { listKnowledgePages } from './pages.js';

// 一条 lint 发现:断链/悬空引用为 error,孤儿页为 warning
export interface KnowledgeIssue {
  level: 'error' | 'warning';
  kind: 'orphan' | 'broken-link' | 'dangling-ref';

  // 涉及的页 id(orphan/broken-link 的源页)
  id?: string;

  // 指向的目标(broken-link 的缺失页 / dangling-ref 的缺失 id)
  target?: string;
  message: string;
}

/**
 * 机械体检某 scope 知识库:孤儿页(入链 0)、断链(指向不存在的页)、
 * context.json 注入引用悬空(指向不存在的 id)。
 *
 * @param scope 目标 scope
 * @return 全部发现(空 = 健康);断链/悬空为 error,孤儿为 warning
 */
export function lintKnowledge(scope: Scope): KnowledgeIssue[] {
  const pages = listKnowledgePages(scope);
  const ids = new Set(pages.map(page => page.id));
  const inDegree = new Map<string, number>(pages.map(page => [page.id, 0]));

  const issues: KnowledgeIssue[] = [];

  for (const page of pages) {
    for (const target of page.links) {
      if (ids.has(target)) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      } else {
        issues.push({
          level: 'error',
          kind: 'broken-link',
          id: page.id,
          target,
          message: `page "${page.id}" links to missing page "${target}"`,
        });
      }
    }
  }

  for (const page of pages) {
    if ((inDegree.get(page.id) ?? 0) === 0) {
      issues.push({
        level: 'warning',
        kind: 'orphan',
        id: page.id,
        message: `orphan page "${page.id}" (no incoming links)`,
      });
    }
  }

  const config = readContextConfig(scope);
  const refs = new Set<string>();
  for (const set of [config.default, ...Object.values(config.nodes)]) {
    for (const id of [...set.required, ...set.optional]) refs.add(id);
  }
  for (const id of refs) {
    if (!ids.has(id)) {
      issues.push({
        level: 'error',
        kind: 'dangling-ref',
        target: id,
        message: `context.json injects unknown knowledge id "${id}"`,
      });
    }
  }

  return issues;
}
