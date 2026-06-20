import { relative, resolve } from 'node:path';
import { type Scope, knowledgeWikiPath, knowledgeDir } from '../paths.js';
import { readKnowledgeSource, listKnowledgeFiles } from '../store/index.js';
import { parseFrontmatter, asString } from './frontmatter.js';

// 注入形态:full=注正文(短而必读),index=注 title+summary+路径(长文档按需下钻)
export type InjectMode = 'full' | 'index';

// 一条知识条目(knowledge/wiki/<id>.md 解析结果);供注入与 web 知识库管理
export interface KnowledgeEntry {
  // 稳定标识(注入按 id 引用;缺省取文件名)
  id: string;

  // 条目标题(缺省回退为 id)
  title: string;

  // 一句话摘要(index 形态注入时展示)
  summary?: string;

  // 注入形态;缺省 index
  inject: InjectMode;

  // 是否进默认注入集
  injectByDefault: boolean;

  // 正文(frontmatter 之后的内容)
  body: string;

  // 相对 scope 根的路径,供 agent 按需下钻
  path: string;
}

// 把一段 wiki 原文解析成注入条目;fallbackId 用于 frontmatter 缺 id 时兜底
function entryFromRaw(raw: string, fallbackId: string, path: string): KnowledgeEntry {
  const { data, body } = parseFrontmatter(raw);
  const id = asString(data.id) ?? fallbackId;

  return {
    id,
    title: asString(data.title) ?? id,
    summary: asString(data.summary),
    inject: data.inject === 'full' ? 'full' : 'index',
    injectByDefault: data.injectByDefault === true,
    body: body.trim(),
    path,
  };
}

/**
 * 按 id 读取并解析一条知识条目。先走扁平 `wiki/<id>.md` 快路径(默认平铺布局),
 * 命中且 id 一致即返回;否则递归扫 wiki 树按 frontmatter id(缺则文件名)匹配,
 * 让移进子目录的页仍能按 id 注入(knowledge.md §4/§6.1:id 与路径解耦)。
 *
 * @param scope 目标 scope(项目或全局)
 * @param id 知识条目 id
 * @return 条目不存在时返回 null
 *
 * @example
 * readKnowledgeEntry(scope, 'api-conventions');
 */
export function readKnowledgeEntry(scope: Scope, id: string): KnowledgeEntry | null {
  const flat = readKnowledgeSource(scope, id);
  if (flat !== null) {
    const entry = entryFromRaw(flat, id, relative(scope.root, knowledgeWikiPath(scope, id)));
    if (entry.id === id) return entry; // 文件名即 id 的常见情形,免去全树扫描
  }

  for (const file of listKnowledgeFiles(scope)) {
    const declared = asString(parseFrontmatter(file.raw).data.id) ?? file.id;
    if (declared === id) {
      return entryFromRaw(
        file.raw,
        file.id,
        relative(scope.root, resolve(knowledgeDir(scope), 'wiki', file.wikiRelPath)),
      );
    }
  }

  return null;
}
