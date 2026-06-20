# Implementation Plan

## 阶段 0:风险前置(编辑器可行性 spike)

- [x] 在 `@withy/app` 装入 `@milkdown/crepe`、`@milkdown/kit`、`@milkdown/react`、`github-slugger`,并在知识库页临时挂一个最小 Crepe 实例(client-only / 动态导入) — Verify: `pnpm --filter @withy/app build` 通过(✓ compiled + TS + static gen 全绿;`/[project]/knowledge` 路由正常产出)
- [x] 在该 spike 验证 `[[wikilink]]` 往返保真 — 结论:**裸 Crepe 会破坏**。Milkdown 经 `mdast-util-to-markdown@2` 序列化,把 `[[foo]]` 转义成 `\[\[foo]]`(两个 `[` 间插入 `\`,连 `extractLinks` 正则都匹配不到)。已在 lib 层证实。
- [x] R1 通过;R5 裸态失败 → 按 design R5 回退路径(**自定义节点/插件**,非回 brainstorm)处理 — 已证实修复方案:自定义 `wikiLink` mdast 节点 + 原样 `toMarkdown` handler(handler 输出绕过转义),`toMarkdown` 实测产出 `[[foo]]` 与 `[[foo|别名]]` 逐字不变。Crepe 经 `crepe.editor.use()` 可注入插件。spike 实例已移除。
  - 备注:本阶段未跑 agent-browser(ssr:false 动态导入结构性消除 SSR;build 已覆盖编译/类型/静态产出)。运行时挂载的浏览器验收并入阶段 4 端到端环节。
  - 采用方案:**自研 Milkdown 插件(文本切分 → `wikiLink` 节点 → 原样 handler + inputRule)**,不引第三方 wikilink 库(`mdast-util-wiki-link@0.1` 仅兼容 to-markdown v1;`@portaljs/remark-wiki-link` 产出 link 节点非 `[[]]`)。

## 阶段 1:core 写入面与校验(领域逻辑 + 测试先行)

- [x] 在 `core/src/store.ts` 补低层 fs 原语:`readWikiFile`/`writeWikiFile`/`wikiEntryType`/`makeWikiDir`/`moveWikiEntry`/`removeWikiEntry`/`listWikiEntries`(含空目录、含 index.md);复用 `utils` 的 ensureDir/moveDir/isDirectory 与 rmSync — Verify: `pnpm --filter @withy/core typecheck` ✓
- [x] 在 `core/src/knowledge.ts` 实现 `assertInsideWiki`、`saveKnowledgePageBody`、`readKnowledgePageContent`、`createKnowledgePage`、`createKnowledgeFolder`、`renameKnowledgeEntry`、`deleteKnowledgeEntry`、`KnowledgeError`,以及内部 `rebuildAndCleanIndexes`(重建 + 按 `GENERATED_MARKER` 删孤儿生成 index) — Verify: typecheck ✓
- [x] 在 `core/src/index.ts` 显式具名再导出新函数与类型(值/类型分组、长度降序) — Verify: eslint 0 warning ✓
- [x] vitest:`knowledge.test.ts` 18 用例(frontmatter 逐字保留含未知字段、`[[link]]` 保留、`updated` 当天、save 不重建 index、对 index.md/缺失页报错;slug/最小 frontmatter/全库 id 冲突;建空夹;文件/目录 rename + 目标存在报错;文件/目录 delete + 删最后一页清孤儿 index;`assertInsideWiki` 拒绝越界) — Verify: `pnpm --filter @withy/core test` 64 passed ✓
- [x] core 构建 — Verify: `pnpm --filter @withy/core build` ✓

## 阶段 2:app 服务端读取层

- [x] 新增 `app/src/server/knowledge.ts`:`getKnowledgeTree`(由 `listWikiEntries` 组装嵌套树、含空目录、index.md 标 readonly)、`getKnowledgeFile`(`readKnowledgePageContent`)、`getKnowledgeGraph`(`deriveKnowledgeGraph` 适配 xyflow + 断链幽灵节点);视图模型类型置 `types/knowledge.ts`(纯类型) — Verify: `pnpm --filter @withy/app typecheck` ✓
- [x] 单元覆盖树构造与 graph 适配的纯函数部分(`buildKnowledgeTree`/`adaptKnowledgeGraph`,新增 app vitest) — Verify: `vitest run` 2 passed ✓

## 阶段 3:app API(读 + 写)

- [x] 新增写 route `/api/knowledge/{save,create-page,create-folder,rename,delete}` 与读 `GET /api/knowledge/{file,graph}`(均 `runtime='nodejs'`):入参收窄 → `resolveProjectScope(?project=path)` → 调 core/读取层 → `{ ok, ... }`;`server/knowledgeApi.ts` 收口 scope/body/错误映射(冲突 409、守卫 400、意外 422) — Verify: typecheck + eslint ✓;curl 实测 file/graph/save/create-page/create-folder/rename/delete 各打一次,磁盘文件与 index.md 如预期变化(save 保 frontmatter+`[[link]]`、updated 当天;create 重建 index;rename 移动;delete 清孤儿 index) ✓
- [x] 越界路径与 index.md 写入的拒绝路径回归 — Verify: curl 传 `..`(读 file / 写 delete)→ 400;写 index.md(save/delete)→ 400;新建重名 id → 409;rename 目标已存在 → 409 ✓

## 阶段 4:客户端三栏与编辑器

- [x] 重写 `appTemplates/Knowledge/index.tsx` 为 Server 入口:解析 scope → 读 tree → 渲染 client `KnowledgeWorkspace`(默认文档模式、无选中);无 scope 渲染空态;路由 page.tsx 透传 params — Verify: agent-browser 打开 `/withy/knowledge` 显示三栏、默认文档视图、树为 design/guides/product(无 sources/log/根 index) ✓
- [x] 实现 `components/Knowledge/FileTree`:递归渲染(文件名标签、含空目录)、展开/折叠、选中高亮、index.md 🔒 锁标记、操作菜单触发对话框(新建页/建空夹/重命名/删除,接 API,删除二次确认) — Verify: agent-browser 展开目录、切文件、UI 新建页(磁盘最小 frontmatter)、UI 删除带二次确认(磁盘文件移除) ✓
- [x] 实现 `components/Knowledge/MarkdownEditor`(Crepe 封装)+ 自研 `wikilink` 插件 + `knowledgeEcho`:按 relPath keyed + 非受控 + 动态导入(ssr:false);markdownUpdated 与载入基线 diff,确有变更才防抖 1s 调 save + 保存状态;只读页只读;`milkdown-overrides.css` 贴 token — Verify: agent-browser 输入 `## `/`- ` 即转 h2/列表;编辑 1s 后磁盘更新且 **frontmatter 逐字不变、`[[foo]]`/`[[foo|别名]]` 逐字保留(未被转义)**、`updated` 当天;index.md 不可编辑(editable=false) ✓
- [x] 实现 `components/Knowledge/TableOfContents`:用 Milkdown 自带 heading id 作锚点(自注入 data-* 会被 ProseMirror 擦除)+ 轮询等待动态编辑器挂载 + IntersectionObserver 滚动高亮 + 点击平滑滚动 — Verify: agent-browser core.md 下 TOC 32 项、点击滚动到位(scrollTop 9582)、滚动高亮随章节变化 ✓

## 阶段 5:关系图与模式切换

- [x] 实现 `components/Knowledge/KnowledgeGraph`(复用 `@xyflow/react`):进入关系图模式 `GET /api/knowledge/graph` 取最新数据、确定性网格布局、broken 边标红+animated、missing 幽灵节点、`onNodeClick` 切回文档并打开对应文件 — Verify: agent-browser 切到关系图见图(11 节点/47 边);加断链页后见幽灵节点 + 1 条红 animated 边;点节点回文档并打开该页(cli → design/cli.md) ✓
- [x] 在 `KnowledgeWorkspace` 加「文档/关系图」模式切换,用组件内部 state(默认文档,不写 URL) — Verify: agent-browser 切换两模式正常;mode 为内部 state、重进默认回文档、URL 无新增参数 ✓

## 阶段 6:实时刷新 echo 抑制

- [x] 增强 `RealtimeRefresher`:引入 `@/lib/knowledgeEcho` 模块级时间戳(save/CRUD 成功后 `markLocalWrite`);收到 `task-updated` 时若在抑制窗口(2s)内则跳过 `router.refresh()` — Verify: agent-browser 连续输入整句(跨多个自动保存周期)磁盘逐字落盘、无丢字、编辑器不重挂;手动/外部改动仍触发刷新(窗口外) ✓

## 阶段 7:i18n 与整体校验

- [x] 补 next-intl 文案(en + zh)`knowledge` 命名空间:树操作、保存状态、模式切换、确认对话框、空态、TOC — Verify: en/zh 各 31 键、无缺键;agent-browser 切 EN 见 Document/Graph、切回中文正常 ✓
- [x] 全量校验三件套 — Verify: `pnpm typecheck`(core+cli+app)、`pnpm lint`(0 warning)、`pnpm test`(core 64 + app 2,新增 app vitest.config 排除 .next)、`@withy/core` 与 `@withy/app` build 全通过 ✓
- [x] 端到端手动验收(agent-browser,viewport 1440×900):三栏/默认文档、空夹可见(建夹即见)、`## `/`- ` 转格式、自动保存不丢字且 frontmatter+`[[link]]` 逐字保留、index.md 只读、TOC 滚动高亮、四类 CRUD、删除清孤儿 index、关系图节点跳转+断链红边 — Verify: 逐条通过(详见阶段 4/5 记录) ✓
