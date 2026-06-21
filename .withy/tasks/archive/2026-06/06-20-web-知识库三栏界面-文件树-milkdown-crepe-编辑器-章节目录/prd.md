# Web 知识库三栏界面:文件树 + Milkdown/Crepe 编辑器 + 章节目录

## Goal

把 `@withy/app` 控制台里仅 8 行占位的「知识库」视图(`[project]/knowledge`)做成可用的知识库工作台:浏览项目 `.withy/knowledge/wiki/` 下的文件夹与文档、以类 Typora 的所见即所得方式编辑正文、查看文档章节目录、对文档/文件夹做增删改、并能查看整库 `[[wikilink]]` 关系图。让用户在 Web 端直接维护知识库,而不必回到命令行或手工编辑文件。

## Confirmed Facts

- 知识库视图当前是占位:`packages/app/src/appTemplates/Knowledge/index.tsx` 仅渲染 `EmptyState`;路由 `packages/app/src/app/[project]/knowledge/page.tsx` 已挂载该模板;顶栏已有 knowledge tab(`packages/app/src/constants/views.ts:VIEW_ITEMS`)。
- 数据源在 `.withy/knowledge/wiki/`,按子目录组织(`design/`、`product/`、`guides/`…),每篇为 frontmatter + 正文;每个有页的目录有**自动生成**的 `index.md`(无 frontmatter,首行 `GENERATED_MARKER`);`knowledge/index.md`、`log.md`、`sources/` 在 `wiki/` 之外。
- core 读取面已具备:`listKnowledgeFiles(scope)` 返回 wiki 下原始文件(relPath,跳过 index.md)、`readKnowledgeSource(scope, id)`、`listKnowledgePages(scope)`、`readKnowledgeEntry(scope, id)`、`deriveKnowledgeGraph(scope)`、`rebuildKnowledgeIndexes(scope)`、`lintKnowledge(scope)`。导出见 `packages/core/src/index.ts:96-167`。
- id 解析规则:`id = frontmatter.id ?? 文件名`(`knowledge.ts` entryFromRaw/parsePage)。`updated`、frontmatter 里的 `scope` 字段 **core 均不消费**(`scope` 由所在 scope 推导,`updated` 不进任何视图/索引/lint)。`kind`/`summary`/`tags`/`inject`/`injectByDefault` 均可选(inject 默认 index)。
- frontmatter 解析器为极简自研、有损(`parseFrontmatter`,仅认 `key: scalar`/`key: [a,b]`,不支持多行/嵌套),因此保存正文必须按文本原样保留 frontmatter 整块,不能经解析器往返重写。
- 索引构建只从「有页的目录」派生(`buildKnowledgeIndexes`):空文件夹不产生 index.md;`listKnowledgeFiles` 只列文件;`rebuildKnowledgeIndexes` 只写不删(删掉某目录最后一页会残留孤儿 index.md)。
- 正文 `[[id]]`/`[[id|alias]]` 由 `extractLinks` 抽取,是关系图与 lint 的命脉。
- core **写入面不完整**:仅 `writeKnowledgeFile(scope, relPath, content)`,无 delete/rename 原语,无「带 frontmatter 建新页」helper。底层 fs 能力在 `packages/core/src/utils/fs.ts`(mkdir、rename)与 `store.ts`(rmSync)。
- app↔core 范式:读取经 Server Component → `server/dashboard.ts` → `@withy/core`;写入经 `/api/**`(`runtime='nodejs'`)→ core;浏览器不碰 fs。
- 实时刷新:`server/watcher.ts` 用 chokidar 监听**整个 `.withy`**(depth 4,仅排除 tasks/archive),`/api/events` SSE 推 `task-updated`,`RealtimeRefresher` 收到即 `router.refresh()`;**事件只带 `{project}`,不带变更路径**。知识库写盘会触发全局 refresh。
- 技术栈:Next.js 16(App Router)、React 19、Tailwind 4、自定义设计 token(无 shadcn/radix);已依赖 `@xyflow/react`(可复用于关系图);当前无任何 markdown/编辑器依赖。

## Requirements

### 布局与导航
- 知识库页在现有 `MainLayout` 内呈现三栏:左=文件树,中=文档正文(可编辑),右=章节目录。
- 页内提供「文档 / 关系图」模式切换(组件内部状态,不写入 URL);关系图模式下主区切换为整库关系图;每次进入知识库默认处于文档视图。

### 文件树(左栏)
- 递归展示项目 `wiki/` 下的文件夹与 `.md` 文件,节点标签为文件名(目录名 / 去 `.md` 的文件名);**空文件夹也要显示**。
- 可展开/折叠目录、点击选中文件。
- 自动生成的 `index.md` 在树中标记为只读(可查看,不可编辑)。
- 提供文件操作入口(右键菜单或按钮):新建页、新建文件夹、重命名、删除。
- 不展示 `sources/`、`knowledge/index.md`、`log.md`(范围限定 `wiki/`)。

### 文档编辑(中栏)
- 选中可编辑页时,以所见即所得方式渲染并编辑**正文**:输入 markdown 语法 + 空格自动转格式(`# `→标题、`- `/`1. `→列表、`> `→引用、```` ``` ````→代码块、`**` 等行内标记),交互体感类 Typora。
- 只编辑正文,**frontmatter 逐字保留**(按文本原样保留整块,不经解析器往返);保存时仅替换正文段,并把 `updated` 行更新/插入为当天(纯人类元数据,core 不消费)。
- 正文中的 `[[id]]`/`[[id|alias]]` 必须逐字保留,不被编辑器序列化破坏。
- 编辑采用**防抖自动保存**(约 1s),并显示保存状态(编辑中/保存中/已保存);仅在正文相对载入基线**确有变更**时才保存(避免编辑器初始重排导致空写);自动保存不得打断正在进行的输入(光标不跳、不丢字)。
- `index.md` 选中时为只读渲染,不进入编辑态。

### 章节目录(右栏)
- 由当前文档标题(`#`~`####`,跳过代码块内 `#`)生成大纲;点击跳转到对应标题;随正文滚动高亮当前章节。
- 文档标题少于 2 个时可不展示 TOC。

### 增删改(经 core)
- 新建页:输入名称(同时作为文件名 slug 与初始 title)→ 在当前选中目录下生成最小 frontmatter(`id`=slug、`title`;另按约定写入装饰性 `scope`/`updated`,core 不消费)的空页 → 重建并清理受影响 `index.md` → 打开新页进入编辑;slug 与全库已有页 id 冲突则报错。
- 新建文件夹:在当前目录下创建子目录(允许空目录,树中可见)。
- 重命名/移动:重命名文件名或文件夹路径(简单移动,不编辑 frontmatter/title);不自动改写别处 `[[link]]`;文件名派生 id 的页改名会改 id,产生的断链由 lint/关系图暴露(决策 A);重命名到已存在路径则报错。
- 删除:删除文件或文件夹(目录递归),需二次确认;不自动清理别处引用。
- 结构性写操作(新建页/建夹/重命名/删除)完成后重建并清理 `index.md`(重建 + 删除孤儿生成索引,以 `GENERATED_MARKER` 识别);纯正文保存不改 `index.md`、不触发重建。

### 关系图(中区,关系图模式)
- 展示**项目 scope** 的 `[[wikilink]]` 关系图(`deriveKnowledgeGraph(scope)`),断链边标红。
- 进入关系图模式时按需取最新数据,反映刚保存的链接变化。
- 点击节点切回「文档」模式并打开对应文档。

### 一致性与安全
- 所有 `.withy` 读写只经 core;浏览器不直接碰 fs。
- 所有来自客户端的相对路径入参(读与写)必须校验限制在 `wiki/` 内(拒绝 `..`、绝对路径、越界),防目录穿越。
- 知识库自身写盘触发的 SSE 刷新不得打断当前编辑(echo 抑制 + 编辑器按 relPath keyed 非受控兜底)。

## Acceptance Criteria

- [ ] 进入 `[project]/knowledge` 显示三栏、默认文档视图;左树正确呈现 `wiki/` 下真实的文件夹/文件层级(标签为文件名),且不出现 `sources/`、`log.md`、根 `index.md`。
- [ ] 新建一个空文件夹后,该空文件夹立即在左树可见。
- [ ] 点击一篇可编辑页,中栏以 WYSIWYG 渲染其正文;在空行输入 `# ` 后空格即变为一级标题,`- ` 后空格即变为无序列表项。
- [ ] 编辑正文后约 1s 自动保存;磁盘文件正文更新、frontmatter 整块逐字不变(含未知字段)、`updated` 为当天;正文中的 `[[link]]` 原样保留;保存过程中继续打字不丢字、光标不跳;打开未改动的文件不产生空写。
- [ ] 选中某目录的 `index.md` 时为只读、无法进入编辑态。
- [ ] 右栏 TOC 反映当前文档标题层级;点击条目跳到对应标题;滚动正文时当前章节高亮随之变化。
- [ ] 新建页:输入名称后在选中目录生成对应 slug 的 `.md`(含 `id`/`title`),其所在目录 `index.md` 被重建以包含新页,并自动打开新页;slug 与已有页 id 冲突时报错且不写盘。
- [ ] 新建文件夹、重命名、删除(文件与文件夹)均生效于磁盘,且操作后相关 `index.md` 与树视图一致;删除某目录最后一页后该目录的孤儿 `index.md` 被清理;删除有二次确认。
- [ ] 重命名/删除一篇被别处 `[[link]]` 引用的页后,关系图中对应边标红(断链被暴露,而非自动改写)。
- [ ] 切到「关系图」模式显示项目 scope 关系图;点击一个节点回到「文档」模式并打开该文档;每次进入知识库默认处于文档视图。
- [ ] 客户端传入越界路径(含 `..` 或指向 `wiki/` 外)时,读与写操作均被 core 拒绝并返回错误,不读不写盘。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)通过;`@withy/core` 与 `@withy/app` 各自 `build` 通过;新增 core 函数有 vitest 覆盖(frontmatter 逐字保留含未知字段、`[[link]]` 保留、`updated` 置当天、新建页 slug/最小 frontmatter/全库 id 冲突报错、建夹、文件与目录的重命名/删除、删除后孤儿 index 清理、`assertInsideWiki` 拒绝越界)。

## Out of Scope

- 重命名/删除时自动改写或清理别处 `[[wikilink]]`(本版交给 lint/关系图暴露)。
- 编辑页面 `title` 或其它 frontmatter 字段(本版仅编辑正文;新建时输入的名称即初始 title)。
- 全局 scope 知识库的展示与编辑(本版仅项目 `wiki/`)。
- `sources/` 原始源的展示与编辑、`log.md` 的展示。
- 关系图模式下的编辑(关系图为只读导航)。
- 全文搜索、版本历史/diff、多人协同实时编辑、图片/附件上传管理。
- 把关系图做成独立顶栏 tab 或独立路由(本版为页内模式);模式/选中文件写入 URL 或深链(本版用组件内部状态)。

## Open Questions

- None.
