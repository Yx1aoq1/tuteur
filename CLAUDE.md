# Tuteur 项目规范（供 AI agent 与贡献者遵循）

> 本文是项目私有约定，叠加在全局规范之上；与具体实现冲突时以本文为准。
> 设计文档见 [`docs/design/INDEX.md`](./docs/design/INDEX.md)。

## 仓库结构

- `packages/core`（`@tuteur/core`）：唯一的 `.tuteur/` 读写层 + 领域逻辑 + 类型/校验 + 公共工具。
- `packages/cli`（`@tuteur/cli`，命令 `ttur`）：命令解析与安装器，逻辑全部委托 core。
- `packages/app`（`@tuteur/app`）：Next.js 控制台，数据读写经 core。

铁律：除 `core/src/store.ts` 等明确的碰盘层外，任何地方不直接 `import 'node:fs'` 操作 `.tuteur/`。

## 模块导出规范

### 禁止 `export *`（重点）

barrel / `index.ts` **一律使用显式具名再导出**，禁止 `export * from './x.js'`。

原因：`export *` 会迫使打包器与 TS 加载整个被导出模块的命名空间，**拖慢类型解析、削弱 tree-shaking、模糊公共 API 边界**；显式具名再导出可被精确摇树、公共面可审计。

```ts
// ❌ 不要
export * from './registry.js';

// ✅ 要：值与类型分开，类型用 `export type`
export { AGENT_PLATFORMS, getAgentPlatform } from './registry.js';
export type { AgentTool, AgentPlatformConfig } from './registry.js';
```

- 值导出用 `export { ... }`，纯类型导出用 `export type { ... }`，不要混在同一条里。
- 新增模块成员后，要同步更新对应 barrel 的具名清单。

### 单一数据源

- agent 平台元数据（`AGENT_PLATFORMS`，含 `skillDirs`、`configDir`、`cliFlag`、`templateContext`）只在 `core/src/agents/registry.ts` 定义一次；core 的 skill 发现与 cli 的 configurator 都从这里取，**不得各自复制目录/标志清单**。
- 产品常量（`PRODUCT_DISPLAY_NAME`、`PROJECT_DIR_NAME`、`getBundledSkillName` 等）只在 `core/src/constants.ts` 定义；cli/app 经 core 复用，不再手抄。

### 公共工具放 core/utils

与业务无关的通用方法（JSON 读写、fs 帮助、`slugify`、`nowIso` 等）放 `packages/core/src/utils/`，供 core/cli/app 共用；不要在各包内重复实现。

## 代码风格（default TS/JS preset）

- 格式化用 `prettier`（项目 `.prettierrc`：2 空格、`printWidth` 120、单引号、`trailingComma: all`、`arrowParens: avoid`）。
- import：同一条 `import { ... }` 内成员按名称长度从长到短排序（同长按字母序）；`type` 成员排在值成员前。
- export/barrel：单行导出在前、多行在后；成员按长度从长到短排序；值导出与类型导出分组。
- 注释：导出函数用 JSDoc（概述 +`@param`，返回语义不显然时补 `@return`，不写 `@returns`、不复述 TS 类型）；`interface/type/enum/const` 顶层用 `//` 摘要；字段单行注释用 `//`。
- 可读性：变量声明段与控制流之间留 1 空行；直接透传 Promise 的函数不加 `async`、不留无意义的 `return await`。

## 命令与提交

- 校验三件套：`pnpm typecheck`、`pnpm lint`（0 warning）、对应包 `build`。
- 格式化只针对目标文件 `prettier --write <files>`，不要跑全仓格式化包装脚本。
- 未获明确授权不执行 `git add/commit/push`。
