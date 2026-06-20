# Design: 整顿 core 分层、测试组织与 runtime 文档

## Summary

在单包 `@withy/core` 内做**分层架构**:顶层通用件(`utils/`、`constants.ts`、`types.ts`、`paths.ts`)→ 统一 `store/` 碰盘层 → 业务模块(`knowledge/`、`workflow/`、`task/`、`agents/`)→ 装配层(`session/`)。`store/` 是唯一对 `.withy/` 做 fs I/O 的层,按产物类型提供带类型的仓储读写;业务模块只含领域逻辑、落盘一律调 `store/`、不碰 `node:fs`。`store.ts`(473)按产物拆入 `store/`,`knowledge.ts`(856)按职责拆为业务文件。对外维持单一门面 `@withy/core`(导出集合不变,不引子路径)。测试迁入各包 `tests/` 镜像目录并统一 vitest。"runtime" 仅补文档不改代码。

为何如此:独立包带来的硬边界/独立版本在本仓用不上,却要付 workspace/构建/版本编排成本;同样的"业务 vs 碰盘"隔离用包内 `store/` 层 + 项目既有铁律 + lint 即可守住。业务与碰盘分离后,`store.ts`/`knowledge.ts` 两个巨石被打散,边界可审计,而对外契约零变更。

## Architecture and Boundaries

依赖方向严格自上而下,禁止反向或跨层向上:

```
session/         装配层(纯编排,不碰 fs)
   │
knowledge/ workflow/ task/ agents/   业务层(领域逻辑,落盘调 store/,不碰 fs)
   │
store/           碰盘层(唯一 .withy fs I/O,带类型仓储)
   │
utils/ constants.ts types.ts paths.ts   通用件(纯,无业务)
```

- **通用件**:`utils/`(fs/git/json/string/time,业务无关的纯函数)、`constants.ts`(产品常量,单一数据源)、`types.ts`(zod schema + 领域类型,维持顶层单文件)、`paths.ts`(`.withy/` 路径布局 + scope 解析)。可被任何上层依赖;自身不依赖上层。
- **store/**:唯一对 `.withy/` 执行 `node:fs` 的层。按产物类型组织,封装"读→zod 解析→typed 对象 / typed 对象→序列化→写"的仓储语义。依赖通用件;不含领域规则。
- **业务层**:每个模块聚合一类领域逻辑,落盘只经 `store/`,不直接 `import 'node:fs'`。模块间依赖保持单向、最小。
- **装配层**:`session/` 把多个业务模块拼成对外能力(如 session-start 注入),自身不碰 fs。

碰盘铁律落地:重构后 `grep -rl "node:fs" packages/core/src` 只应命中 `store/`、`utils/`、`paths.ts`;`skills.ts` 等业务文件中现存的直接 fs 用法收敛进 `store/`(新增 `store/skills.ts` 承载 skill 目录扫描的 fs 部分,业务侧 `agents/skills.ts` 只保留解析/匹配逻辑)。

## Components

各目录的 `index.ts` 一律仅含 `export … from`(显式具名、禁 `export *`)。

`store/`(由 `store.ts` 473 行 + 各业务文件的 fs 部分拆入):

- `tasks.ts` —— `task.json` 读写、`listTasks`、`taskExists`
- `state.ts` —— `state.json` 读写、approvals(在 state 内)读
- `events.ts` —— `events.jsonl` 追加/读取
- `workflows.ts` —— `workflows/<id>.workflow.json` 读写
- `knowledge.ts` —— 知识库 md 原始读写、wiki 条目 CRUD、`listKnowledgeFiles`/`readKnowledgeSource`/`listWikiEntries`
- `projects.ts` —— 项目注册表、current-task 指针
- `meta.ts` —— developer 身份、`context.json`、`guide.md`、`implement.md`、artifacts 列举
- `skills.ts` —— 按 agent 平台目录扫描 skill 文件(fs 部分)
- `errors.ts` —— `StoreError`
- `index.ts`

业务模块:

- `knowledge/`(由 `knowledge.ts` 856 行拆分,fs 部分已移入 `store/knowledge.ts`):`frontmatter.ts`、`entries.ts`、`pages.ts`、`indexes.ts`、`graph.ts`、`lint.ts`、`errors.ts`(`KnowledgeError`)、`index.ts`;knowledge 专属类型就近放置,不上提 `types.ts`。
- `workflow/`:`engine.ts`(机制)、`gate.ts`(检查器)、`interpret.ts`(Withy 策略)、`validate.ts`(校验)、`runtime.ts`(IO 外壳,保留原名;state/events 经 `store/` 读写)、`index.ts`。
- `task/`:`service.ts`(`archiveTask`/`isStuck`/`implementationProgress`/`resolveCurrentTask`/`countConsecutiveFailures`)、`index.ts`。
- `agents/`:`registry.ts`、`types.ts`、`skills.ts`(解析/匹配,fs 调 `store/skills`)、`init-config.ts`、`index.ts`。
- `session/`:`hook.ts`(`renderSessionStart`)、`context.ts`(`resolvePlannedContext`)、`index.ts`;纯编排,不碰 fs。

顶层:`utils/`(沿用现状)、`constants.ts`、`types.ts`、`paths.ts`、`index.ts`(门面)。

## Data Flow and Contracts

- 公开 API:根门面 `@withy/core` 的具名导出集合**与重构前完全一致**(逐项核对 `index.ts`),仅内部实现位置变化。app/cli 的 import 不改。
- 仓储契约:`store/` 暴露 typed 读写(如 `readTask(scope,id): Task`、`writeWorkflow`、`appendEvent`、`readKnowledgeSource`、`listWikiEntries`),内部完成 fs + zod 解析;业务层只消费 typed 结果。
- 调用方向:`session/hook` → `task`/`workflow`/`knowledge`/`session/context`;`session/context` → `knowledge` + `store/meta`(读 context-config);`workflow/runtime` → `store`(state/events/workflows);`task/service` → `store`(tasks/state);`knowledge/*` → `store/knowledge`;`agents/skills` → `store/skills`。均单向向下。
- 测试发现:各包 `vitest` `include: ['tests/**/*.test.ts']`;`tests/` 镜像 `src/`(如 `tests/workflow/engine.test.ts`、`tests/store/tasks.test.ts`)。
- 类型检查:各包 `tsconfig.json` `include` 增 `tests/**/*.ts`(`noEmit` 下不受 `rootDir` 约束);`tsconfig.build.json` 以 `include: ['src/**/*.ts']` 覆盖(或 `exclude: ['tests/**']`),确保 `dist/` 不含测试。

## Error Handling and Edge Cases

- `StoreError`(→ `store/errors.ts`)、`KnowledgeError`(→ `knowledge/errors.ts`)行为不变,仅迁移位置;经各 `index.ts` 重导出,外部捕获不受影响。
- 循环引用风险:业务模块间依赖保持单向(见调用方向);`types.ts` 维持顶层单文件规避 schema 互引。迁移后由 `typecheck` + `build` 把关。
- 碰盘收敛风险:把 `skills.ts` 的 fs 部分移入 `store/skills.ts` 时须保持原有目录扫描语义(全局/项目 skill 目录、平台清单来源不变)。以现有 `agents/registry.test`、skill 发现相关测试把关。
- 测试双重计入:`packages/app/.next/standalone/**` 残留测试已被 app vitest `**/.next/**` 排除,迁移后保持。

## Compatibility and Migration

- 对外行为零变更:`@withy/core` 导出集合不变;无子路径、无多包,app/cli 不联动。
- 文件迁移用 `git mv` 保留历史;`workflow/runtime.ts`、`cli/harness/runtime.ts`、`.withy/runtime/` 目录**均保留原名**,仅补注释/wiki 文档(遵循 "runtime 仅补文档" 决策)。
- `.withy/` 落盘结构与读写行为不变,仅 core 内部代码组织变化;无数据迁移。

## Testing Strategy

- 迁移既有 11 个测试到各包 `tests/` 镜像目录,内容不改逻辑、仅修相对 import 路径与(cli)断言框架。
- cli 三个测试(`configurators/claude`、`configurators/shared`、`installation/init`)由 node:test/`assert` 改写为 vitest(`describe/it/expect`)。
- 全量验证关:`pnpm -r test`(vitest)、`pnpm typecheck`、`pnpm lint --max-warnings=0`、`pnpm -r build`,并核对 `dist/` 无测试、业务模块零直接 fs、门面导出一致。
- 行为回归抽检:`withy task status`/`withy task list`/`withy next`(dry)改后仍正常。

## Risks and Rollback

- 主要风险:拆 `store.ts`/`knowledge.ts` 与收敛 `skills.ts` fs 时遗漏导出或错接依赖。缓解:每完成一层即跑 `pnpm --filter @withy/core typecheck`;门面导出按现有 `index.ts` 清单逐项核对;`skills.ts` fs 收敛后专门跑 skill 发现相关测试。
- 回滚:全程在分支上以 `git mv` + 编辑推进,任一关失败可 `git restore`/弃分支回到重构前;对外契约未变,消费方无需联动回滚。
