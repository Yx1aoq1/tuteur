# Design: 知识库三层结构(sources / wiki / user)+ web 文件树多层展示

## Summary

采用**通用根模型**:把「文件树 / CRUD / 路径守卫」从「`wiki/` 为根」泛化为「`knowledge/` 为根」。`wiki/` 是唯一机器托管的特殊层(frontmatter 页、`index.md` 自动重算、关系图、注入仍只作用于它);`sources/`、`user/` 以及将来任意顶层目录都是普通可浏览/可编辑文件夹,其页为无 frontmatter 的纯 `.md`、不触发 index/graph。代码**不枚举固定根名**,文件树扫 `knowledge/` 下现有顶层目录,有什么显示什么——项目库与全局库因此可各放各的顶层目录而无需为每个名字写代码。init 仅负责按 scope 预建初始目录(项目 `sources`+`wiki`,全局多 `user`)。

选它而非「硬编码 sources/wiki/user 三根」:三根硬编码要为每个根复制一遍 listing/CRUD/guard,且加 `rules`/`refs` 等就得改 core;通用根一次泛化,后续加目录零改动(对齐 karpathy「结构随领域自由扩」)。

## Architecture and Boundaries

改动按层:

- **core(@withy/core)** — 路径模型与读写层泛化。`store/knowledge.ts`、`knowledge/edit.ts`、`paths.ts`。index/graph/注入逻辑**不改**(它们各自解析 `wiki/`,只要 wiki 布局不变即不受影响)。
- **app(@withy/app)** — 服务端树读取改用通用 listing;图节点 relPath 对齐 knowledge-相对;FileTree/Workspace 的 relPath 语义随之变。`server/knowledge.ts`、`appTemplates/Knowledge/*`、`/api/knowledge/*` route。
- **cli(@withy/cli)** — `seedKnowledgeBase` 按 scope 分叉;`templates/knowledge/` 调整。
- **schema/模板** — `templates/common/skills/knowledge/SKILL.md`。
- **内容** — 当前 `.withy/knowledge/wiki/` 按新分类整理(纯 markdown 移动 + frontmatter)。

边界不变:除 `core/store/*` 外不碰盘;app 浏览器不碰 fs;index/图/注入仍是 wiki-only。

## Components

### core:通用根 listing 与路径

- `listKnowledgeEntries(scope): KnowledgeEntry[]` — 扫 `knowledge/` 根,返回**knowledge-相对** posix 路径的**所有顶层文件夹与文件**(含 `sources/`、`wiki/` 及根 `index.md`/`log.md`,含空目录)。跳过派生缓存 `graph.json`;生成物 `index.md`(任意层)与根 `log.md` 标 `readonly`。替代树构建的数据源(原 `listWikiEntries` 保留给 wiki 内部用途,不删)。
- `knowledgeEntryPath(scope, relPath) = resolve(knowledgeDir(scope), relPath)`;经守卫后用于读写。
- `assertInsideKnowledge(relPath)` — 复用现 `assertInsideWiki` 的校验(拒空串/绝对路径/盘符/任意 `..` 段),基准换成 `knowledge/`。
- `isWikiRelPath(relPath)` — `relPath === 'wiki' || relPath.startsWith('wiki/')`;CRUD 据此决定是否触发 index/graph 重算。

### core:CRUD(knowledge/edit.ts)

入参全改 knowledge-相对:

- **create-page**:目标目录在 `wiki/` 下 → 写最小 frontmatter 空页 + 重算 index(现行为);在非 wiki 目录 → **同样写最小 frontmatter 页**(id/title/updated),**不重算 index、不进 graph/注入**。统一格式的原因:`saveKnowledgePageBody` 逐字保留 frontmatter 块并就地置 `updated:`,无 frontmatter 的纯 md 存盘会坏;复用同一读写路径代码最少。wiki 与非 wiki 的唯一差别是**是否触发 index/graph/注入**,非文件格式。
- **create-folder / rename / delete**:knowledge-相对;仅当受影响路径 `isWikiRelPath` 时重算 index/graph,否则跳过。
- 保护生成物:根 `index.md`/`log.md`/`graph.json` 与任意 `index.md` 不可 rename/delete(沿用 readonly)。

### app:服务端与视图

- `getKnowledgeTree` 改用 `listKnowledgeEntries`;`buildKnowledgeTree` 本就按路径装树,无需改算法。
- `adaptKnowledgeGraph`:图节点可打开 `relPath` 由「`/wiki/` 之后段」改为「`wiki/` + 该段」,与树的 knowledge-相对一致,保证点图节点能打开同一文件。
- `getKnowledgeFile` 透传 knowledge-相对 relPath 给 `readKnowledgePageContent`。
- `FileTree`:渲染逻辑不变(已递归通用)。`readonly` 标记由 core 给。左上「新建页/夹」工具按钮默认目标目录从 `''` 改为 `'wiki'`(避免在 knowledge 根散落裸文件);各目录的节点菜单仍按所在目录建。

### cli:init

- `seedKnowledgeBase(withyDir, isGlobal, createdPaths)`:先镜像共享 `templates/knowledge/`(`sources/`+`wiki/`+`index.md`+`log.md`);`isGlobal` 时额外 `ensureDir(knowledge/user/)` + 写 `.gitkeep`。调用点:`initGlobal` 传 `true`、`initProject` 传 `false`。

### schema:knowledge SKILL.md

- Layout 段补 `user/`(标注「仅全局,普通文件夹」)与「`sources/` 等非 wiki 目录是普通 `.md`、不进 index/graph/注入」。
- 新增「项目 wiki 推荐分类」:`design/`(架构与设计规格)、`rules/`(项目代码约定)、`guides/`(踩坑与操作)、`domain/`(业务,按需开);明确小库仍可平铺,大库长成此形,`domain` 不预建空夹。
- Frontmatter 段补 `status: stable`(可选;标记已落地、约定不再调整的页;仅文档约定,本任务不接 lint/注入语义)。
- Pick the Base 段:项目库=代码维护分类;全局库=个人、可自定义 + `user/` 偏好。

### 内容整理(当前项目 `.withy/knowledge/wiki/`)

- `design/`:9 页保留;已落地页加 `status: stable`(core/cli/harness/web/visual-design/knowledge-base/task-event-timeline/node-gate-checkers);`decisions` 不加(活文档)。
- `rules/`(新建):放项目特定约定 → `testing-build-conventions` 移入。
- `guides/`:保留踩坑(`milkdown-wikilink`、`scroll-readonly-markdown`);通用 `nextjs-architecture`/`react-patterns` 暂留 `guides/frontend/` 并在页内注「待迁全局 standards/」(实际迁移 out-of-scope)。
- `product/prd.md`:保持原位(prd 不属架构/约定/踩坑/业务四类,通用根允许它独立成夹)。
- `domain/`:不建(暂无业务页)。
- 移动后跑 `withy knowledge index` + `lint`,修反链。

## Data Flow and Contracts

- 树:`listKnowledgeEntries` → `buildKnowledgeTree` → `KnowledgeTreeNode[]`(relPath = knowledge-相对,如 `wiki/design/core.md`、`sources/rfc-7231.md`、`user/preferences.md`)。
- 选中/打开:Workspace 传 knowledge-相对 relPath → `/api/knowledge/:read` → `readKnowledgePageContent` → `{ raw, readonly }`。
- 写:`/api/knowledge/{create-page,create-folder,rename,delete}` 收 knowledge-相对路径 → core 守卫 `assertInsideKnowledge` → 仅 wiki 路径回调 index/graph 重算。
- 不变量:relPath 永远 knowledge-相对且不出 `knowledge/`;`wiki/` 是唯一会被 index/graph/注入消费的子树。

## Error Handling and Edge Cases

- 越界路径(`..`、绝对、盘符)→ `assertInsideKnowledge` 抛错 → route 返 400(沿用现 KnowledgeError→400)。
- 删/改根生成物(`index.md`/`log.md`)→ readonly 拒绝。
- 非 wiki 目录建页带最小 frontmatter,与 wiki 页同一读写路径,无 no-frontmatter 存盘风险;`saveKnowledgePageBody` 行为一致。
- 空目录(如刚建的 `sources/`)树里显示为可展开空夹(`buildKnowledgeTree` 已含空目录)。
- `listKnowledgeEntries` 必须跳 `graph.json`(派生缓存、非 md),否则它会作为「文件」出现在树里。根 `index.md`/`log.md` 显示但只读。

## Compatibility and Migration

- 旧 relPath 是 wiki-相对(`design/core.md`),新是 knowledge-相对(`wiki/design/core.md`)。前端无持久化 relPath(每次由树现算),不存在存量数据迁移;只需前后端同批改、保持一致。
- 已 init 的旧库:无 `user/`(全局)不影响;无新顶层目录也能正常显示。本任务不回填旧库目录。
- `templates/knowledge/` 仍含 `sources/.gitkeep`+`wiki/.gitkeep`;新增全局 `user/` 仅在 global init 生成,不进共享模板。

## Testing Strategy

- core 单测:`listKnowledgeEntries` 装出含 sources/wiki/user 的树并跳过 graph.json;`assertInsideKnowledge` 拒越界;create-page 在 wiki/ 触发 index、在 sources/ 不触发且无 frontmatter;rename/delete 的 wiki/非wiki 分支。
- app 单测:`buildKnowledgeTree` 对 knowledge-相对扁平表的装树;`adaptKnowledgeGraph` 节点 relPath 带 `wiki/` 前缀。
- init:临时目录 project/global 两次 `runInit`,断言目录集(global 多 `user/`)。
- 端到端手验(agent-browser):web 文件树根显示 sources/wiki(全局 user),展开 wiki 见子目录,sources 下建页成功、wiki 页改名/删除/只读不回归。
- 校验三件套:`pnpm typecheck`、`pnpm lint`(0 warning)、三包 build;内容侧 `withy knowledge index`+`lint`。

## Risks and Rollback

- 风险:relPath 基准切换若前后端不同步,会打不开/越权。缓解:core+server+route+web 同一改动批次落地,单测覆盖 relPath 契约;先 core 后 app,build 卡关。
- 风险:误把非 wiki 目录纳入 index/graph,污染注入。缓解:`isWikiRelPath` 单点判定,index/graph 入口不变(仍只扫 `wiki/`),加非 wiki 建页「不重算」单测。
- 风险:内容整理移动页后断链。缓解:`id` 稳定、双链按 id 解析(移目录不破),移动后 `lint` 兜底。
- 回滚:代码改动为可还原的纯增量(新增 `listKnowledgeEntries`/`assertInsideKnowledge`,切换调用点),`git revert` 即可;内容整理是 git 跟踪的 markdown 移动,可还原。
