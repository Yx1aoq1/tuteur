import { type Scope } from '../paths.js';
import {
  readKnowledgeEntryFile,
  removeKnowledgeEntry,
  knowledgeEntryType,
  moveKnowledgeEntry,
  writeKnowledgeFile,
  makeKnowledgeDir,
} from '../store/index.js';
import { slugify } from '../utils/index.js';
import { listKnowledgePages } from './pages.js';
import { rebuildAndCleanIndexes, isIndexFile } from './indexes.js';
import { splitFrontmatter, withUpdated, assemble, today } from './frontmatter.js';
import { KnowledgeError } from './errors.js';

// ── Write face (CRUD; core 独占 .withy 写入,web 经此维护知识库) ───────────────

/**
 * 规范化并校验一个 knowledge 相对路径:拒绝空串、绝对路径、Windows 盘符、以及任意 `..` 段,
 * 防目录穿越。所有按 relPath 的读写入口先过此关(读写共用单点收口)。路径以 `knowledge/`
 * 为根(如 `wiki/api.md`、`sources/rfc.md`),不再局限于 `wiki/`。
 *
 * @param relPath 客户端传入的 knowledge 相对路径(可能含 `\`、`.`、越界段)
 * @return 规范化后的 posix relPath(去空段/`.` 段、collapse 斜杠)
 */
export function assertInsideKnowledge(relPath: string): string {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new KnowledgeError('empty knowledge path');
  }

  const posix = relPath.replace(/\\/g, '/');
  if (posix.startsWith('/') || /^[a-zA-Z]:/.test(posix)) {
    throw new KnowledgeError(`absolute knowledge path rejected: ${relPath}`);
  }

  const segments: string[] = [];
  for (const segment of posix.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw new KnowledgeError(`path escapes knowledge/: ${relPath}`);
    segments.push(segment);
  }
  if (segments.length === 0) throw new KnowledgeError('empty knowledge path');

  return segments.join('/');
}

// 该 relPath 是否落在机器托管的 wiki/ 子树(决定是否重算 index/graph)。
function isWikiRelPath(relPath: string): boolean {
  return relPath === 'wiki' || relPath.startsWith('wiki/');
}

// 生成物/只读:任意层 index.md 与根 log.md(由命令维护,不可经编辑面改名/删除/存盘)。
function isReadonlyKnowledgeFile(relPath: string): boolean {
  return isIndexFile(relPath) || relPath === 'log.md';
}

/**
 * 保存一页正文:逐字保留 frontmatter 整块(含未知字段)、仅就地把 `updated:` 置当天、换正文段。
 * 正文中的 `[[link]]` 不经解析器往返,逐字保留。**不重建 index**(正文不影响索引)。
 * 对 index.md 或不存在的页报错。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 * @param body 新正文(frontmatter 之后的内容)
 */
export function saveKnowledgePageBody(scope: Scope, relPath: string, body: string): void {
  const rel = assertInsideKnowledge(relPath);
  if (isReadonlyKnowledgeFile(rel)) throw new KnowledgeError('generated file is read-only');

  const raw = readKnowledgeEntryFile(scope, rel);
  if (raw === null) throw new KnowledgeError(`page not found: ${rel}`);

  const { frontmatter } = splitFrontmatter(raw);
  writeKnowledgeFile(scope, rel, assemble(frontmatter ? withUpdated(frontmatter, today()) : null, body));
}

// 一页用于编辑的内容:正文 + 只读标记(生成物只读)。
export interface KnowledgePageContent {
  // 规范化后的 knowledge 相对路径
  relPath: string;

  // 生成物(index.md / 根 log.md)→ 只读
  readonly: boolean;

  // frontmatter 之后的正文(去前导空行)
  body: string;
}

/**
 * 读取一页用于编辑的内容(拆出正文 + 只读标记);frontmatter 不下发(仅 core 持有)。
 *
 * @param scope 项目 scope
 * @param relPath knowledge 相对路径
 * @return 页不存在时返回 null
 */
export function readKnowledgePageContent(scope: Scope, relPath: string): KnowledgePageContent | null {
  const rel = assertInsideKnowledge(relPath);
  const raw = readKnowledgeEntryFile(scope, rel);
  if (raw === null) return null;

  return {
    relPath: rel,
    readonly: isReadonlyKnowledgeFile(rel),
    body: splitFrontmatter(raw).body.replace(/^\n+/, '').trimEnd(),
  };
}

// 生成最小 frontmatter + 空正文的新页;scope/updated 为装饰性(core 不消费)。
function minimalPage(scope: Scope, slug: string, title: string): string {
  return ['---', `id: ${slug}`, `title: ${title}`, `scope: ${scope.kind}`, `updated: ${today()}`, '---', '', ''].join(
    '\n',
  );
}

// 把可选的目录入参规范成 knowledge 相对目录('' = knowledge 根)。
function normalizeDir(dirRelPath: string | undefined): string {
  return dirRelPath && dirRelPath.trim() ? assertInsideKnowledge(dirRelPath) : '';
}

/**
 * 新建一页:name → slug 作文件名。落在 `wiki/` 下的页参与索引(slug 与全库页 id 冲突则报错、
 * 写后重算 index);落在 sources/user 等非 wiki 目录的页只写最小 frontmatter、不进索引/图/注入。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = knowledge 根)
 * @param name 页名(同时作 slug 与初始 title)
 * @return 新页的 knowledge 相对路径
 */
export function createKnowledgePage(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && knowledgeEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const slug = slugify(name);
  const relPath = dir ? `${dir}/${slug}.md` : `${slug}.md`;
  const wiki = isWikiRelPath(relPath);

  if (wiki && listKnowledgePages(scope).some(page => page.id === slug)) {
    throw new KnowledgeError(`knowledge id already exists: ${slug}`);
  }
  if (knowledgeEntryType(scope, relPath) !== null) throw new KnowledgeError(`file already exists: ${relPath}`);

  writeKnowledgeFile(scope, relPath, minimalPage(scope, slug, name));
  if (wiki) rebuildAndCleanIndexes(scope);

  return relPath;
}

/**
 * 新建文件夹:在目标目录下创建子目录(允许空目录,树中可见;空目录不产生 index)。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = knowledge 根)
 * @param name 文件夹名(slugify 后作目录名)
 * @return 新目录的 knowledge 相对路径
 */
export function createKnowledgeFolder(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && knowledgeEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const relPath = dir ? `${dir}/${slugify(name)}` : slugify(name);
  if (knowledgeEntryType(scope, relPath) !== null) throw new KnowledgeError(`already exists: ${relPath}`);

  makeKnowledgeDir(scope, relPath);
  return relPath;
}

/**
 * 重命名/移动一个文件或文件夹(简单移动,不改 frontmatter、不改写别处链接)。
 * 目标已存在则报错(不覆盖);生成物(index.md / 根 log.md)不可改名。涉及 wiki/ 时重算 index。
 *
 * @param scope 项目 scope
 * @param fromRelPath 源 knowledge 相对路径
 * @param toRelPath 目标 knowledge 相对路径
 */
export function renameKnowledgeEntry(scope: Scope, fromRelPath: string, toRelPath: string): void {
  const from = assertInsideKnowledge(fromRelPath);
  const to = assertInsideKnowledge(toRelPath);
  if (isReadonlyKnowledgeFile(from) || isReadonlyKnowledgeFile(to)) {
    throw new KnowledgeError('generated file cannot be renamed');
  }

  if (knowledgeEntryType(scope, from) === null) throw new KnowledgeError(`not found: ${from}`);
  if (knowledgeEntryType(scope, to) !== null) throw new KnowledgeError(`target already exists: ${to}`);

  moveKnowledgeEntry(scope, from, to);
  if (isWikiRelPath(from) || isWikiRelPath(to)) rebuildAndCleanIndexes(scope);
}

/**
 * 删除一个文件或文件夹(目录递归);生成物(index.md / 根 log.md)不可删除。涉及 wiki/ 时重算
 * index(删某目录最后一页后,其孤儿生成 index.md 被清理)。
 *
 * @param scope 项目 scope
 * @param relPath knowledge 相对路径
 */
export function deleteKnowledgeEntry(scope: Scope, relPath: string): void {
  const rel = assertInsideKnowledge(relPath);
  if (isReadonlyKnowledgeFile(rel)) throw new KnowledgeError('generated file cannot be deleted');
  if (knowledgeEntryType(scope, rel) === null) throw new KnowledgeError(`not found: ${rel}`);

  removeKnowledgeEntry(scope, rel);
  if (isWikiRelPath(rel)) rebuildAndCleanIndexes(scope);
}
