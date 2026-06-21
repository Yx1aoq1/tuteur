import { relative, resolve } from 'node:path';
import { type Scope, knowledgeDir } from '../paths.js';
import { listKnowledgeFiles } from '../store/index.js';
import { parseFrontmatter, extractLinks, asString, asArray } from './frontmatter.js';
import type { KnowledgeFile } from '../store/index.js';
import type { InjectMode } from './entries.js';

// 维护视图:一页 wiki 的全量解析结果,供 graph/index/lint/edit 共用
export interface KnowledgePage {
  // 稳定标识(frontmatter id 优先,缺省取文件名)
  id: string;

  // 条目标题(缺省回退为 id)
  title: string;

  // 一句话摘要(index 行展示)
  summary?: string;

  // 条目类别(根索引按此分组)
  kind?: string;

  // 标签
  tags: string[];

  // 注入形态;缺省 index
  inject: InjectMode;

  // 是否进默认注入集
  injectByDefault: boolean;

  // frontmatter sources:本页综合自哪些原始源(派生 source 边)
  sources: string[];

  // frontmatter covers:本页记录的仓库相对代码 glob(派生 cover 边);缺省 []
  covers: string[];

  // 正文里的 [[id]] 出链(去重)
  links: string[];

  // 相对 knowledge/wiki/ 的路径(posix),供索引计算目录层级
  wikiRelPath: string;

  // 相对 scope 根的路径
  path: string;

  // 来源层(由所在 scope 决定;合并图里区分跨层边)
  scope: 'global' | 'project';
}

// 把一个 wiki 文件解析成维护视图页
function parsePage(file: KnowledgeFile, scope: Scope): KnowledgePage {
  const { data, body } = parseFrontmatter(file.raw);
  const id = asString(data.id) ?? file.id;

  return {
    id,
    title: asString(data.title) ?? id,
    summary: asString(data.summary),
    kind: asString(data.kind),
    tags: asArray(data.tags),
    inject: data.inject === 'full' ? 'full' : 'index',
    injectByDefault: data.injectByDefault === true,
    sources: asArray(data.sources),
    covers: asArray(data.covers),
    links: extractLinks(body),
    wikiRelPath: file.wikiRelPath,
    path: relative(scope.root, resolve(knowledgeDir(scope), 'wiki', file.wikiRelPath)),
    scope: scope.kind,
  };
}

/**
 * 列出某 scope 下全部 wiki 页(递归,跳过生成的 index.md)。
 *
 * @param scope 目标 scope
 * @return 解析后的维护视图页;无 wiki 目录时为空
 */
export function listKnowledgePages(scope: Scope): KnowledgePage[] {
  return listKnowledgeFiles(scope).map(file => parsePage(file, scope));
}
