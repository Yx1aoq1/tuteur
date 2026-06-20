# Withy

> 面向 AI coding agent 的**本地优先**工作流 harness —— 用结构化工作流 + 代码门禁,管住「这一步到底算不算做完、准不准往下走」。
>
> A **local-first** workflow harness for AI coding agents — structured workflows plus code-enforced gates decide whether a step is actually done before the flow moves on.

[中文](#中文) · [English](#english)

> ⚠️ 早期开发中 / Early development：版本 `0.0.0`,尚未发布到 npm,核心 CLI/harness 闭环部分落地。
> Version `0.0.0`, not yet published to npm; the core CLI/harness loop is partially landed.

---

## 中文

### Withy 是什么

Withy 是一个本地优先的 CLI 工具和可视化控制台,用来**编排、执行、观察和审计 AI coding agent 的工作流**。它面向 Codex、Claude Code、Gemini CLI 等 AI 编码工具——不替代这些 agent,而是在它们之上提供一个**更强约束的 harness 层**:Withy 管任务状态、工作流阶段、阶段产物、执行记录和流转条件;具体 agent 负责完成某个阶段内的实际工作。

核心主张:**不要只用 Markdown 告诉 AI「应该怎么做」,而是用结构化工作流定义任务生命周期,让系统判定当前阶段是否完成、产物是否齐全、是否允许进入下一步。** Markdown(skill)只回答「这一步怎么做」,Withy 回答「这一步算不算做完了、准不准往下走」。

### 核心理念

- **结构化工作流 + 代码门禁**:工作流是固定三阶段(规划 → 执行 → 收尾)+ 阶段内的节点图;推进只经 `withy next`,由代码门禁(产物存在、检查通过、人工确认)判定能否前进,而不是凭 agent 一句「我做完了」。
- **薄 hook、单一逻辑源**:平台 hook 入口只转发到 `withy hook <event>`,所有判定都在 `@withy/core`,CLI / hook / 控制台都是它的调用方,不重复实现。
- **可观察、可审计**:每次推进尝试、分支判定、跳过、回退都写入 `events.jsonl`;判定带原因、可在控制台回看。
- **本地优先、双层知识**:数据落在项目内 `.withy/`(团队共享、入库);跨项目的个人知识落在全局 `~/.withy/`(不入库)。

### 仓库结构

这是一个 pnpm monorepo:

| 包 | 作用 |
| --- | --- |
| [`packages/core`](packages/core) (`@withy/core`) | 唯一的 `.withy/` 读写层 + 领域逻辑 + 类型/校验 + 公共工具 |
| [`packages/cli`](packages/cli) (`@withy/cli`,命令 `withy`) | 命令解析与安装器,逻辑全部委托 core |
| [`packages/app`](packages/app) (`@withy/app`) | Next.js 可视化控制台,数据读写经 core |

### 快速开始

```bash
# 1. 安装依赖并构建 core + cli
pnpm install
pnpm --filter @withy/core --filter @withy/cli build

# 2. 让 withy 命令全局可用(从本仓 link)
cd packages/cli && pnpm link --global   # 之后即可在任意项目里使用 `withy`

# 3. 在目标项目初始化(配置开发者身份 + 选择 agent 平台,写入 .withy/ 与各 agent 配置)
withy init

# 4. 开始一个任务,按注入的工作流状态与 Next-Action 推进
withy task start "给登录页加上表单校验"
withy task status        # 查看当前节点、阶段、git 工作区进度与下一步
withy next               # 推进当前节点(门禁通过才前进)
```

### 工作流模型

```text
规划(planning)            执行(execute)        收尾(finish)
brainstorm → grill-me  →   dev → check     →    finish → (完成,可归档)
```

- **两类节点**:`skill` 节点(读对应 skill 照做,做完 `withy next`,受可选 `gate` 约束)与 `switch` 节点(岔路口,由 agent 判断走哪条分支:`withy next --branch <label> --reason "..."`)。
- **门禁 `gate`(全可选)**:`artifacts`(产物存在且非空)/ `checks`(命令退出码为 0)/ `approval`(人工 `withy approve`)。任一不过则停在原节点,修复后重试。
- **hook 注入**:会话启动(`session-start`)注入工作流须知、当前状态、Next-Action 与按需上下文;每轮用户输入(`user-prompt-submit`)在无活跃任务时提醒——若是改代码的工作,先 `withy task start`。
- **知识库**:`.withy/knowledge/`(项目)与 `~/.withy/knowledge/`(全局)是一套 wiki,session 启动按需注入,`withy-knowledge` 负责维护。

### 命令速览

| 命令 | 作用 |
| --- | --- |
| `withy init` | 在项目初始化 `.withy/` 与所选 agent 平台的配置 |
| `withy task start/status/list/archive` | 创建/聚焦任务、查看状态、列出任务、归档 |
| `withy next [--branch <l> --reason <r>]` | 推进当前节点(skill 走门禁;switch 带分支) |
| `withy approve` | 为带 `approval` 门禁的节点记录人工确认 |
| `withy rewind --to <node>` | 回退到某节点(switch 判错恢复) |
| `withy knowledge graph/index/lint` | 维护知识库(关系图 / 重建索引 / 体检) |
| `withy dashboard start/stop` | 启停可视化控制台 |
| `withy hook <event>` | 平台 hook 入口(`session-start` / `user-prompt-submit`) |
| `withy update` / `withy uninstall` | 升级托管 skill / 卸载 |

> 完整命令以 CLI 自带帮助为准:`withy -h`、`withy <command> -h`。

### 开发

```bash
pnpm typecheck     # 三包类型检查
pnpm lint          # eslint(0 warning)
pnpm test          # 三包 vitest
pnpm -r build      # 构建全部包
pnpm app:dev       # 本地起控制台
```

格式化用 prettier(2 空格、`printWidth` 120、单引号、`trailingComma: all`);`.withy/` 数据与 `*.md` 文稿不纳入格式校验。

---

## English

### What is Withy

Withy is a local-first CLI and visual console for **orchestrating, running, observing, and auditing the workflows of AI coding agents**. It targets tools like Codex, Claude Code, and Gemini CLI — not to replace them, but to add a **stronger constraint layer** on top: Withy owns task state, workflow phases, stage artifacts, the execution log, and transition conditions, while the agent does the actual work inside each stage.

The core claim: **don't just tell the AI "how it should work" in Markdown — define the task lifecycle as a structured workflow and let the system decide whether a stage is complete, whether the artifacts exist, and whether the flow may advance.** Markdown (a skill) answers "how to do this step"; Withy answers "is this step actually done, and may we move on".

### Core ideas

- **Structured workflow + code-enforced gates**: the workflow is three fixed phases (plan → execute → wrap-up) plus a node graph within them. Advancing only happens via `withy next`, and a code gate (artifacts present, checks passing, human approval) decides whether to proceed — not the agent claiming "done".
- **Thin hooks, single source of logic**: platform hooks just forward to `withy hook <event>`; all decisions live in `@withy/core`, and the CLI / hooks / console are all callers, never re-implementations.
- **Observable and auditable**: every advance attempt, branch decision, skip, and rewind is appended to `events.jsonl`; decisions carry a reason and are replayable in the console.
- **Local-first, two-tier knowledge**: project data lives in `.withy/` (team-shared, committed); your cross-project knowledge lives in the global `~/.withy/` (never committed).

### Repository layout

A pnpm monorepo:

| Package | Role |
| --- | --- |
| [`packages/core`](packages/core) (`@withy/core`) | The single `.withy/` read/write layer + domain logic + types/validation + shared utils |
| [`packages/cli`](packages/cli) (`@withy/cli`, the `withy` command) | Command parsing and installer; all logic delegates to core |
| [`packages/app`](packages/app) (`@withy/app`) | Next.js visual console; reads/writes data through core |

### Quick start

```bash
# 1. Install deps and build core + cli
pnpm install
pnpm --filter @withy/core --filter @withy/cli build

# 2. Expose the `withy` command (linked from this repo)
cd packages/cli && pnpm link --global   # then use `withy` from any project

# 3. Initialize in a target project (developer identity + agent platform; writes .withy/ and agent configs)
withy init

# 4. Start a task and advance through the injected workflow state + Next-Action
withy task start "Add form validation to the login page"
withy task status        # current node, phase, git working-tree progress, next step
withy next               # advance the current node (only if the gate passes)
```

### Workflow model

```text
planning                   execute              finish
brainstorm → grill-me  →   dev → check     →    finish → (done, archivable)
```

- **Two node types**: `skill` nodes (read the matching skill, do the work, then `withy next`, subject to an optional `gate`) and `switch` nodes (a fork the agent decides: `withy next --branch <label> --reason "..."`).
- **The `gate` (all optional)**: `artifacts` (present and non-empty) / `checks` (command exits 0) / `approval` (a human runs `withy approve`). If any fails, you stay on the node and retry after fixing.
- **Hook injection**: session start (`session-start`) injects the workflow guide, current state, Next-Action, and on-demand context; each user turn (`user-prompt-submit`) nudges you — when there's no active task and this is build work, start one with `withy task start` first.
- **Knowledge base**: `.withy/knowledge/` (project) and `~/.withy/knowledge/` (global) form one wiki, injected on demand at session start and maintained via `withy-knowledge`.

### Command overview

| Command | Role |
| --- | --- |
| `withy init` | Initialize `.withy/` and the selected agent platform's config |
| `withy task start/status/list/archive` | Create/focus a task, show status, list tasks, archive |
| `withy next [--branch <l> --reason <r>]` | Advance the current node (skill → gate; switch → branch) |
| `withy approve` | Record human approval for an `approval`-gated node |
| `withy rewind --to <node>` | Rewind to a node (recover from a wrong switch call) |
| `withy knowledge graph/index/lint` | Maintain the knowledge base (graph / rebuild index / health check) |
| `withy dashboard start/stop` | Start/stop the visual console |
| `withy hook <event>` | Platform hook entry (`session-start` / `user-prompt-submit`) |
| `withy update` / `withy uninstall` | Upgrade managed skills / uninstall |

> The CLI's own help is the source of truth: `withy -h`, `withy <command> -h`.

### Development

```bash
pnpm typecheck     # type-check all three packages
pnpm lint          # eslint (0 warnings)
pnpm test          # vitest across all packages
pnpm -r build      # build every package
pnpm app:dev       # run the console locally
```

Formatting uses Prettier (2-space, `printWidth` 120, single quotes, `trailingComma: all`); `.withy/` data and `*.md` prose are excluded from format checks.
