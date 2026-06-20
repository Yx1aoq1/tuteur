import { nowIso } from '../utils/index.js';

// 低层 markdown/frontmatter 文本工具:解析 frontmatter 标量/数组、抽 [[link]]、拆/拼 frontmatter
// 与正文、posix 路径段帮助。纯函数、不碰盘,供 knowledge 各业务文件共用。

// 去掉成对的首尾引号(单/双引号)
function stripQuotes(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])) {
    return value.slice(1, -1);
  }

  return value;
}

// 解析一个 frontmatter 标量或内联数组(`[a, b]`);非数组按 true/false/字符串处理
function parseValue(value: string): string | boolean | string[] {
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner
      ? inner
          .split(',')
          .map(item => stripQuotes(item.trim()))
          .filter(Boolean)
      : [];
  }

  const scalar = stripQuotes(value);
  if (scalar === 'true') return true;
  if (scalar === 'false') return false;
  return scalar;
}

// 最小 frontmatter 解析:认 `key: scalar` 与 `key: [a, b]`(无 YAML 依赖);非 frontmatter 文件全当正文
export function parseFrontmatter(raw: string): { data: Record<string, string | boolean | string[]>; body: string } {
  const data: Record<string, string | boolean | string[]> = {};
  if (!raw.startsWith('---')) {
    return { data, body: raw };
  }

  const lines = raw.split('\n');
  let cursor = 1;

  for (; cursor < lines.length; cursor++) {
    if (lines[cursor].trim() === '---') {
      cursor++;
      break;
    }

    const line = lines[cursor];
    const sep = line.indexOf(':');
    if (sep === -1) continue;

    const key = line.slice(0, sep).trim();
    if (!key) continue;

    data[key] = parseValue(line.slice(sep + 1).trim());
  }

  return { data, body: lines.slice(cursor).join('\n') };
}

export function asString(value: string | boolean | string[] | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function asArray(value: string | boolean | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

// 抽取正文里的 [[id]] / [[id|alias]] 出链(取 id 段、去重)
export function extractLinks(body: string): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const id = match[1].split('|')[0].trim();
    if (id) links.add(id);
  }

  return [...links];
}

// 以第二个 `---` 为界拆出 frontmatter 整块(逐字)与正文;无/未闭合 frontmatter 时 frontmatter=null。
export function splitFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { frontmatter: null, body: raw };

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { frontmatter: lines.slice(0, i + 1).join('\n'), body: lines.slice(i + 1).join('\n') };
    }
  }

  return { frontmatter: null, body: raw }; // 未闭合:整块当正文,不擅自改写
}

// 就地更新/插入 frontmatter 内的 `updated:` 行为当天(只动这一行,其余逐字保留)。
export function withUpdated(frontmatter: string, date: string): string {
  const lines = frontmatter.split('\n');
  const close = lines.length - 1; // 收尾 `---` 行下标

  for (let i = 1; i < close; i++) {
    if (/^updated\s*:/.test(lines[i])) {
      lines[i] = `updated: ${date}`;
      return lines.join('\n');
    }
  }

  lines.splice(close, 0, `updated: ${date}`); // 插在收尾 `---` 之前
  return lines.join('\n');
}

// 拼回「frontmatter + 空行 + 正文 + 尾换行」;去正文前导空行、规范尾部为单 `\n`。
export function assemble(frontmatter: string | null, body: string): string {
  const trimmed = body.replace(/^\n+/, '').replace(/[ \t\r\n]+$/, '');
  if (frontmatter === null) return trimmed ? `${trimmed}\n` : '';
  return trimmed ? `${frontmatter}\n\n${trimmed}\n` : `${frontmatter}\n`;
}

// 今天的人类日期(YYYY-MM-DD);装饰性 updated 用,core 不消费。
export function today(): string {
  return nowIso().slice(0, 10);
}

// posix 相对路径的目录段('' = 根)
export function posixDir(rel: string): string {
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? '' : rel.slice(0, slash);
}

// posix 相对路径的 basename
export function posixBase(rel: string): string {
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? rel : rel.slice(slash + 1);
}
