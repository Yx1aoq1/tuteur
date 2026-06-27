# 知识库三层结构(sources / wiki / user)+ web 文件树多层展示

## Goal

把知识库从「代码只认 `wiki/`」升级为「`knowledge/` 通用多层」模型:`wiki/` 仍是机器托管特殊层(frontmatter 页、自动 index、关系图、注入),`sources/`、`user/` 等是普通可浏览/可编辑文件夹。让设计、约定、踩坑、业务在 wiki 内分类清晰,外部原料与个人偏好各有其层,init 按 scope 预建对应目录,web 文件树如实展示这些顶层目录,并把当前项目 wiki 内容按新分类整理。解决三个现存问题:`sources/` 无代码接线(孤儿空夹)、wiki 顶层与 sources 在 web 不可见、规范与项目知识混放。

> 注:任务标题里的「rules 平级」是早期方案,最终设计已收敛为 `rules` 作为 `wiki/` 子目录,本 PRD 为准。

## Confirmed Facts

- 知识库读写/索引/图/注入全部硬编码只认 `wiki/`:`listWikiEntries`、`wikiEntryPath`、`assertInsideWiki`、index/graph(`packages/core/src/store/knowledge.ts`、`packages/core/src/knowledge/*`)、`getKnowledgeTree`(`packages/app/src/server/knowledge.ts`)。
- `sources/` 当前零代码:`packages/*/src` 无 `sources` 字面量;`.withy/knowledge/sources/` 是手动建的孤儿空夹。
- init 经 `seedKnowledgeBase`(`packages/cli/src/installation/init.ts:252`)镜像 `templates/knowledge/`(`sources/.gitkeep`+`wiki/.gitkeep`+`index.md`+`log.md`),**项目与全局共用同一布局**。
- 当前项目 wiki:`design/`(9 页)、`guides/`(5 页:通用 nextjs/react + 踩坑 milkdown/scroll + testing-build)、`product/`(prd)。
- 知识库设计模型:karpathy LLM Wiki 三层 raw sources(只读)/ wiki(LLM 维护)/ schema(=CLAUDE.md/skill,非内容目录);Verdent 编码版把「项目维护」目录(architecture/decisions/…)嵌在 `wiki/` 内。来源 `gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`、`verdent.ai/guides/llm-knowledge-base-coding-agents`(经 sourcemux 检索)。

## Requirements

- 知识库视图对齐 `knowledge/` 下**所有顶层文件夹与文件**(`sources/`、`wiki/` 及根 `index.md`/`log.md`),不再只显示 `wiki/` 层;排除派生缓存 `graph.json`。代码不硬编码具体顶层目录名。`wiki/` 保留机器托管特权(index/graph/注入只作用于 `wiki/`)。
- 本任务 web 改动仅项目作用域(app 当前只有 `[project]/knowledge` 视图,无全局知识视图)。「全局作为特殊项目、展示与项目同构」是后续愿景,不在本任务。
- `sources/` 等非 wiki 目录在 web 可浏览、可建页/建夹/重命名/删除;其页带**最小 frontmatter**(id/title/updated,与 wiki 页同一读写路径),但**不触发 index/graph、不进注入**。根 `index.md`/`log.md` 为只读。
- init 项目库预建 `sources/`+`wiki/`+`index.md`+`log.md`;全局库额外预建 `user/`(disk 级结构,本任务不在 web 展示、不接注入)。
- 当前项目 `wiki/` 内容按新分类整理:`design/`(架构与设计规格,已落地页标 `status: stable`)、`rules/`(项目代码约定)、`guides/`(踩坑与操作指南)、`domain/`(有内容再开,不预建空夹);通用框架规范不留在项目库。
- `knowledge` SKILL.md 模板对齐新结构:补 `user/` 层与项目推荐子目录分类、`status` frontmatter 字段、「wiki 特殊层 + 其余普通文件夹」的通用根模型说明,且不与设计文档矛盾。

## Acceptance Criteria

- [ ] 临时目录跑 `withy init`:项目根得到 `knowledge/{sources,wiki}/`+`index.md`+`log.md`;`withy init --global` 额外得到 `knowledge/user/`。
- [ ] web 文件树根层显示 `sources`、`wiki` 文件夹与根 `index.md`/`log.md`(只读),不显示 `graph.json`;展开 `wiki` 见子目录;`wiki/` 内页增删改/重命名/`index.md` 只读标记不回归;在 `sources/` 下新建 `.md` 成功(带最小 frontmatter)且不触发 index 重算。
- [ ] 非 wiki 目录用 `..` 越界路径调 CRUD 被 core 拒绝(400)。
- [ ] 当前 `.withy/knowledge/wiki/` 重整为 `design/`+`rules/`+`guides/`(`domain/` 按需);`withy knowledge index` 与 `withy knowledge lint` 跑通,0 断链/0 孤儿误报。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/core`+`@withy/cli`+`@withy/app` `build` 全过。
- [ ] knowledge SKILL.md 含 `user/` 层、项目子目录分类、`status` 字段说明。

## Out of Scope

- 全局知识库的 web 视图(「全局作为特殊项目、展示与项目同构」是后续愿景);`user/` 本任务只 init 建目录,不在 web 展示、不接注入解析。
- 把 865 行通用框架规范实际迁入「全局库 standards/」——属个人全局库操作,另行处理。
- qmd / FTS 等检索升级。
- 知识库 frontmatter `status` 字段进注入/lint 的语义(本任务仅作为冻结标记写入并在 SKILL.md 说明)。

## Open Questions

- None.
