# Design: 知识关系图谱:持久化关系数据 + 文档/代码双向关联查询

## Summary

复用 core 既有的关系派生管线(`graph.ts`),把它从「内存即用」升级为「带内容指纹的本地缓存 + 双向查询出口」,并新增文档↔代码的 `covers` 关联。渲染层把 Knowledge 图谱视图从 React Flow 网格换成 `react-force-graph-2d` 力导向。数据/查询在 core+cli(机器可验证),渲染在 app(看图验证),两者经同一份关系数据解耦。

## Architecture and Boundaries

- **core `knowledge/`**:`covers` 进 frontmatter;`graph.ts` 多产 `cover` 边;新增缓存层 `cache.ts`(读/指纹校验/重建 `graph.json`);新增查询纯函数;`lint.ts` 加悬空 `covers` checker。**碰盘只在 cache.ts/pages.ts 既有读层**,查询函数纯。
- **cli `knowledge`**:加 `related`、`coverage` 两子命令,薄壳调 core。
- **app Knowledge 视图**:`KnowledgeGraph.tsx` 换渲染库;数据仍走 `/api/knowledge/graph`,不动 API。
- **边界**:`cover` 边进**数据与查询**,**不进力导向视图**(视图仅文档节点 + `link` 边)。glob→文件展开**实时**,缓存只存 glob 声明,指纹只跟踪 wiki 页 mtime。React Flow 为 Workflow 画布保留。

## Components

1. **`covers` 字段(`pages.ts`)**:`KnowledgePage.covers: string[]`,frontmatter `asArray(data.covers)`;缺省 `[]`。语义=该页记录的仓库相对代码 glob。
2. **`cover` 边(`graph.ts`)**:每页对每条 `covers` glob 产 `{from: pageId, to: glob, type: 'cover'}`;glob 作 `kind:'code'` 节点(类比现有 `source` 节点),仅入数据,不喂视图。
3. **缓存层(`knowledge/cache.ts`)**:
   - `graph.json` = `{ meta:{ generatedAt, maxMtime, pageCount }, nodes, edges }`,写在 `knowledge/` 根、gitignore。
   - `readGraphCached(scope)`:读 `graph.json` → `stat` `wiki/**/*.md` 求 `maxMtime`+`pageCount` → 与 meta 比对;不符/文件缺失 → `deriveKnowledgeGraph` 重派生 + 写回;否则返回缓存。
   - `rebuildKnowledgeIndexes` 末尾调一次 `writeGraphCache`(eager)。
4. **查询纯函数(`knowledge/query.ts`)**:
   - `relatedDocs(graph, id): string[]` —— 双向 `link` 邻居去重;**仅返回同 scope 存在的文档节点**,指向不存在节点的链接(断链/跨 scope)不计入;`id` 不在图 → 抛错。
   - `coverageForDoc(scope, id): string[]` —— **直接返回该页声明的 `covers` globs 原样**(不碰盘、不展开);未知 id 抛错。
   - `docsCoveringPath(scope, path): string[]` —— 各页 `covers` glob 用 `picomatch(glob, path)` **单向**匹配传入 `path`,返回命中页 id 去重。
   - 依赖分工:`picomatch` 仅供 `docsCoveringPath` 与 lint 做模式匹配;`fast-glob` 仅供 lint 做「glob 是否命中仓库文件」的存在性展开。`coverage --doc` 两者都不用。
5. **cli 命令(`commands/knowledge.ts`)**:
   - `related <id>` → `{ ok, id, related: string[] }`;未知 id exit 1。
   - `coverage --doc <id>` → `{ ok, doc, paths: string[] }`;`coverage --path <p>` → `{ ok, path, docs: string[] }`;两者择一,缺二者报错。
6. **lint checker(`lint.ts`)**:每页每条 `covers` glob 经 `fast-glob` 零命中 → push 一条 issue(level 同断链)。
7. **渲染(`KnowledgeGraph.tsx`)**:`react-force-graph-2d`,Next 动态导入 `ssr:false`;`graphData={{nodes,links}}`(仅 `type:'link'` 边、文档节点);`nodeVal` 按 `inDegree`;`onNodeClick` 打开文档(沿用现有跳转);保留橙色高亮当前/选中。

## Data Flow and Contracts

- **graph.json**:`meta.maxMtime`=生成时 `wiki/**/*.md` 的最大 `mtimeMs`;`meta.pageCount`=页数;`nodes`/`edges` 沿用 `KnowledgeGraphNode/Edge`,`edges.type` 扩 `'cover'`,新增 `kind:'code'` 节点。
- **指纹失效判定**:`missing(file) || statMaxMtime > meta.maxMtime || statPageCount !== meta.pageCount` → 重建。
- **查询读取**:`related` 走 `readGraphCached`;`coverage --doc` 直接返页声明 globs(不展开);`coverage --path` 用 `picomatch(页glob, path)` 对各页 globs 实时单向匹配。
- **命令 JSON**:见组件 5;全部 `{ ok, ... }` 信封,继承 `--json`。
- **并发与不变量**:`graph.json` 写入 last-writer-wins、幂等、不上锁(与 events §4.4 同范式;并发重建算同一份数据,无害)。它是派生缓存,任何时刻可删,下次查询/`index` 重建;失效靠指纹,绝不靠时间。

## Error Handling and Edge Cases

- `related <未知 id>` → `{ ok:false, error }` exit 1(不静默空集)。
- 页无 `covers` → `coverage --doc` 返回空 `paths`(非错)。
- `covers` glob 零命中 → 查询返回空(非错);**由 lint 暴露**(声明烂了归 lint,查询不报)。
- `coverage` 既无 `--doc` 又无 `--path`,或两者都给 → 报错 exit 1。
- `graph.json` 损坏/ schema 不符 → 当作缺失,重建(不抛)。
- `--path` 传仓库外/绝对路径 → 归一为仓库相对再匹配;无法归一则空集。
- mtime 粒度(秒级 fs):同秒内多次改可能漏判 → `pageCount` 变化兜一部分;`index` 的 eager 重建是确定性兜底。

## Compatibility and Migration

- `graph.json` 全新、gitignore,无存量迁移。
- `covers` 可选,缺省 `[]`;既有页不写即无 `cover` 边,行为不变。
- 既有 `graph` 命令 / web 视图改读 `readGraphCached`,数据是旧结构的**超集**(多 `cover` 边/`code` 节点),旧消费端忽略未知 type 即可。
- React Flow 依赖保留(Workflow 在用);只 Knowledge 视图新增 `react-force-graph-2d`。

## Testing Strategy

- **core 单测**:指纹重建(改 mtime/页数/删文件触发,未变不重建)、`relatedDocs` 双向去重 + 未知 id 抛错、`coverageForDoc` glob 展开、`docsCoveringPath` 匹配、lint 悬空 covers。
- **cli 冒烟**:`related`/`coverage --doc`/`coverage --path` 的 `--json` 形态与退出码。
- **手验**:web 图谱力导向布局(聚簇、点击打开文档);`typecheck`/`lint`/各包 `build`。

## Risks and Rollback

- **新依赖**:`fast-glob`+`picomatch`(core)、`react-force-graph-2d`(app)。成熟库,风险低;rollback 删依赖、查询回退实时派生、视图回退 React Flow。
- **指纹假阴性**(同秒改动):`pageCount` + `index` eager 兜底;极端情况手跑 `withy knowledge index` 强刷。
- **react-force-graph SSR**:必须 `ssr:false` 动态导入,否则 `window` 报错;已在设计内固定。
- 整体 rollback:三层互相独立,可分别回退(数据层删缓存退实时、查询删命令、渲染退 React Flow)。
