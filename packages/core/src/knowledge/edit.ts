import { type Scope } from '../paths.js';
import {
  removeWikiEntry,
  wikiEntryType,
  writeWikiFile,
  moveWikiEntry,
  readWikiFile,
  makeWikiDir,
} from '../store/index.js';
import { slugify } from '../utils/index.js';
import { listKnowledgePages } from './pages.js';
import { rebuildAndCleanIndexes, isIndexFile } from './indexes.js';
import { splitFrontmatter, withUpdated, assemble, today } from './frontmatter.js';
import { KnowledgeError } from './errors.js';

// ── Write face (CRUD; core 独占 .withy 写入,web 经此维护知识库) ───────────────

/**
 * 规范化并校验一个 wiki 相对路径:拒绝空串、绝对路径、Windows 盘符、以及任意 `..` 段,
 * 防目录穿越。所有按 relPath 的读写入口先过此关(读写共用单点收口)。
 *
 * @param relPath 客户端传入的 wiki 相对路径(可能含 `\`、`.`、越界段)
 * @return 规范化后的 posix relPath(去空段/`.` 段、collapse 斜杠)
 */
export function assertInsideWiki(relPath: string): string {
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
    if (segment === '..') throw new KnowledgeError(`path escapes wiki/: ${relPath}`);
    segments.push(segment);
  }
  if (segments.length === 0) throw new KnowledgeError('empty knowledge path');

  return segments.join('/');
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
  const rel = assertInsideWiki(relPath);
  if (isIndexFile(rel)) throw new KnowledgeError('index.md is generated and read-only');

  const raw = readWikiFile(scope, rel);
  if (raw === null) throw new KnowledgeError(`page not found: ${rel}`);

  const { frontmatter } = splitFrontmatter(raw);
  writeWikiFile(scope, rel, assemble(frontmatter ? withUpdated(frontmatter, today()) : null, body));
}

// 一页用于编辑的内容:正文 + 只读标记(index.md 为只读)。
export interface KnowledgePageContent {
  // 规范化后的 wiki 相对路径
  relPath: string;

  // index.md 为生成物 → 只读
  readonly: boolean;

  // frontmatter 之后的正文(去前导空行)
  body: string;
}

/**
 * 读取一页用于编辑的内容(拆出正文 + 只读标记);frontmatter 不下发(仅 core 持有)。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 * @return 页不存在时返回 null
 */
export function readKnowledgePageContent(scope: Scope, relPath: string): KnowledgePageContent | null {
  const rel = assertInsideWiki(relPath);
  const raw = readWikiFile(scope, rel);
  if (raw === null) return null;

  return { relPath: rel, readonly: isIndexFile(rel), body: splitFrontmatter(raw).body.replace(/^\n+/, '').trimEnd() };
}

// 生成最小 frontmatter + 空正文的新页;scope/updated 为装饰性(core 不消费)。
function minimalPage(scope: Scope, slug: string, title: string): string {
  return ['---', `id: ${slug}`, `title: ${title}`, `scope: ${scope.kind}`, `updated: ${today()}`, '---', '', ''].join(
    '\n',
  );
}

// 把可选的目录入参规范成 wiki 相对目录('' = wiki 根)。
function normalizeDir(dirRelPath: string | undefined): string {
  return dirRelPath && dirRelPath.trim() ? assertInsideWiki(dirRelPath) : '';
}

/**
 * 新建一页:name → slug 作文件名;slug 与全库任一页 id 冲突则报错(不静默加序号)。
 * 写入最小 frontmatter 空页 → 重建并清理 index;返回新页 wiki 相对路径。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = wiki 根)
 * @param name 页名(同时作 slug 与初始 title)
 * @return 新页的 wiki 相对路径
 */
export function createKnowledgePage(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && wikiEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const slug = slugify(name);
  if (listKnowledgePages(scope).some(page => page.id === slug)) {
    throw new KnowledgeError(`knowledge id already exists: ${slug}`);
  }

  const relPath = dir ? `${dir}/${slug}.md` : `${slug}.md`;
  if (wikiEntryType(scope, relPath) !== null) throw new KnowledgeError(`file already exists: ${relPath}`);

  writeWikiFile(scope, relPath, minimalPage(scope, slug, name));
  rebuildAndCleanIndexes(scope);

  return relPath;
}

/**
 * 新建文件夹:在目标目录下创建子目录(允许空目录,树中可见;空目录不产生 index)。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = wiki 根)
 * @param name 文件夹名(slugify 后作目录名)
 * @return 新目录的 wiki 相对路径
 */
export function createKnowledgeFolder(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && wikiEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const relPath = dir ? `${dir}/${slugify(name)}` : slugify(name);
  if (wikiEntryType(scope, relPath) !== null) throw new KnowledgeError(`already exists: ${relPath}`);

  makeWikiDir(scope, relPath);
  return relPath;
}

/**
 * 重命名/移动一个文件或文件夹(简单移动,不改 frontmatter、不改写别处链接)。
 * 目标已存在则报错(不覆盖);index.md 不可单独改名。完成后重建并清理 index。
 *
 * @param scope 项目 scope
 * @param fromRelPath 源 wiki 相对路径
 * @param toRelPath 目标 wiki 相对路径
 */
export function renameKnowledgeEntry(scope: Scope, fromRelPath: string, toRelPath: string): void {
  const from = assertInsideWiki(fromRelPath);
  const to = assertInsideWiki(toRelPath);
  if (isIndexFile(from) || isIndexFile(to)) throw new KnowledgeError('index.md is generated and cannot be renamed');

  if (wikiEntryType(scope, from) === null) throw new KnowledgeError(`not found: ${from}`);
  if (wikiEntryType(scope, to) !== null) throw new KnowledgeError(`target already exists: ${to}`);

  moveWikiEntry(scope, from, to);
  rebuildAndCleanIndexes(scope);
}

/**
 * 删除一个文件或文件夹(目录递归);index.md 不可单独删除。完成后重建并清理 index
 * (删某目录最后一页后,其孤儿生成 index.md 被清理)。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 */
export function deleteKnowledgeEntry(scope: Scope, relPath: string): void {
  const rel = assertInsideWiki(relPath);
  if (isIndexFile(rel)) throw new KnowledgeError('index.md is generated and cannot be deleted');
  if (wikiEntryType(scope, rel) === null) throw new KnowledgeError(`not found: ${rel}`);

  removeWikiEntry(scope, rel);
  rebuildAndCleanIndexes(scope);
}
