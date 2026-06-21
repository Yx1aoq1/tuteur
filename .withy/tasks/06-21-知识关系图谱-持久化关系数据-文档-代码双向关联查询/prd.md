# 知识关系图谱:持久化关系数据 + 文档/代码双向关联查询

## Goal

让 Withy 知识库的「关系」成为可被 agent 直接消费的一等资产:把文档间关联(已有派生逻辑)持久化到本地缓存文件,新增文档↔代码的关联(`covers`),并提供快速查询——给定文档查关联文档/关联代码,给定代码查关联文档。同时把 web 图谱视图从网格布局换成力导向,呈现真实的文档关联结构。

## Confirmed Facts

- 文档↔文档关系**已在 core 派生**:`packages/core/src/knowledge/graph.ts:deriveKnowledgeGraph` 由正文 `[[links]]`(边 `type:'link'`)+ frontmatter `sources`(边 `type:'source'`)产出 `{nodes, edges}`,含 `inDegree`/`outDegree`。仅内存,**未落盘、无查询命令**。
- frontmatter 现有字段(`packages/core/src/knowledge/pages.ts`):`id/title/kind/tags/inject/injectByDefault/sources` + 正文解析的 `links`。**无 `covers` 字段**。
- 关系数据当前消费方:web 图谱视图 `packages/app/src/appTemplates/Knowledge/components/KnowledgeGraph.tsx` + `lintKnowledge`。
- web 图谱用 React Flow 渲染,但坐标按数组下标硬排网格(`KnowledgeGraph.tsx:22,34`),**不看边** → 边全交叉成网(图2)。仓库**无任何力导向库**。
- CLI `withy knowledge` 现有子命令:`graph`/`index`/`lint`(`packages/cli/src/commands/knowledge.ts`)。无查询、无持久化。
- 已有 `.withy/.gitignore`(commit `ad5af3d`),可登记新增缓存文件。

## Requirements

- **`covers` frontmatter 字段**:页面可声明 `covers: [<仓库相对 glob>]`,指向它记录的代码目录/文件;派生关系图时产出 `cover` 边(文档 → 代码路径)。
- **持久化关系缓存**:`.withy/knowledge/graph.json`,**gitignore**。内容含 `nodes`/`edges`(`link`/`source`/`cover` 三型)+ `meta`:`generatedAt`、生成时所有 wiki 页**最大 mtime**、**页数**(内容指纹)。
- **缓存优先查询 + 指纹失效**:查询读 `graph.json`;`stat` wiki 页比对——有页更新于记录 mtime、或页数变化、或文件缺失 → 重派生并刷新文件;否则用缓存。失效靠内容指纹,不靠时间 TTL。
- **查询命令**(均继承 `--json`,默认项目 scope、`--global` 切全局):
  - `withy knowledge related <id>` —— 文档→文档:双向 `[[link]]` 邻居、1 跳、仅 link 边、去重。
  - `withy knowledge coverage --doc <id>` —— 文档→代码:返回该页声明的 `covers` globs **原样(不展开为文件)**。
  - `withy knowledge coverage --path <path>` —— 代码→文档:返回 `covers` glob **命中该路径**的文档 id(单向 `picomatch(页glob, path)`)。
- **`index` 同步刷新**:`withy knowledge index` 在重算 index.md 的同时重写 `graph.json`(eager 刷新,与查询的 lazy 刷新并存)。
- **lint 扩展**:`covers` glob 在仓库匹配不到任何文件 → `withy knowledge lint` 报告(与断链同类:声明指向不存在目标)。
- **力导向渲染**:web 图谱视图改为力导向布局,**仅渲染文档节点 + `link` 边**;节点大小按 `inDegree`;点击节点打开对应文档(保留现有交互)。

## Acceptance Criteria

- [ ] `withy knowledge related <id> --json` 返回与 `<id>` 有直接 `[[link]]`(出或入)的去重文档 id 集合;未知 id → 报错 exit 1。
- [ ] 某页声明 `covers: ["packages/core/src/**"]` 后,`withy knowledge coverage --doc <该页 id> --json` 返回**该声明 globs 原样**(`["packages/core/src/**"]`),不展开为逐个文件。
- [ ] `withy knowledge coverage --path packages/core/src/store/checklist.ts --json` 返回所有 `covers` glob **命中该路径**的文档 id(单向 `picomatch(页glob, path)`)。
- [ ] 改动某页的 `[[link]]`/`covers` 后,**不手动重建**,下次查询即反映变化(指纹检出更新的 mtime 触发重建)。
- [ ] `graph.json` 不存在时,任一查询会重新生成它;该文件被 gitignore(`git status` 不显示为跟踪)。
- [ ] `withy knowledge index` 执行后,`graph.json` 与各级 index.md 同时刷新。
- [ ] web 知识图谱的节点由力导向模拟定位(非固定网格):相连/hub 节点聚簇;点击节点打开其文档。
- [ ] `covers` glob 在仓库匹配不到文件时,`withy knowledge lint` 将其作为问题报告。

## Out of Scope

- 代码↔代码依赖/调用树(import/符号解析,如 madge/dependency-cruiser):已确认**不做**。
- 力导向视图中渲染**代码节点**:文档↔代码只活在查询/数据层(`cover` 边 + `coverage` 命令),视图保持纯文档(用户确认 A)。
- `related` 的多跳/传递闭包,以及把 `source`/`cover` 边混入 `related` 结果。
- 关系文件提交进 git 的「审计快照」用法(选了 gitignore 缓存)。

## Open Questions

- None.
