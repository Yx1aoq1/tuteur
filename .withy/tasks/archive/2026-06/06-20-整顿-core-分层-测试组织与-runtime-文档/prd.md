# 整顿 core 分层、测试组织与 runtime 文档

## Goal

`@withy/core` 当前 32 个源文件平铺,底层工具、`.withy/` 碰盘 I/O 与业务逻辑相互杂糅,且测试文件与实现同目录、跨包用两套测试框架,导致可维护性差、边界不可审计。本任务在单包 `@withy/core` 内把代码重组为"通用件 → 统一 store 碰盘层 → 业务模块 → 装配层"的清晰分层,把测试物理分离并统一运行器,并消除 "runtime" 命名歧义,使业务与碰盘隔离、模块边界清晰、对外契约不变、测试可独立管理。

## Confirmed Facts

- core 源码平铺:`packages/core/src/` 下 32 个文件,业务(task/knowledge/context)、碰盘(store/paths)、纯工具(utils/constants/types)同层混放。
- 测试与实现同目录:如 `task.test.ts` 紧贴 `task.ts`、`knowledge.test.ts` 紧贴 `knowledge.ts`。
- 跨包两套测试框架:core/app 用 vitest(`vitest run`),cli 用 node:test(`packages/cli/package.json` 的 `tsx --test src/configurators/*.test.ts src/installation/*.test.ts`,写死 glob)。
- `store.ts`(473 行)单文件混合 tasks/state/workflow/events/approvals/implementation/artifacts/knowledge-fs/wiki/projects/pointer/developer 等多种产物的读写。
- `knowledge.ts`(856 行)为单体,且 knowledge 由两个包共同消费:app(`packages/app/src/server/*`、`app/api/knowledge/*`)、cli(`commands/knowledge.ts`、`commands/task.ts` 的 `readKnowledgeEntry`)。
- workflow 同样由两个包共同消费:cli(`nextNode/skipNode/rewindTo/approveCurrentNode`)、app(`api/workflows/[id]/route.ts`、`server/dashboard.ts` 的 `readWorkflow/nodeById/phaseOf`)。因此 knowledge/workflow 均非单包专属。
- 项目铁律已要求"除 store 层外任何地方不直接 `import 'node:fs'` 操作 `.withy/`"(`CLAUDE.md`),但当前业务文件(如 `skills.ts`)仍直接用 `node:fs`。
- "runtime" 一名覆盖三件不相干的事:`.withy/runtime/` 是瞬态状态目录(项目级 `current-task.json` 指针在 workflow 走完时由 `clearCurrentTaskPointer` 主动清除;全局级存 `dashboard.json` 守护态);`core/src/workflow/runtime.ts` 是工作流状态机的 IO 外壳;`cli/src/harness/runtime.ts` 是 CLI 输出层。两个已完成任务在 `.withy/runtime/` 无产物属设计预期,产物在 `.withy/tasks/<id>/`。
- `packages/app/.next/standalone/**` 含被复制的 `*.test.ts`(构建残留,已被 app vitest.config 的 `**/.next/**` 排除)。

## Requirements

- 单包 `@withy/core` 内按四层重组:顶层通用件(`utils/`、`constants.ts`、`types.ts`、`paths.ts`)→ 统一 `store/` 碰盘层 → 业务模块(`knowledge/`、`workflow/`、`task/`、`agents/`)→ 装配层(`session/`)。
- `store/` 是唯一对 `.withy/` 做文件 I/O 的层,按产物类型拆分(tasks/state/events/workflows/knowledge-files/projects/pointer/developer 等),对外提供带类型(zod 解析)的仓储读写。
- 业务模块只含领域逻辑,落盘一律调用 `store/`,不直接 `import 'node:fs'`(把现存于 `skills.ts` 等业务文件中的直接 fs 用法收敛到 `store/`)。
- `store.ts`(473)按产物拆入 `store/` 目录;`knowledge.ts`(856)按职责拆为 frontmatter/entries/pages/indexes/graph/lint/errors 等业务文件。
- 每个目录(`store/` 与各业务模块)的 `index.ts` 只作模块出口,仅含显式具名再导出(`export { … } from`),禁止 `export *`,禁止在 index.ts 写实现。
- 维持单一对外门面 `@withy/core`,其具名导出集合与现状一致;不引入子路径导出,app/cli 的 import 不变。
- `types.ts` 本轮维持顶层单文件(共享 zod schema/类型),不下放到各业务模块。
- 三个包测试统一到 vitest;cli 从 node:test 迁移过来。
- 每个包新增 `tests/` 目录,镜像 `src/` 结构,所有 `*.test.ts` 迁入;构建产物 `dist/` 永不包含测试文件;测试仍纳入类型检查。
- 在代码注释与设计 wiki(`.withy/knowledge/wiki/design/core.md`)中说明三处 "runtime" 的区别与 `.withy/runtime/` 的瞬态语义;不重命名任何文件或目录,不改其行为。
- `@withy/core` 既有公开行为保持不变;现有任一消费方功能不回归。

## Acceptance Criteria

- [ ] `find packages/*/src -name '*.test.ts'` 无输出;全部测试位于 `packages/*/tests/` 并镜像 `src/` 结构。
- [ ] `pnpm -r test` 三包均经 vitest 运行且通过;`packages/cli/package.json` 不再出现 `tsx --test`。
- [ ] `pnpm -r build` 后,任一包 `dist/` 内无 `*.test.*` 文件。
- [ ] `pnpm typecheck` 通过且覆盖 `tests/` 下测试;`pnpm lint --max-warnings=0` 通过。
- [ ] `packages/core/src/` 直接子文件仅为 `index.ts`、`constants.ts`、`types.ts`、`paths.ts`(外加 `utils/`、`store/` 与各业务模块目录);`store.ts`、`knowledge.ts` 不再以单体存在。
- [ ] `grep -rl "node:fs\|from 'fs'" packages/core/src` 命中范围仅限 `store/` 与 `utils/`、`paths.ts`(业务模块零直接 fs)。
- [ ] 每个目录的 `index.ts` 仅含 `export … from` 行,无实现代码、无 `export *`。
- [ ] `@withy/core` 对外导出集合与重构前一致;app/cli 对 `@withy/core` 的 import 语句无需改动即可 `pnpm typecheck` 通过。
- [ ] `.withy/knowledge/wiki/design/core.md` 记录三处 "runtime" 含义与 `.withy/runtime/` 瞬态语义;仓库内无 `workflow/runtime.ts`、`cli/harness/runtime.ts`、`.withy/runtime/` 的重命名。
- [ ] `withy task status`、`withy task list` 等命令行为不变。

## Out of Scope

- 把 core 拆成多个 npm 包(独立 `@withy/store`、`@withy/knowledge` 等)——本轮在单包内分层。
- 引入子路径导出(`@withy/core/knowledge` 等)——维持单一门面。
- 把 `types.ts` 的 schema 下放到各业务模块——本轮维持顶层。
- 重命名 `workflow/runtime.ts`、`cli/harness/runtime.ts` 或 `.withy/runtime/` 目录——仅补文档。
- 任何产品行为/功能变更。

## Open Questions

- None.
