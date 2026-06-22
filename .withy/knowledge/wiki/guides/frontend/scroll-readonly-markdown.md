---
id: scroll-readonly-markdown
title: '滚动条策略与只读 Markdown 展示组件'
scope: project
kind: spec
tags: [guide, frontend, scroll, markdown, overlayscrollbars, milkdown]
summary: 'OverlayScrollbars Scroller 悬浮滚动消重排;markdown 正文区刻意保留原生 .doc-scroll(否则破坏 TOC 的 IntersectionObserver root/scrollIntoView);只读渲染面 MarkdownView + 章节目录 DocOutline + milkdown-tokens.css 为共享展示三件套。'
inject: index
injectByDefault: false
updated: 2026-06-22
---

# 滚动条策略与只读 Markdown 展示组件

> 适用:`@withy/app` 看板详情/弹窗/知识库。关联实现层与编辑器陷阱见 [[milkdown-wikilink]]、页面/数据流见 [[web]]、视觉 token 见 [[visual-design]]。

## 滚动条:两套并存,刻意不统一

dashboard 有两类滚动区,**不要用同一种滚动条**:

- **容器/列表区**(详情 aside、看板三列、归档列表、弹窗窄栏):用 `components/Scroller.tsx` 封装的
  `OverlayScrollbarsComponent`。滚动条悬浮覆盖、**不占布局宽度**,可滚/不可滚切换不横向位移;
  `autoHide:'leave'` 默认隐藏、hover/滚动才显示;`overflow.x:'hidden'`;`defer`(SSR 边界,空闲再初始化)。
  主题依 `useTheme` 取 `os-theme-dark`(亮底深色条)/`os-theme-light`(墨底浅色条)。
  CSS 在 `layout.tsx` 引一次 `overlayscrollbars/overlayscrollbars.css`。
  用法:外层容器只管布局(宽/边框/底色,**不滚动**),内层 `<Scroller className="min-h-0 flex-1">` 作滚动视口。
- **Markdown 正文区**(只读渲染面 / 知识库编辑器):**保留原生 `overflow` + globals.css 的 `.doc-scroll` 细滚动条工具类**
  (细、track 透明、thumb 半透、hover 才明显),滚动容器挂 `data-doc-scroll`。
  **两个 markdown 入口都要同时挂 `.doc-scroll` 类**(`MarkdownView.tsx` 与 `MarkdownEditor.tsx`)——
  早期 `MarkdownEditor` 只挂了 `data-doc-scroll` 漏了类名,导致知识库编辑器退回浏览器默认条、与弹窗不一致。
  `.doc-scroll` 的 thumb 已**视觉对齐** Scroller(OverlayScrollbars os-theme):10px 圆角、2px 内缩
  (透明 border + `background-clip:padding-box`)、亮主题深色条 `rgba(0,0,0,.44→.55)` / 暗主题浅色条 `rgba(255,255,255,...)`。
  即实现仍两套(原生 vs OverlayScrollbars),但**观感统一**;markdown 仍是原生滚动元素(下述约束)。

### 为什么 markdown 正文不能套 OverlayScrollbars(踩坑根因)

`DocOutline`(章节目录)用 `IntersectionObserver({ root: 滚动容器 })` 做滚动高亮、用 `scrollIntoView` 做点击跳转,
靠 `[data-doc-scroll]` 选中**真实滚动元素**。OverlayScrollbars 会把内容搬进它自建的 viewport 子元素并接管滚动,
真实滚动元素不再是挂 `data-doc-scroll` 的那个 → IntersectionObserver root 与 scrollIntoView 双双失效、大纲不再高亮/跳转。
故 markdown 正文区**必须保持原生滚动**。这与 [[milkdown-wikilink]] 记的「TOC 锚点用 Milkdown 自带 heading id」是同一处 TOC 的两条约束。

## 只读 Markdown 展示三件套(看板弹窗与知识库共用)

展示 UI 共享、数据/编辑各自持有(对齐用户决策:公共组件只负责展示):

- `components/markdown/MarkdownView.tsx`:Crepe `defaultValue + setReadonly(true)` 只读渲染面,无保存逻辑;
  滚动容器 `data-doc-scroll .doc-scroll`(原生滚动,见上)。Crepe 触碰 document,**消费方须 `dynamic(ssr:false)` 导入**。
- `components/markdown/DocOutline.tsx`:从渲染出的 `.milkdown :is(h1..h4)` DOM 扫标题成大纲,锚点用 Milkdown heading id;
  入参 `docKey`(变更即重扫);全局查 `[data-doc-scroll]`,**前提:同一时刻只有一个只读渲染实例**
  (看板 `ViewDetail` 不挂 Crepe、仅弹窗挂;知识库为独立页)。
- `components/markdown/milkdown-tokens.css`:Crepe 主题 → 砚墨 token 的映射,**所有 Crepe 实例共用一份**
  (知识库可编辑编辑器 + 任务产物只读渲染都 import 它),勿在各处重复。

切换文档时按 `name`/`relPath` 给渲染面 remount(React key),避免显示上一篇。

## Crepe 暗色 token 陷阱(milkdown-tokens.css 覆盖)

Crepe `frame` 主题只把一部分颜色暴露成 `--crepe-color-*` 变量,几个关键展示元素在砚墨墨底下偏浅/糊边,
**仅靠映射现有变量不够**,需在 `milkdown-tokens.css` 定向覆盖(对齐 [[visual-design]] token):

- **内联 code 浅灰底**:`.ProseMirror code` 背景用 `--crepe-color-inline-area`,该变量 frame 默认 `#cacaca`、
  且**未随主题切换**——必须显式映射(→ `--paper-sunken`)或覆盖。覆盖时用 `.milkdown .ProseMirror :not(pre) > code`
  排除 fenced 的 `pre code`(沉底纸 `--paper-sunken` + `--line` 细边 + 赤陶字)。
- **表格线几乎不可见**:Crepe `table.css` 的 `th/td` 边框是 `color-mix(--crepe-color-outline, transparent 80%)`,
  即 `--line` 仅 20% 不透明度。覆盖 `.milkdown-table-block :is(th,td)` 为 `1px solid var(--line)`(全不透明,对齐 §6.6 表格用 border-line)。
- **fenced 代码块融进背景**:`.milkdown-code-block` 默认 `bg=--crepe-color-surface(=--paper)`、**无边框无圆角**,
  与正文 paper 同色 → 没边界。覆盖为单层沉底 `--bg`(比 paper 更沉)+ `--line-strong` 边框 + 圆角,
  内层 `.cm-editor`/`.cm-gutters` 置 `transparent` 继承,避免外层+内层双层同色发平。
- **代码块用 CodeMirror One Dark、不随主题**:Crepe 给 CodeMirror 内置 One Dark 主题,**写死**文字 `#abb2bf`(浅灰)、
  当前行 gutter `#2c313a`(暗块)、activeLine 淡蓝带、行号 `#7d8799`——亮色主题下浅灰字看不清、首行是突兀暗块。
  覆盖 `.cm-content`/`.cm-line` 文字为 `--ink`、`.cm-gutters`/`.cm-lineNumbers .cm-gutterElement` 为 `--ink-faint`、
  `.cm-activeLine`/`.cm-activeLineGutter` 背景 `transparent`(只读展示无当前行概念)。语法高亮 token 的 `span` 各自带色,不受影响。

`.doc-scroll` 工具类要挂在**所有原生滚动的 markdown 区**,除两个正文入口外,**DocOutline 的 `<nav>` 也要挂**
(右侧章节目录可滚动,早期漏挂退回默认条)。

注:fenced 代码块在只读与可编辑下都是 CodeMirror(`.milkdown-code-block`),非 `<pre><code>`;
覆盖只动静态展示,不碰编辑器选中态/工具栏。验收靠 agent-browser 亮/暗双主题截图(headless 不绘制自定义 webkit 滚动条,属已知限制)。

## 关联页

- [[milkdown-wikilink]] · [[web]] · [[visual-design]] · [[react-patterns]] · [[nextjs-architecture]]
