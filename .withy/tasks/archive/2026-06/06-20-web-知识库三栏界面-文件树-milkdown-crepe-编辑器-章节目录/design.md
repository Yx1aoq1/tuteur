# Design: Web 知识库三栏界面

## Summary

在 `@withy/app` 现有「Server Component 读 + `/api` 写 + core 独占 `.withy`」范式上,新增项目作用域的知识库工作台。三栏布局复用 `MainLayout` 主内容区;中栏编辑器选用 **Milkdown + Crepe**(基于 ProseMirror 的开箱即用 WYSIWYG,内置 markdown 输入规则,直接满足类 Typora 交互);关系图复用已依赖的 `@xyflow/react`。写入面在 core 补齐 CRUD 领域函数,结构性操作内部统一「重建 + 清理 index.md」,正文保存只写文件不动 index;所有按 relPath 寻址的读写都先做 `wiki/` 越界校验。保持 withy「core 独占写 + 确定性 index bookkeeping + lint 暴露问题」的既有模型。

选择 Crepe(而非 TipTap / Milkdown 核心):与参考实现 MindOS 一致、输入规则与 markdown 序列化开箱即用、落地最快;代价是 Crepe 自带主题 CSS 需一层 overrides 贴合设计 token,且需验证其 markdown 往返不破坏 `[[wikilink]]`(见 R5)。

## Architecture and Boundaries

**core(`@withy/core`)—— 唯一 `.withy` 写入与领域逻辑层**
- `store.ts` 补低层 fs 原语:按 wiki relPath 读单文件、删除(文件/目录递归)、移动、遍历 wiki 目录树(含空目录);复用 `utils/fs.ts` rename/mkdir 与 rmSync。
- `knowledge.ts` 补领域函数:`saveKnowledgePageBody`(只写文件)、`createKnowledgePage` / `createKnowledgeFolder` / `renameKnowledgeEntry` / `deleteKnowledgeEntry`(结构性,内部「校验 + 写 + 重建并清理 index」)。
- `assertInsideWiki` 越界校验单点收口(读写共用)。
- 读取复用 `listKnowledgeFiles` / `deriveKnowledgeGraph` / `lintKnowledge`。

**app 服务端读取层(`server/knowledge.ts`,新增)—— Server Component / route handler 用**
- `getKnowledgeTree(scope)` → 树视图模型;`getKnowledgeFile(scope, relPath)` → 拆 frontmatter/body + readonly 标记;`getKnowledgeGraph(scope)` → xyflow 友好 nodes/edges。只读,仅服务端导入。

**app API 层(`/api/knowledge/**`,新增)**
- 写:`save` / `create-page` / `create-folder` / `rename` / `delete`(POST,`runtime='nodejs'`)。
- 读:`file`(GET)按需取单文件正文,`graph`(GET)取最新关系图。均经 `resolveScopeByName` 解析 scope → core/读取层;校验落在 core,route 仅入参收窄与错误透传(core 抛错 → 400/409/422)。

**app 客户端 UI(`appTemplates/Knowledge` + `components/Knowledge/**`)**
- 三栏壳、文件树、Crepe 编辑器、TOC、xyflow 关系图,均为 client component。Server Component 负责首屏读 tree(+ 默认空选中)并下传。

**横切:`RealtimeRefresher` echo 抑制** —— 本地知识库保存后的短窗口跳过 `router.refresh()`。

边界:本版只触及 knowledge 相关 core 函数与 app 知识库视图,不改 board/workflow/context、不改 watcher 监听范围与既有 `rebuildKnowledgeIndexes`/CLI 契约、不动顶栏视图模型。

## Components

### core 新增

- `readKnowledgeFile(scope, relPath): string | null` — 按 wiki 下 relPath 读原始内容(按路径寻址,区别于按 id 的 `readKnowledgeSource`)。
- `listKnowledgeDirTree(scope)`(或等价)— 遍历 `wiki/` 真实目录树返回 dirs+files(含空目录、标出 index.md),供树视图;不依赖「按文件折叠」以免空目录丢失。
- `saveKnowledgePageBody(scope, relPath, body): void` — 读原文件 → 以第二个 `---` 为界**逐字保留 frontmatter 文本块** → 用新 body 替换正文段 → 就地更新/插入 `updated:` 为当天 → 写回。**不重建 index**(正文不影响 index;title/summary 等 frontmatter 不经本函数变更)。对 index.md 调用即报错。
- `createKnowledgePage(scope, dirRelPath, name): string` — slugify(name) 作文件名;若该 slug 与全库任一页 id 冲突则报错;生成最小 frontmatter(`id`=slug、`title`=name,装饰性 `scope`/`updated`)+ 空 body → 写入 → 重建并清理 index;返回新 relPath。
- `createKnowledgeFolder(scope, dirRelPath, name): string` — mkdir(允许空目录);返回新目录 relPath(空目录不产生 index,由树的目录遍历显示)。
- `renameKnowledgeEntry(scope, fromRelPath, toRelPath): void` — 目标已存在则报错;文件或目录移动(`utils/fs` rename)→ 重建并清理 index。不改写入边链接、不动 frontmatter。
- `deleteKnowledgeEntry(scope, relPath): void` — 删除文件或目录(目录递归)→ 重建并清理 index。
- 重建并清理 index 的内部步骤:`rebuildKnowledgeIndexes` 写出当前应有的 index 后,扫描 `wiki/` 下首行带 `GENERATED_MARKER` 但不在应有集合中的 `index.md` 并删除(只删自己生成的,安全)。封装为 core 内部 helper,结构性写函数统一调用;不修改既有 `rebuildKnowledgeIndexes` 的对外契约。
- `assertInsideWiki(relPath)`(内部)— 规范化并拒绝 `..`/绝对路径/越出 `wiki/`;所有按 relPath 的读写入口调用。

### app 服务端读取层 `server/knowledge.ts`

- `getKnowledgeTree(scope)` → `KnowledgeTreeNode[]`(嵌套 `{ name, relPath, type:'file'|'dir', readonly?, children? }`),由 core 目录遍历构造,含空目录,index.md 标 `readonly`。
- `getKnowledgeFile(scope, relPath)` → `{ relPath, readonly, body, raw }`(只编辑 body;frontmatter 不在编辑面,仅 core 持有)。relPath 经 `assertInsideWiki`。
- `getKnowledgeGraph(scope)` → `{ nodes, edges }`,由 `deriveKnowledgeGraph` 适配 xyflow;edge 带 `broken`。

### app 客户端组件 `components/Knowledge/`

- `KnowledgeWorkspace`(client 壳)— 接收首屏 tree 数据;内部 state 管理「当前选中 relPath」与「文档/关系图模式」(默认文档、均不写 URL);组三栏。
- `FileTree` — 受控递归树:展开/折叠、选中高亮、index.md 锁标记、操作菜单触发新建/重命名/删除对话框(接 API)。知识树规模小,普通递归渲染,**不引入虚拟滚动**(不加 `react-virtuoso`)。
- `MarkdownEditor`(Crepe 封装)— `'use client'` + 动态导入(client-only);`MilkdownProvider` + `useEditor` 初始化 `Crepe({ root, defaultValue: body })`;按 `relPath` 作 React `key`、**非受控**(defaultValue 仅初始);`markdownUpdated` → 与「载入基线」diff,确有变更才防抖 1s 调 save API,并展示保存状态;只读页只读渲染。加 `milkdown-overrides.css` 贴合设计 token。
- `TableOfContents` — 从当前 body 解析标题(跳代码块)+ `github-slugger` 锚点;`IntersectionObserver` 观察编辑器渲染出的 heading DOM 做滚动高亮;点击平滑滚动。
- `KnowledgeGraph`(xyflow)— 进入关系图模式时 `GET /api/knowledge/graph` 取最新数据渲染;broken 边标红;`onNodeClick` → 切回文档模式并打开该节点对应 relPath。
- 操作对话框 — 复用 `Layout/common` 的对话框范式(参考 `DeleteProjectDialog`)做新建/重命名/删除确认。

### 横切

- `RealtimeRefresher` 增强 — 引入「最近本地知识库写入时间戳」共享信号(模块级);收到 `task-updated` 时若距上次本地保存 < 抑制窗口(约 2s,覆盖 200ms watcher 去抖 + 结构操作的 index 写入串)则跳过该次 `router.refresh()`;save/CRUD 成功后打戳。

## Data Flow and Contracts

**首屏读取**:`[project]/knowledge/page.tsx`(Server)→ `resolveScopeByName(project)` → `getKnowledgeTree` → 下传 `KnowledgeWorkspace`。无 scope 渲染空态;进入默认文档模式、无选中。

**切换文件**:client 内部 state 记录 relPath(不写 URL)→ `GET /api/knowledge/file?project=&relPath=` 取 body/readonly。仅刷新中栏与右栏。

**编辑保存**:Crepe `markdownUpdated` → 与基线 diff → 确有变更则防抖 → `POST /api/knowledge/save { project, relPath, body }` → core `saveKnowledgePageBody`(校验 + 逐字保留 frontmatter + 换 body + 置 updated + 写,**不重建 index**)→ `{ ok }`;client 标「已保存」并打本地写入时间戳。

**结构性 CRUD**:对话框确认 → `POST /api/knowledge/{create-page|create-folder|rename|delete}` → core 对应函数(校验 + 写 + 重建并清理 index)→ `{ ok, relPath? }`;成功后 client `router.refresh()` 重读树(并打时间戳),新建页把选中指向新页;删除当前文件/其所在目录则清空中栏选中。

**关系图**:进入关系图模式 → `GET /api/knowledge/graph?project=` → `deriveKnowledgeGraph` 适配 → xyflow;节点 id = 页 id,edge 带 `broken`。

**契约与不变量**:
- relPath 一律相对 `wiki/`、posix;所有按 relPath 的读写入口 `assertInsideWiki`。
- frontmatter 由 core 拥有:本工具只读取 body 供编辑、只提交 body;保存逐字保留 frontmatter 文本,仅 `updated` 行就地更新。
- index.md 永远只读,且不可经 save/rename/delete 单独操作(core 拒绝);其内容只由「重建并清理」确定性产出。
- 结构性写后 index 集合 = `buildKnowledgeIndexes` 的当前结果,孤儿生成 index 被清理。正文保存不改 index。

## Error Handling and Edge Cases

- 越界路径(`..`/绝对/出 `wiki/`):core 抛错,route 返回 400/422,不读不写。
- 新建页 slug 与全库已有页 id 冲突:报错并提示改名(不静默加序号),不写盘。
- rename 目标路径已存在:报错(不覆盖)。
- 对 index.md 调 save/rename/delete:core 拒绝(index.md 为生成物)。
- 删除非空目录:递归删除 + 二次确认;删除当前正编辑文件或其所在目录后,中栏回空态、清选中。
- 删除某目录最后一页:重建后该目录无 index,清理步骤删除其残留孤儿 index.md。
- frontmatter 缺失/损坏的页:`saveKnowledgePageBody` 容错——无 frontmatter 块时直接写 body(可补最小 `updated`),不抛错。
- 自动保存竞态:同文件以最后一次 body 为准(防抖串行);载入基线相同则不写(防初始重排空写);保存失败保留脏标记并提示,不吞错。
- Crepe 与 React19/Next16 兼容或 `[[link]]` 往返失真:首要风险早验(R1/R5),失败按回退路径处理。
- 空 `wiki/`:树空态 + 提供「新建页」入口。

## Compatibility and Migration

- 不改 `.withy/knowledge` 磁盘格式,不迁移数据;新 core 函数与既有读取/lint/index 模型兼容,且不改 `rebuildKnowledgeIndexes` 对外契约(清理逻辑封装在新 helper 内)。
- 新增 app 依赖:`@milkdown/crepe`、`@milkdown/kit`、`@milkdown/react`、`github-slugger`(图复用已有 `@xyflow/react`;只读渲染复用 Crepe 只读态,不加 react-markdown)。遵循模块规范:barrel 显式具名再导出、值/类型分组、import 成员按长度排序。
- 不改 watcher 监听范围与 `/api/events`;echo 抑制只在 `RealtimeRefresher` 客户端侧增量。
- i18n:新增文案走 next-intl(en + zh),命名与现有 `empty`/`views` 一致。

## Testing Strategy

- core(vitest,沿用 `packages/core` 测试范式):`saveKnowledgePageBody`(frontmatter 逐字保留含未知字段、`[[link]]` 保留、`updated` 置当天、不重建 index、对 index.md 报错)、`createKnowledgePage`(slug、最小 frontmatter、全库 id 冲突报错)、`createKnowledgeFolder`(空目录)、`renameKnowledgeEntry`(文件/目录、目标已存在报错)、`deleteKnowledgeEntry`(文件/目录、孤儿 index 清理)、`assertInsideWiki`(拒绝 `..`/绝对/越界)。
- 类型/规范:`pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/core` 与 `@withy/app` `build`。
- UI 手动验收(按全局规范用 `agent-browser`,不用 chrome-devtools;先 `set viewport 1440 900`):三栏渲染、空文件夹可见、类 Typora 输入转换、自动保存不丢字且不空写、TOC 滚动高亮、四类 CRUD、删除清理孤儿 index、关系图节点跳转与断链红边、默认文档视图。

## Risks and Rollback

- **R1 Crepe 在 React19/Next16 下的兼容与 SSR**(最高):需 client-only + 动态导入。缓解:阶段 0 最小 spike(挂一个 Crepe 实例并 `pnpm --filter @withy/app build` 通过)再继续;失败按回退路径换编辑器。
- **R5 Crepe markdown 往返破坏 `[[wikilink]]`**(高):Milkdown 默认不识别 `[[...]]`,序列化可能转义/丢失,会静默损坏关系图。缓解:阶段 0 spike 同时验证「输入/载入含 `[[x]]` 的正文 → 保存 → 磁盘 `[[x]]` 逐字不变」;若失真则加 Milkdown 自定义节点/inputrule 或保留原文映射,仍不行则回退编辑器选型(回 brainstorm)。
- **R2 Crepe 主题 CSS 与设计 token 冲突**:`milkdown-overrides.css` 把 Crepe 变量映射到 canvas/paper/ink,作用域限知识库区。
- **R3 echo 抑制误伤外部并发改动**:窗口内可能漏一次外部刷新。单用户控制台可接受,窗口取最小(~2s),手动操作仍刷新。
- **R4 写盘 + 重建/清理非事务**:极端失败可能短暂不一致;重建幂等,后续任意写或手动重建自愈;清理只删带 `GENERATED_MARKER` 的文件,不误伤手写内容。
- 回滚:功能集中在新增 core knowledge 写函数 + 内部清理 helper、`server/knowledge.ts`、`/api/knowledge/**`、`appTemplates/Knowledge` 与 `components/Knowledge`、`RealtimeRefresher` 增量、4 个新依赖;移除并把 `KnowledgePage` 还原为 `EmptyState` 即恢复原状,无数据副作用。
