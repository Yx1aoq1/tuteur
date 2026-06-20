// 自研 Milkdown 插件:让 `[[id]]` / `[[id|别名]]` 双链作为独立内联节点存活,
// 序列化逐字写回 `[[...]]`(绕过 mdast-util-to-markdown 对 `[` 的转义)。
// 阶段 0 已证实:裸 Crepe 会把 `[[foo]]` 转义成 `\[\[foo]]`,破坏关系图;此插件是 design R5 的落地。
//
// 三件套:
//  1) remark 插件——解析期把 text 节点里的 `[[...]]` 切成 `wikiLink` mdast 节点;
//     并注册 toMarkdownExtensions handler,序列化期把 `wikiLink` 原样写成 `[[value]]`。
//  2) $node——ProseMirror 内联原子节点 `wiki_link`,承载 value,双向映射 mdast `wikiLink`。
//  3) $inputRule——边打字边把 `[[...]]` 转成节点(否则当次会话新输入的链接仍是 text,保存时会被转义)。

import { $inputRule, $remark, $node } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';

// 匹配一处双链:捕获组为内部内容(含可选 `|别名`),不跨 `]`/换行。
const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

// 一个 mdast 节点(text 或我们注入的 wikiLink);只用到 type/value/children。
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

// 把一段文本按 `[[...]]` 切成 text 与 wikiLink 节点交替序列;无匹配时原样返回单 text。
function splitText(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  WIKILINK.lastIndex = 0;
  for (let match = WIKILINK.exec(value); match; match = WIKILINK.exec(value)) {
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    out.push({ type: 'wikiLink', value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });

  return out.length ? out : [{ type: 'text', value }];
}

// 递归把 mdast 树里 text 节点内的 `[[...]]` 切出来(inlineCode/code 非 text,天然跳过)。
function transformTree(node: MdNode): void {
  if (!node.children) return;

  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('[[')) {
      next.push(...splitText(child.value));
    } else {
      transformTree(child);
      next.push(child);
    }
  }
  node.children = next;
}

// remark 插件:注册原样序列化 handler + 解析期文本切分 transformer。
// 内部以最小 `this` 形态访问 processor.data();外层 cast 桥接到 $remark 期望的 RemarkPluginRaw。
const wikiLinkRemark = $remark('wikiLink', () => {
  const plugin = function remarkWikiLink(this: { data(): Record<string, unknown> }) {
    const data = this.data();
    const extensions = (data.toMarkdownExtensions as unknown[] | undefined) ?? [];
    if (!data.toMarkdownExtensions) data.toMarkdownExtensions = extensions;
    extensions.push({ handlers: { wikiLink: (node: MdNode) => `[[${node.value ?? ''}]]` } });

    return (tree: MdNode) => transformTree(tree);
  };

  return plugin as unknown as ReturnType<Parameters<typeof $remark>[1]>;
});

// ProseMirror 内联原子节点:展示为 `[[value]]`,双向映射 mdast wikiLink。
// 回调参数交给 NodeSchema 上下文推断,内部按需 cast 取 value(prose attrs/ mdast value 为松类型)。
const wikiLinkNode = $node('wiki_link', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-wikilink]',
      getAttrs: dom => ({ value: (dom as HTMLElement).getAttribute('data-wikilink') ?? '' }),
    },
  ],
  toDOM: node => ['span', { 'data-wikilink': node.attrs.value, class: 'wikilink' }, `[[${node.attrs.value}]]`],
  parseMarkdown: {
    match: node => node.type === 'wikiLink',
    runner: (state, node, type) => {
      state.addNode(type, { value: (node as MdNode).value ?? '' });
    },
  },
  toMarkdown: {
    match: node => node.type.name === 'wiki_link',
    runner: (state, node) => {
      state.addNode('wikiLink', undefined, node.attrs.value as string);
    },
  },
}));

// 边打字边转:输入到 `]]` 收尾时,把 `[[...]]` 整段替换为节点(避免当次新输入被转义)。
const wikiLinkInputRule = $inputRule(
  ctx =>
    new InputRule(/\[\[([^\]\n]+)\]\]$/, (state, match, start, end) => {
      const value = match[1];
      if (!value) return null;
      return state.tr.replaceRangeWith(start, end, wikiLinkNode.type(ctx).create({ value }));
    }),
);

/** 双链插件三件套(remark + node + inputRule),`crepe.editor.use(wikiLink)` 注入。 */
export const wikiLink = [wikiLinkRemark, wikiLinkNode, wikiLinkInputRule].flat();
