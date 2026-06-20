# Implementation Plan

支撑说明:全程在重构分支上以 `git mv` + 编辑推进,保留历史;每完成一层即跑一次 `pnpm --filter @withy/core typecheck` 快速兜底。门面导出以重构前 `packages/core/src/index.ts` 清单为准,逐项核对。

- [x] 建重构分支并确认基线全绿 — Verify: `pnpm -r test && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm -r build` 均通过
- [x] 补 runtime 文档:在 `paths.ts`(`runtimeDir`/`currentTaskPointerPath`)、`workflow/runtime.ts`、`cli/harness/runtime.ts` 顶部加注释厘清三者;在 `.withy/knowledge/wiki/design/core.md` 增一节说明三处 "runtime" 含义与 `.withy/runtime/` 瞬态语义 — Verify: `pnpm typecheck && pnpm lint --max-warnings=0` 通过;`core.md` 含该节
- [x] cli 测试运行器换 vitest:加 `vitest` devDep,`packages/cli/package.json` 的 `test` 改为 `vitest run`,把 `configurators/claude`、`configurators/shared`、`installation/init` 三测试由 node:test/`assert` 改写为 `describe/it/expect` — Verify: `pnpm --filter @withy/cli test` 经 vitest 通过
- [x] 迁移 app + cli 测试到各自 `tests/` 镜像目录,修相对 import;各包加/调 `vitest.config` 的 `include: ['tests/**/*.test.ts']`,`tsconfig.json` `include` 增 `tests/**/*.ts` — Verify: `find packages/{app,cli}/src -name '*.test.ts'` 无输出;`pnpm --filter @withy/app test && pnpm --filter @withy/cli test` 通过
- [x] 建 `store/` 碰盘层:把 `store.ts`(473)按产物拆为 `store/{tasks,state,events,workflows,knowledge,projects,meta,errors}.ts`,`StoreError` 入 `store/errors.ts`,写 `store/index.ts`(仅 `export … from`) — Verify: `pnpm --filter @withy/core typecheck`
- [x] 收敛碰盘:把 `skills.ts` 中按平台目录扫描 skill 文件的 `node:fs` 部分移入 `store/skills.ts`,业务侧只留解析/匹配 — Verify: `pnpm --filter @withy/core typecheck`;`grep -rl "node:fs" packages/core/src` 仅命中 `store/`、`utils/`、`paths.ts`
- [x] 建 `task/` 业务模块:`task.ts` 逻辑入 `task/service.ts`(落盘调 `store/`),写 `task/index.ts` — Verify: `pnpm --filter @withy/core typecheck`
- [x] 建 `workflow/` 业务模块:迁 `engine/gate/interpret/validate/runtime`(`runtime.ts` 保留原名),state/events/workflows 读写改走 `store/`,写 `workflow/index.ts` — Verify: `pnpm --filter @withy/core typecheck`
- [x] 建 `knowledge/` 业务模块:`knowledge.ts` 拆为 `frontmatter/entries/pages/indexes/graph/lint/errors`,文件 I/O 调 `store/knowledge`,`KnowledgeError` 入 `knowledge/errors.ts`,写 `knowledge/index.ts` — Verify: `pnpm --filter @withy/core typecheck`
- [x] 建 `agents/` 业务模块:迁 `agents/registry`、`agents/types`,`skills.ts`(解析部分)→ `agents/skills.ts`,`init-config.ts` → `agents/init-config.ts`,写 `agents/index.ts` — Verify: `pnpm --filter @withy/core typecheck`
- [x] 建 `session/` 装配模块:`hook.ts` → `session/hook.ts`、`context.ts` → `session/context.ts`(纯编排、不碰 fs),写 `session/index.ts` — Verify: `pnpm --filter @withy/core typecheck`
- [x] 删除已清空的旧文件(`store.ts`/`knowledge.ts`/`task.ts`/`context.ts`/`hook.ts`/`skills.ts`/`init-config.ts`),重写门面 `index.ts`,逐项核对导出集合与重构前一致 — Verify: `pnpm --filter @withy/core typecheck && pnpm --filter @withy/core build`;`packages/core/src` 直接子文件仅 `index/constants/types/paths.ts`(外加 `utils/`、`store/` 与业务模块目录)
- [x] 迁移 core 测试到 `packages/core/tests/` 镜像新结构,修 import;core `vitest.config`/`tsconfig` 对齐 `tests/` — Verify: `find packages/core/src -name '*.test.ts'` 无输出;`pnpm --filter @withy/core test` 通过
- [x] 全量验收 + 行为抽检 — Verify: `pnpm -r test && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm -r build` 全绿;任一 `dist/` 无 `*.test.*`;`@withy/core` 对外导出未变(app/cli 未改 import 即通过);`withy task status`、`withy task list` 行为正常
