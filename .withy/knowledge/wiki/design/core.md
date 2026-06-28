---
id: core
title: 'Core 设计(@withy/core)'
scope: project
kind: spec
tags: [withy, core, data-model, workflow, schema, store, archive]
summary: '唯一 .withy 读写层与领域/类型事实源:双层模型、用户模型、数据结构、Store API、门禁状态机(含 note/progress checker)、checklist 进度源、事件流、数据契约、InitConfig、归档。'
inject: index
injectByDefault: false
covers: [packages/core/src/**]
updated: 2026-06-21
status: stable
---

# Core 设计(@withy/core)

## 1. 为什么要这个包

`@withy/core` 是**唯一**的 `.withy/` 读写层,同时是领域逻辑层和类型/校验的事实源。CLI、app、hook 全都经它访问数据。

它是 [cli.md](./cli.md)、[harness.md](./harness.md)、[web.md](./web.md) 的共同底座——双层数据格式、用户模型、InitConfig、归档、数据契约都在本文定义。

收口的起因:最初三处各读各的 `.withy/`(cli 安装器、app 的 summary.ts、旧 py hook),且 app 自己抄了一份常量,数据格式必然漂移。现在统一走 core,CLI 已全量接入,app 接入待办(见 [[status]] K7):

```
        ┌────────────────────────────┐
        │        @withy/core         │  唯一 fs 读写 + 门禁 + 校验 + 类型 + 常量
        └───┬─────────────┬───────────┘
       @withy/cli    @withy/app
            │
   平台 hook 脚本 → withy hook → cli → core
```

铁律:**除 `core/store/*` 外,任何地方不准 `import 'node:fs'` 碰 `.withy/`。**

参考实现是 Trellis(`mindfold-ai/Trellis`)的注册表 + configurator + shared 三层、归档移目录、身份文件 gitignore 等做法。关键分歧:Trellis 不做全局、禁止在 home 运行;Withy 要做全局,故对全局安装设了安全边界(§2.3)。

---

## 2. 双层数据模型(重新设计,逐文件定义)

存在两个根,**它们不是同构的**:全局是「配置 + 项目注册表 + 模板源」,项目才是「任务事实源」。

### 2.1 全局根 `~/.withy/`(单人,不过滤用户)

| 路径                        | 格式 | git        | 内容                                                                                                            | 谁用                               |
| --------------------------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `config.yaml`               | YAML | —(在 home) | 全局默认:默认 agent/workflow、dashboard 偏好、skills 默认落地方式                                               | web 全局设置页读写;CLI init 读默认 |
| `projects.json`             | JSON | —          | 已知项目注册表 `[{path,name,addedAt}]`                                                                          | web 多项目看板的列表源             |
| `workflows/*.workflow.json` | JSON | —          | **可选**:跨项目复用的 workflow 模板                                                                             | 新项目 init 时作为模板候选         |
| `knowledge/`                | 目录 | —          | **可选**:跨项目复用的全局知识库(条目模型见 [knowledge-base.md](./knowledge-base.md));新项目 init 时作为模板候选 | 注入候选;web 知识库管理            |
| `workspace/`                | 任意 | —          | 全局个人草稿                                                                                                    | 本人                               |

全局根**没有**这些东西:tasks(已定)、workspace 名册、`.developer`(全局即本人,无需过滤)。worktree 并行已移出 MVP(方案存档见 §9.1)。

```yaml
# ~/.withy/config.yaml
# YAML 是为了允许手编时写注释;web 写回须走 yaml 的 Document/CST 模式做保留式 round-trip,勿整体重写。
version: 0.1.0
defaults:
  agent: codex
  workflow: default
  skills: link # link(软链)| copy(拷贝)
dashboard:
  host: 127.0.0.1
  port: 47321
```

```jsonc
// ~/.withy/projects.json
{ "projects": [{ "path": "/Users/yan/work/app-a", "name": "app-a", "addedAt": "2026-06-12T..." }] }
```

### 2.2 项目根 `<repo>/.withy/`(协作,过滤用户)

| 路径                            | 格式    | git                 | 内容                                                                                                                                       | 谁用                                    |
| ------------------------------- | ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `config.yaml`                   | YAML    | 共享                | 项目配置:默认 workflow/agent、任务过滤、dashboard 端口                                                                                     | web/CLI 读                              |
| `guide.md`                      | MD      | 共享                | **会话开场说明**(项目须知/Withy 介绍);session-start 注全文,用户直接编辑(harness §6.4)                                                      | hook 注入;web 编辑                      |
| ~~`context.json`~~              | —       | —                   | **(2026-06-28 取消)** 旧默认注入集;关注点拆到 guide.md / 知识 `injectByDefault` / `tasks/<id>/dispatch.json`(§4.5)                          | —                                       |
| (`.agents/agents/<role>.md`)    | MD      | 共享                | **(2026-06-28)** canonical 子 agent 角色定义(单 md,**在仓库 `.agents/` 下、非 `.withy/`**,与 skill 同提交家);core 投递到各工具目录(`.claude/agents/<role>.md` 软链、`.codex/agents/<role>.toml` 生成,§5、cli §6) | 派遣;web 注入管理页 agents 功能         |
| `workflows/*.workflow.json`     | JSON    | 共享                | workflow 定义(门禁依据)                                                                                                                    | harness 门禁;web workflow 页            |
| `knowledge/`                    | 目录    | 共享                | 项目知识库(`sources/`+`wiki/`(可分子目录)+ 每级 `index.md`+`log.md`,karpathy 模式;条目 schema 见 [knowledge-base.md](./knowledge-base.md)) | hook 注入(注索引);web 知识库管理        |
| `tasks/<id>/task.json`          | JSON    | 共享                | 任务元数据                                                                                                                                 | web 看板/详情;CLI/门禁                  |
| `tasks/<id>/dispatch.json`      | JSON    | 共享                | **(2026-06-28)** 派遣必读清单,扁平 `read` 清单(取代 context.json 节点层;§4.5)                                                            | 子 agent 直接 `Read`;web 注入管理页      |
| `tasks/<id>/state.json`         | JSON    | 共享                | workflow 进度游标(currentNode/completedNodes/decisions/**approvals**)                                                                      | web 进度;门禁推进                       |
| `tasks/<id>/<artifact>`         | MD/JSON | 共享                | agent 产物(design.md 等,**按需**)                                                                                                          | web artifact 查看;门禁 `gate.artifacts` |
| `tasks/<id>/events.jsonl`       | JSONL   | 共享                | 事件流水:验收尝试/会话注入/跳过(§4.4)                                                                                                      | web 事件时间线与统计;CLI/hook 追加      |
| `tasks/archive/<YYYY-MM>/<id>/` | 目录    | 共享                | 归档任务(整目录迁入,按归档月分桶,§9)                                                                                                       | web 归档视图                            |
| `template-hashes.json`          | JSON    | 共享                | skill 模板哈希(update 用)                                                                                                                  | CLI update                              |
| `workspace/<slug>/`             | 任意    | **共享(提交)**      | 用户级内容(草稿/笔记);**子目录名即项目成员名册**(§3)                                                                                       | 本人写;web/CLI 读名册                   |
| `.developer`                    | JSON    | **本地(gitignore)** | 当前开发者身份(对齐 Trellis `.developer`)                                                                                                  | web 默认过滤;CLI mine                   |
| `runtime/`                      | JSON    | **本地(gitignore)** | dashboard pid/port、当前任务指针 `current-task.json`(harness §7.1)                                                                         | CLI dashboard/hook                      |

`.withy/.gitignore` 固定忽略:`.developer`、`runtime/`、`*.tmp`、`*.new`。

`workspace/` **提交进仓库**(对齐 Trellis):它的子目录 `workspace/<slug>/` 集合就是项目成员名册,无需单独 `members.json`(§3)。

### 2.3 全局安全边界(Trellis 教训)

Trellis 禁止在 home 运行,因为它会在项目根建 `.claude`/`.codex`;而 home 下这些目录是 agent 自己的全局运行时,uninstall 会误删。

我们的对策:

- 全局根用**自有命名空间 `~/.withy/`**,绝不在 home 直接建 `.claude`/`.codex`/`.agent`。
- **`withy init --global` 只装 workflow 模板 + 全局 config + projects 注册表,不做任何 agent 平台适配**(不在 home 建 skill 目录)。agent 适配只在项目级发生。
- 因此 §2.1 全局根没有 `.agents/skills`、没有平台目录。skill 适配是项目级概念。

### 2.4 路径解析 API

```ts
// core/paths.ts
export interface Scope {
  kind: 'global' | 'project';
  root: string;
  withyDir: string;
}
export function resolveGlobalScope(): Scope; // ~/.withy
export function resolveProjectScope(from?: string): Scope | null; // 向上找含 .withy 的目录
export function detectWithy(path: string): boolean; // 加项目时校验
export function taskDir(scope: Scope, id: string): string;
```

`resolveProjectScope` 的优先级:显式 `from` > `WITHY_PROJECT_ROOT` > `INIT_CWD` > `cwd`,逐级向上找(吸收了已删 `context.ts` 的职责)。仓库根探测同 Trellis 的「向上找 `.withy/`」,支持嵌套仓库。

### 2.5 三处 "runtime" 命名(一名三义,不重命名,仅厘清)

"runtime" 在本仓覆盖**三件互不相干**的事,只是历史命名巧合。本轮只补文档、不改名,避免无谓的接口/路径变更。

| 名称                          | 是什么                         | 语义                                                                                                                                                                       |
| ----------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.withy/runtime/`(目录)      | 磁盘上的**瞬态状态目录**       | gitignore(§2.2);项目级存当前任务指针 `current-task.json`(workflow 走完由 `clearCurrentTaskPointer` 主动清除),全局级存 dashboard 守护态(pid/port)。换机/清理可丢,不是事实源。 |
| `workflow/runtime.ts`(代码) | 工作流状态机的 **IO 外壳**     | 读写 `.withy/`、算 gate、落盘 state/events,驱动 `stepWorkflow`;不含转移/分支/门禁*逻辑*(那在 engine/interpret/gate)。属 core,与上面的目录无关。                            |
| `cli/harness/runtime.ts`(代码) | CLI 的**输出层**             | JSON/人读格式化、`emit`/退出、scope/task/actor 解析;每条命令共用。属 cli,与上面两者均无关。                                                                                |

两点要记住:

- `.withy/runtime/` 是**瞬态**的。两个已完成任务在该目录没有产物,属设计预期(任务产物落在 `tasks/<id>/`);指针在 workflow 完成时被清。
- 代码侧两个 `runtime.ts` 只是恰好同名的「壳」:一个是状态机 IO 壳,一个是 CLI 输出壳。读码时按所在包/路径区分,别混。

---

## 3. 用户模型

总原则:**对齐 Trellis**——`.developer` 存本地身份(gitignore),`workspace/` 提交进仓库、其子目录即成员名册,不单独维护 `members.json`。项目级过滤、全局级不过滤。

```text
身份(我是谁)   .withy/.developer        本地(gitignore)  { "name":"Yan","slug":"yan","initializedAt":"..." }
名册(有谁)     .withy/workspace/<slug>/ 共享(提交)      子目录集合 = 项目成员;友好名读 <slug>/index.md 的 H1
个人内容(我的) .withy/workspace/<slug>/ 共享(提交)      草稿/笔记/私有上下文(随仓库走,换机不丢)
```

- `withy init -u <name>`:用户名来源 `--user` > `git config user.name` > 交互(同 Trellis)。写 `.developer` + 建 `workspace/<slug>/index.md`(`# <name>`),后者一提交就把「我」登记进名册。
- **名册从 `workspace/` 派生,不再有 `members.json`**:`workspace/<slug>/` 子目录名的集合就是「这个项目有谁」(都是提交内容);友好名取 `workspace/<slug>/index.md` 的 H1,缺省用 slug。这与 Trellis 一致(Trellis 也无名册文件,workspace 子目录即开发者列表)。
- 过滤口径 = **assignee**(对齐 Trellis 的 `--mine`),core 提供:

```ts
export function shouldFilterByUser(scope: Scope): boolean {
  return scope.kind === 'project';
}
export function isOwnedBy(task: Task, user: LocalUser): boolean {
  return task.assignee === user.slug || task.assignee === user.name;
}
export function listDevelopers(scope: Scope): { slug: string; name: string }[]; // 读 workspace/*/ 目录名 + index.md H1
```

不引入用户级 context 覆盖层(个性化靠全局/项目知识库,knowledge-base.md §7),也不引入名册文件,保持简单。

### 3.1 user ↔ task 关联(参考 Trellis)

Trellis 用 task.json 的 `assignee`(developer 名)关联人与任务,`--mine` 按 assignee 过滤,create 时 assignee 默认当前 developer、缺身份则报错。Withy 同构,但用 `.developer.slug` 作 key、`creator`+`assignee` 双字段:

| 字段       | 含义              | 写入时机                                                                    |
| ---------- | ----------------- | --------------------------------------------------------------------------- |
| `creator`  | 谁建的(留痕,不改) | 新建时 = 当前 `.developer.slug`                                             |
| `assignee` | 谁负责(过滤口径)  | 新建时默认 = 当前 `.developer.slug`;`task start --assignee <slug>` 指派他人 |

- **新建关联规则**:`creator = 当前 .developer.slug`;`assignee = --assignee ?? 当前 .developer.slug`。**既无 `.developer` 又无 `--assignee` → 快速失败**(对齐 Trellis「No developer set」),提示先 `withy init -u` 或显式 `--assignee`,不静默建无主任务。
- **`--mine` = assignee 过滤**(`isOwnedBy`,上方);全局根不过滤(`shouldFilterByUser`)。
- **名册校验靠 `workspace/`**:`--assignee` 的 slug 是否「在册」= `workspace/<slug>/` 是否存在(`listDevelopers`,§3);不在册可警告,不阻断——Withy 只做本地协作过滤,不做访问控制(PRD §7.10)。
- **MVP 不开独立改派命令**(`withy task assign` 已撤,cli §3.1):新建时用 `task start --assignee <slug>` 指派,事后改派手动编辑 task.json;`creator` 始终不变。

---

## 4. 核心数据结构(重新设计)

全部用 zod 定义(TS 类型 + 运行时校验)。损坏文件**快速失败**并指明路径,不静默兜底。

### 4.1 task.json

把「状态」与「归档」「完成时间」分清:归档是动作不是状态,完成有独立时间戳。

```jsonc
{
  "id": "06-12-add-auth", // <MM-DD>-<slug>,参考 Trellis 命名,人读友好且有序
  "title": "Add authentication",
  "workflow": "default", // 引用 workflows/<id>.workflow.json
  "status": "planning", // planning | in_progress | completed | cancelled(cancelled 仅归档动作可写入)
  "creator": "yan", // workspace slug;create 时 = 当前 .developer.slug(§3.1)
  "assignee": "yan", // 过滤口径(--mine);默认 = 当前 .developer.slug,可 start --assignee 指派(§3.1)
  "priority": "normal", // low | normal | high(可选)
  "tags": [], // 可选
  "createdAt": "2026-06-12T10:00:00.000Z",
  "completedAt": null, // workflow 全完成时写
  "archivedAt": null, // 归档动作时写(目录已迁入 archive/<YYYY-MM>/)
}
```

web 看板只需 `id/title/status/assignee/priority`;详情页加 `createdAt/completedAt/archivedAt`。

### 4.2 state.json(workflow 进度游标)

workflow 定义是静态的,state 是动态游标,由门禁维护:

```jsonc
{
  "taskId": "06-12-add-auth",
  "currentNode": "grill-me", // 当前待完成的节点(skill 或 switch);null=workflow 完成
  "completedNodes": ["triage", "brainstorm"], // 已完成的节点(switch 也由 agent 完成,计入)
  "decisions": {
    // 每个 switch 的判定结果(可审计/web 展示)
    "triage": { "branch": "small", "reason": "只加一个按钮", "by": "yan", "at": "2026-06-12T10:20:00.000Z" },
  },
  "approvals": {
    // 人工确认记录(gate.approval 的门禁输入),按节点 id
    "grill-me": { "approvedAt": "2026-06-12T10:25:00.000Z", "by": "yan" },
  },
  "updatedAt": "2026-06-12T10:30:00.000Z",
}
```

**phase 不进 state,而是纯派生**。节点的阶段归属是它在 workflow 里的 `phase` 字段(planning/execute/finish 之一,§4.3;画布上由所在软泳道写入,web §3.3),core 导出 `phaseOf(wf, nodeId)` 读该字段;hook/complete/task 三处共用此函数,不各算各的。

`task.status` 由 `phaseOf(currentNode)` 驱动:planning→planning;execute/finish→in_progress;`currentNode==null`→completed;未绑定阶段的节点(`phase:null`)不改 status,保持初始 planning。

返工与回退分两条路:门禁失败不改变 state,停留原节点修复后再次 complete 即返工(harness §2.4);switch 判错用 `withy rewind` 退回(harness §3.1),并连带清掉被退回节点及其下游的 `approvals`。

`approval` 并入 state、不单独存 `approvals.json`:它是门禁输入,和 `decisions` 一样属当前权威态。`withy approve` 写 `state.approvals` 并追加一条 `approval` 审计事件(§4.4)。workflow 校验拒绝带环图,state 无迭代轮次概念。

### 4.3 workflow.json(节点图:固定三阶段 + 两类节点)

workflow 由**三个固定的阶段**(planning / 执行 / 收尾,不可增删,§7.3)+ 阶段内/阶段前的**两类节点**组成。

两类节点:

- **skill 节点**:引用一个 skill(指路牌)。语义是 agent 走到这儿先读 `skill` 指向的 skill、按它做完,再 `withy next` 尝试推进。**单出**(`next`),入度不限。可选挂门禁 `gate`。
- **switch 节点**:岔路口。**靠 agent 判断**走哪条(语义判断,表达不成布尔式),每条分支自带 `criteria` 判断说明。agent 走到 switch **停下**,先用 `withy next` 查看合法分支,判定后 `withy next --branch <label> --reason "..."`;系统记 `state.decisions` 并路由(harness §2.5/§3)。必须有且仅有一个 `default` 兜底分支。

图必须**无环**:返工是停留原节点重试(harness §2.4),switch 判错用 `withy rewind` 退回(harness §3.1),validate 拒绝回边。出边内嵌为 `next`/`branches`,省去独立 `edges[]`。`entry` 是全局入口(可指任意节点),`next:null` 是终点。

阶段归属是节点上的字段 `phase`,它驱动 task.status;边的合法性另由「阶段单调」校验。画布上由所在软泳道在 drop 时写入(web §3.3),`phase:null` 表示未绑定阶段(画布归入第一条泳道「规划」显示,不改 task.status)。节点另带画布坐标 `pos:{x,y}`,自由布局、纯展示、不参与校验。

**画布不为 placement 加校验**:入口落在哪阶段、空阶段、跳过整段都按用户摆放接受(web §3.3)。

```jsonc
{
  "id": "default",
  "name": "Default Coding Workflow",
  "version": "0.3.0",
  "entry": "triage",
  "phases": [
    // 固定有序骨架:驱动 task.status + web 进度条/画布泳道
    { "id": "planning", "label": "规划", "entry": "brainstorm" }, // entry=从阶段外进入该阶段的唯一落点(单入校验)
    { "id": "execute", "label": "执行", "entry": "dev" },
    { "id": "finish", "label": "收尾", "entry": "wrapup" },
  ],
  "nodes": [
    // phase:null,未绑定阶段(画布归入「规划」带显示)
    {
      "id": "triage",
      "type": "switch",
      "branches": [
        { "label": "standard", "criteria": "常规需求,需要完整规划再开发", "default": true, "next": "brainstorm" },
        { "label": "small", "criteria": "改动小、风险低,可跳过规划直接开发", "next": "dev" },
        { "label": "research", "criteria": "只需调研、产出结论,不写生产代码", "next": "wrapup" },
      ],
    },
    // planning 阶段
    {
      "id": "brainstorm",
      "type": "skill",
      "skill": "withy-brainstorm",
      "phase": "planning",
      "next": "grill-me",
      "gate": { "artifacts": ["prd.md", "design.md"], "progress": true, "note": true },
    },
    {
      "id": "grill-me",
      "type": "skill",
      "skill": "withy-grill-me",
      "phase": "planning",
      "next": "dev",
      "gate": { "artifacts": ["prd.md", "design.md"], "progress": true, "approval": true, "note": true },
    },
    // execute 阶段
    { "id": "dev", "type": "skill", "skill": "withy-dev", "phase": "execute", "next": "check" },
    {
      "id": "check",
      "type": "skill",
      "skill": "withy-check",
      "phase": "execute",
      "next": "wrapup",
      "gate": { "checks": ["npm test"] },
    },
    // finish 阶段
    { "id": "wrapup", "type": "skill", "skill": "withy-finish", "phase": "finish", "next": null },
  ],
}
```

| 节点字段   | 适用        | 语义                                                                                                                                                           |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | 全部        | `skill` \| `switch`                                                                                                                                            |
| `skill`    | skill       | 引用的 skill 名(§5 发现/解析;只存名,不存路径/来源)                                                                                                             |
| `agent`    | skill       | **可选**(2026-06-28 派遣轮):本步由该角色子 agent 执行(角色名,对应 canonical `.agents/agents/<role>.md`);省略=主会话自己干;一节点一 agent;解析不到角色 → warning 不拦(同 skill 悬空,经 validate `agentExists` 回调,harness §7.2) |
| `next`     | skill       | 唯一后继 id;`null`=终点                                                                                                                                        |
| `branches` | switch      | `[{label, criteria, next} \| {label, criteria, default:true, next}]`;**必须有且仅有一个 default**(validate 强制)                                               |
| `criteria` | switch 分支 | 该分支的判断说明(给 agent 看,据此选路)                                                                                                                         |
| `gate`     | skill       | **可选**门禁:`{ artifacts?: ArtifactSpec[], checks?: string[], approval?: boolean, note?, progress?, curated? }`(§4.3.1;`curated` 为可选 curation 门禁,查 `dispatch.json.read` 非空,§4.5;`ArtifactSpec`=`string \| {path,title?,template?}`);大多数节点不写 |
| `phase`    | 全部        | 阶段归属(驱动 task.status;画布上由所在软泳道写入,web §3.3);`null`=未绑定阶段,不改 task.status(画布归入「规划」带显示)                                          |
| `pos`      | 全部        | 画布坐标 `{x,y}`(编辑器维护,纯展示、不参与校验;`x` 自由、`y` 为所在泳道内相对带顶的偏移,见 web §3.3)                                                           |

**switch 不再自动求值、不再读 signal**:harness 走到 switch **停下**,把各分支 `criteria` 输出给 agent。agent 判定后用 `withy next --branch <label> --reason` 报出;非法分支/缺 `--branch` → 门禁失败(exit 2)停下重判;判定记 `state.decisions[node]={branch,reason,by,at}` + 一条事件(§4.4)。一个 workflow 含多个 switch 互不影响(各记各的 nodeId)。原 `decision`/`signal`/`decision.json#/...`(JSON Pointer)/「三类信号源」模型**已废弃**(harness §2.5)。

#### 4.3.1 门禁 `gate`(可选,确定性核对)

```jsonc
"gate": {
  "artifacts": [                // 这些文件要在、且非空(只核存在性,不校内容)
    "design.md",                //   简写:仅路径(向后兼容)
    { "path":"design.md", "title":"设计文档", "template":"design-template" }  // 对象:带展示名 + 模板引用
  ],
  "checks":    ["npm test"],    // 这些命令要退出 0(直接写命令字符串)
  "approval":  true,            // 需 withy approve 当前节点(记入 state.approvals[currentNode])
  "note":      true,            // 需本轮 `withy note` 小结(新鲜度 floor 判定,[[node-gate-checkers]])
  "progress":  true             // 需非空实施计划 checklist.json(progressChecker → readProgress)
}
```

五项全可选,没 `gate` 的节点做完直接 complete。

**产物只核「存在 + 非空」(L1)**:挡住忘产出、空文件,确定性、便宜、不误判。**内容对不对不由门禁判**(避免引入模型不确定性或 schema 引擎),交给 `approval`(人看)或 `checks`(校验命令)。

**门禁 = checker 注册表**:加一种门禁 = 加一个 `Gate` 字段 + 一个 checker(`workflow/gate.ts`),不动引擎/步进策略。`note`/`progress` 两种新门禁的算法(note 新鲜度 floor、progress 为何不复用 artifacts AND-list)见 [[node-gate-checkers]]。

**artifact 项的两种写法(`ArtifactSpec`)**:可为纯路径字符串(向后兼容),或对象 `{ path, title?, template? }`。`title` 是 web 展示名(画布节点列「本步产出:设计文档」);`template` 引用一条 `kind:template` 的知识 id(knowledge-base.md §4.1),供 session-start 把模板正文注给 agent、web 预览/编辑模板。

**门禁只看 `path`(存在 + 非空)**:`title`/`template` 纯展示与注入用,不参与放行,红线不动。产物「长什么样」归模板(knowledge),「怎么做出来」归 skill,workflow 只声明「要哪些产物 + 引哪个模板」,不内联 prompt 正文(职责分离,harness §5)。

#### 4.3.2 节点类型内置描述(core 常量,不写进 workflow.json)

每种 `type` 对应一份固定 `desc`,渲染 workflow 给 agent 读时附上,告诉它「这类节点数据干嘛用」:

```ts
const NODE_TYPE_DESC = {
  skill: '技能节点 —— 进入后先读 skill 指向的指引,按它完成本步,门禁齐全后 `withy next` 推进。',
  switch:
    '判断节点 —— 对照各分支 criteria 判断当前任务命中哪条,执行 `withy next --branch <label> --reason "..."`;default 兜底。',
};
```

### 4.4 events.jsonl(事件流水,审计与统计数据源)

run 模式已移除(交互模式唯一,Withy 不启动/托管 agent 进程),`events.jsonl` 是执行过程的唯一记录。

写入与存储约定:

- 按时间追加,单进程顺序写,普通 `appendFile`、不上锁(不考虑同任务多窗口并发推进)。
- 一行一条紧凑 JSON,reason 截断约 200 字,不存大块内容/产物正文。
- **随任务目录提交进 git**,换环境不丢任务可视内容。
- 写入方:CLI(`next`/`approve`/`rewind`/`note`/`checklist done`/`task start`)与 hook(`session-start`/`user-prompt-submit`);读取方:web 事件时间线与统计页。

`TaskEventSchema` 是按 `type` 分立的 `z.discriminatedUnion`。**新增类型/字段一律前向兼容**:新字段 optional、`readEvents` 对每行 `safeParse`,解析失败即跳过(老 core 读到新类型静默丢弃、不抛),无需迁移已写数据。事件全貌与会话回填见 [[task-event-timeline]]。

```jsonc
{"ts":"...","type":"complete_attempt","node":"check","ok":false,"reason":"check tests failed (exit 1)"}
{"ts":"...","type":"complete_attempt","node":"check","ok":true}                                      // 成功无需 reason
{"ts":"...","type":"complete_attempt","node":"finish","ok":false,"reason":"当前应完成 check"}        // 喊错节点 = 跳步证据
{"ts":"...","type":"decision","node":"triage","branch":"small","reason":"只加一个按钮","by":"yan"}    // switch 判定
{"ts":"...","type":"rewind","node":"triage","by":"yan","reason":"判错了"}                             // switch 回退(harness §3.1)
{"ts":"...","type":"approval","node":"grill-me","by":"yan"}                                           // 人工确认(同时写 state.approvals)
{"ts":"...","type":"session_start","injected":["api-conventions","tasks/06-12-add-auth/design.md"],"snapshot":"# Withy…"}  // snapshot 截断 SNAPSHOT_MAX(4000),optional
{"ts":"...","type":"task_created","by":"yan"}                                                         // 时间线起点;ts=createdAt,仅 task start 新建路径写
{"ts":"...","type":"note","node":"dev","summary":"实现登录锁定","by":"yan"}                           // 节点小结,note 门禁证据([[node-gate-checkers]])
{"ts":"...","type":"prompt","text":"帮我加登录锁定"}                                                  // 用户消息原文,截断 PROMPT_MAX(500),仅有活跃任务时
{"ts":"...","type":"checkpoint","id":"3","text":"连续错误5次锁定"}                                    // checklist 条目未完成→完成时落
{"ts":"...","type":"skip","node":"check","by":"yan","reason":"flaky check,人工放行"}
```

字段约定:`by` 只在人工动作/判定上记(取 `.developer.slug`);成功 complete 不记 reason(state 已有结果);命令输出只在失败 `reason` 里截尾,不存全量。

**state 与 events 不是重复,形态和职责不同**:

- `state.json` 是**当前快照**(覆盖式,只留最新游标,门禁/推进读它)。
- `events.jsonl` 是**全程流水**(追加式,记下所有 state 里没有的东西:失败尝试、注入清单、跳过/回退的原因与时间)。
- 仅「成功完成的节点 / switch 判定」在两者间轻微重叠(events 多带时间戳),换来完整有序时间线。
- 两个都留:删 events 丢审计/告警/hook 生效性,删 state 则每次定位要重放日志(慢且脆)。

三类用途:

- **重试告警线**(从 events 派生、不进 state):对当前节点数「自上次 ok:true 或进入该节点以来连续的 `ok:false` 次数」,超过 `config.json` 阈值 → 看板标黄;一次成功 complete 或一次 rewind 清零;**门禁本身永不自动放行**(harness §2.4)。
- **跳步/遵从率统计**(P2 统计页):节点失败率、平均重试、最常缺产物。
- **hook 生效性判断**:有 `session_start` 即 hook 已触发,`injected` 与计划注入对比;整段会话事件缺失 = hook 根本未触发。

### 4.5 dispatch.json(派遣必读清单,扁平 read 清单,2026-06-28 取代 context.json)

旧 `context.json`(default/node 注入集)**取消**;其三关注点拆分到三处(knowledge-base §7、harness §4/§7.2):session-start 可配文案 → `.withy/guide.md`;全局常驻标准 → 知识条目 `injectByDefault`;**每任务的派遣必读 → 任务目录下的 `dispatch.json`(扁平 `read` 清单,不分角色)**。

```jsonc
// tasks/<id>/dispatch.json —— 扁平,所有被派子 agent 共读这一份
{
  "read": [
    { "id": "api-conventions", "description": "接口/命名/导出风格规范的梗概" },  // 引用知识条目 id
    { "artifact": "design.md", "description": "本任务的技术设计梗概" },           // 引用任务内产物名
  ],
  "_help": "填 read:[{id|artifact, description}];description 写文档梗概,子 agent 据梗概自判细读……",
}
```

- **扁平、不分角色**:一份 `dispatch.json`,所有被派子 agent 读同一份;条目 `{id, description}` 引知识、`{artifact, description}` 引产物;`description` 是文档梗概(子 agent 据梗概自判细读、读多了无妨)。
- **子 agent 直接 `Read`,不加命令**:子 agent 纯文件读这一份(守 PRD 边界:子 agent 不调 withy 命令),**无 `--role`、不切片、不隔离**。
- **内容只放稳定规范**:知识 id + 任务产物名;**禁列代码路径**——代码子 agent 现读,实例范围(哪片代码/哪几个 checklist 项)走派遣提示词规范(harness §7.2),不进清单。
- **种壳 = core 在任务创建时做**:core 读 workflow 文件(有整张图),只要有节点配 `agent` 就种 `{_help}` 壳(`_help` 非清单项 → 消费/门禁忽略);web 给节点新加 agent 时 core 在 relay/门禁处幂等懒补壳。**curate(填 `read`)由主 agent 执行期按需做**,不填走 design.md 兜底;硬性强制挂可选 curation 门禁(`gate.curated`,§gate)。
- **按知识 id 引用,不按裸路径**(复用 Withy 知识索引)。dispatch.json 不做悬空 lint(子 agent 按 description 自判、读不到就跳过)。
- 人工确认记录(approvals)并入 `state.json`(§4.2);无 `members.json`(名册由 `workspace/<slug>/` 派生,§3)。
- **会话须知(guide.md)**:工具文件 `.withy/guide.md`,session-start 直接读取注全文(§2.2、harness §6.4);web「注入管理页」可编辑(web §3)。

### 4.6 分支判定记录(已并入 state.decisions,不再有 decision.json 产物)

switch 的判定**不产出独立 artifact**,直接由 agent 经 `withy next --branch <label> --reason` 报出,记入 `state.decisions[node] = { branch, reason, by, at }`(§4.2)+ 一条 `decision` 事件(§4.4)。

它是**可见、可审计**的:web 在节点上展示「判定为 small → 走 dev,因为:只加一个按钮」,用户能看到为什么走这条。原 `decision.json` 产物 + `signal` JSON Pointer 取值模型**已废弃**(harness §2.5)。

### 4.7 checklist.json(实施计划:命令托管,web 只读展示)

任务的实施顺序与当前进度需要在 web 上可见。**用 `tasks/<id>/checklist.json` 承载有序实施计划**,由 `withy checklist add/done/undone/edit/remove/list` 命令族托管(cli §3.3),提交进 git。

它**已彻底取代旧的 agent 手写 `implement.md`**:原 markdown 复选框解析路径(`implementationProgress`/`unparsed`、`readImplementation`)已删,既有任务一次性迁移(旧 md → checklist.json,保留 done)。命令侧 schema 之所以这次回归,是它现在是**唯一进度源**(供 progress 门禁 + 归档 + dashboard 共用),不再是「检索=agent 自读文件」那类纯文档。

```jsonc
// tasks/<id>/checklist.json —— 命令托管,web 只读渲染进度
{
  "nextId": 4,                       // 单调递增,id 永不复用(删除不重编号)
  "items": [
    { "id": "1", "text": "实现登录失败的明确错误提示", "verify": "pnpm test auth", "done": true },
    { "id": "3", "text": "实现连续错误 5 次锁定 5 分钟", "verify": "pnpm test auth-lockout", "done": false }
  ]
}
```

设计要点:

- **唯一进度源(`store/checklist.ts:readProgress`)**:仅读 `checklist.json`——文件存在即权威(零条目=0/0),缺文件 → `source:'none'`。喂 progress 门禁、归档校验(§9.2)、dashboard 计数与详情列表,**一处派生处处共用**。
- **id 单调、永不复用**:`nextId` 只增;`add` 分配 id 并即时回传(`--json`),agent 手中始终持有当前条目+id,`list` 仅用于断线重连重新对齐。
- **唯一落事件的是 `done`**:对「未完成→完成」的 id 各落一条 `checkpoint` 事件(已 done 幂等不重复);`add/undone/edit/remove` 不落事件;坏 id 在 `markChecklist`/`assertKnown` 处报错非静默。
- **职责不重复**:`prd.md` 写需求与验收标准,`design.md` 写技术方案与边界,`checklist.json` 写按依赖排序的实施步骤及逐步验证。
- **守红线**:checklist 完成度**不**挂在任何节点 gate 上(`dev`/`check`/`finish` 无 checklist 门);唯一与放行相关的是 **progress 门禁**(只核「存在非空计划」,不核全勾)与**归档校验**(`withy task archive` 要求无未完成项,空清单视为通过,§9.2)。规划「有没有计划」与归档「计划做没做完」分属两道关,见 [[node-gate-checkers]]。
- **不入 task.json**:元数据保持干净(对齐 Trellis),进度由 core 实时从文件派生。
- **坑:浅拷贝共享内嵌数组**——`readChecklistOrEmpty` 的空值必须**每次新建**结构(`() => ({ nextId:1, items:[] })`),不能 spread 一个模块级常量(`{...EMPTY}` 只浅拷贝顶层,`items` 仍是同一引用 → 跨任务串数据,[[node-gate-checkers]] §4)。

---

## 5. Store API(唯一碰盘层)

repository 风格,全部接 `Scope`。这是 §1 铁律的落点,CLI/app 共用,无第二套读盘实现。

```ts
// 读
listTasks(scope, { includeArchived? }): Task[];
readTask(scope, id): Task;   readState(scope, id): State;
readWorkflow(scope, id): Workflow;   readGuide(scope): string | null;   readDispatch(scope, taskId): DispatchConfig | null;
readEvents(scope, taskId): TaskEvent[];   readArtifact(scope, taskId, rel): string;   // readEvents 逐行 safeParse,坏行跳过(§4.4)
readChecklist(scope, taskId): Checklist | null;   readProgress(scope, taskId): ProgressView;   // 唯一进度源:仅读 checklist.json(§4.7),缺文件→source:'none'
listDevelopers(scope): Developer[];   listProjects(): ProjectRef[];   // 名册读 workspace/*/(§3);projects 全局
readCurrentTask(scope): string | null;   // runtime/current-task.json 指针(harness §7.1)
discoverSkills(scope): DiscoveredSkill[];   // 在 skills.ts;扫项目目录 + 各 agent home 目录(§5.1)
// 子 agent 发现/解析/角色定义读写(agents/agents.ts;§5.2)
discoverAgents(scope): DiscoveredAgent[];   resolveAgentRef(scope, role);   agentExists(scope, role): boolean;
readAgentDefinition(scope, role): string | null;   getAgentDeliveryStatus(scope, role): AgentDeliveryStatus[];
// 写
writeTask(scope, task);   writeState(scope, state);   appendEvent(scope, taskId, event);
writeWorkflow(scope, workflow);   // workflows/<id>.workflow.json;zod 校验后落盘(web 画布保存,§4.3)
writeGuide(scope, body);   writeDispatch(scope, taskId, config);   seedDispatchShell(scope, taskId, wf);   // guide.md / dispatch.json 写 + 幂等种壳(§4.5)
writeAgentDefinition(scope, role, content);   removeAgentDefinition(scope, role);   // canonical .agents/agents/<role>.md(web agents CRUD,§5.2)
deployAgents(scope, role?): string[];   removeAgentDelivery(scope, role): string[];   // 跨工具投递/解除(format handler 注册表:md 软链 / toml 生成,§5.2)
approveNode(scope, taskId, node, by);   archiveTask(scope, id, { markCancelled? });   // §9;approval 写 state.approvals + 事件,见 harness §2.6
recordNote(scope, taskId, summary, by?): string;   // note 门禁证据:落 note 事件(currentNode 为 null 抛错),返回节点 id([[node-gate-checkers]])
addChecklistItems / markChecklist / editChecklistItem / removeChecklistItems(scope, taskId, …);   // task/checklist.ts:单调 id、done 落 checkpoint、坏 id 报错(§4.7)
writeCurrentTask(scope, taskId);   clearCurrentTask(scope);   assignTask(scope, taskId, slug);   // §3.1 改派
upsertProject(path);   // 名册无写 API:`workspace/<slug>/` 由 init 建、随仓库提交即登记(§3)
// 会话注入回填(runtime/sessions/<sid>.json,transient/gitignored,[[task-event-timeline]] §3)
writePendingInjection / claimPendingInjection / sweepPendingInjections(scope, …);   // hook 无任务时暂存,task start 按 session-id 认领回填 session_start;safe-charset session id,损坏即 no-op
```

> **resolvePlannedContext 重构(2026-06-28)**:`session/context.ts` 的 `resolvePlannedContext(scope)` 不再读 context.json,改扫该 scope 知识页取 `injectByDefault:true` 的(全局常驻聚合,本轮新建消费方);`readContextConfig`/`ContextConfig` schema/context.json 的 knowledge lint 一并移除(§4.5、knowledge-base §7)。

### 5.1 Skill 发现(跨 agent + 项目/全局,带 tag)

workflow 编排 skill,需要列出本地都有哪些 skill。

注意:**全局 skill 不在 `~/.withy/`**(§2.3 安全边界:全局根永远不放 agent 目录),而在各 agent 自己的 home 目录(`~/.claude/skills/` 等)。这是 **core 的读能力**(消费方是 web 画布的 skill 下拉,不暴露成 `withy` 命令),按注册表 `skillDirs` 静态目录扫描,每条带来源 tag:

```ts
// 已实现:按真实安装名去重,合并多处安装位置到 paths[]
export interface DiscoveredSkill {
  name: string; // 真实安装目录名(含 withy- 前缀,如 `withy-dev`);非 withy skill 用其自身目录名
  description?: string; // 解析 SKILL.md frontmatter 的 description
  source: 'project' | 'global'; // 项目目录 vs agent 的 home 目录
  paths: string[]; // 该 skill 被发现的所有目录(同一 skill 可装在多个工具)
}
export function discoverSkills(scope: Scope): DiscoveredSkill[]; // 项目 scope;扫 project 组 + home 组
export function resolveSkillRef(scope: Scope, skill: string): { name: string; path: string }; // 解析不到则抛错
```

> 富化项(待补,P1):每条按 `agent`(canonical/codex/claude)再细分 tag,供 web 画布按工具分组——当前基础版只给 `source` + 合并的 `paths`。

**目录来源是单一数据源**:由 `agents/registry.ts` 的 `getProjectSkillDirs()`/`getGlobalSkillDirs()` 从 `AGENT_PLATFORMS.skillDirs` 派生,不在 skills.ts 再抄一份。project 组相对项目根解析,global 组相对用户 home 解析。扫描 + 解析 frontmatter 的逻辑落在 **core(`skills.ts`)**,不在 configurator(cli.md §6.2)。

**按真实安装名去重展示(所见即所存)**:`discoverSkills` 直接用 skill 的真实目录名(`withy-dev`、`composition-patterns` 等),不再剥 `withy-` 前缀。同一 skill 在多工具目录铺多份时,名字相同就折叠成一条、保留多来源 `paths`(画布下拉显示真实名 + 来源 tag)。**workflow 节点的 `skill` 字段也存真实安装名**(画布所见即所存),消除了「逻辑名 ↔ 安装名」两套命名的转换层与由此产生的错配。`logicalSkillName`(剥前缀)仅保留给 relay 的幂等归一兜底。

**relay 与解析的命名**:

- `describeNext` 这个 agent 接力出口,把 `node.skill` 经 `getBundledSkillName(logicalSkillName(...))` **幂等归一**为真实安装名再交给 agent。workflow 已存真实名故是直通,旧的逻辑名 workflow 也能被补成 `withy-<base>`,绝不双前缀。
- `resolveSkillRef(scope, skill)` 对真实名与旧逻辑名两种写法都容错(同时试 `skill` 与 `withy-<skill>`),按当前平台的 skill 目录解析到具体一份(各工具用同名的自己那份,不跨读别的工具目录)。
- **解析不到则报错**:validate 期对所选工具校验、运行时对当前平台校验(harness §5)。web 经 `GET /api/skills` 取去重后的名称列表、用 `agent`/`source` tag 分组(web §3.3)。

### 5.2 子 agent 发现 + 跨工具投递(格式驱动,2026-06-28)

类比 §5.1,但角色是**单 md 文件**(`.agents/agents/<role>.md`),非「带 SKILL.md 的目录」:

- **发现**:`discoverAgents(scope)` 扫 canonical `.agents/agents/*.md` + 各平台 `agentDef.target` 目录,按角色名去重(Claude 软链与 canonical 同名 → 合一);`resolveAgentRef`/`agentExists` 供节点 `agent` 校验(悬空 → validate `agentExists` 回调出 warning 不拦,harness §7.2)。
- **投递(core,cli + web 共用)**:`deployAgents(scope, role?)` 按目标工具格式分路——**format handler 注册表** `{ markdown: 文件级软链, toml: md→toml 生成 }`,平台只声明 `agentDef{target, format}`。Claude=markdown(`.claude/agents/<role>.md` 软链到 canonical)、Codex=toml(读 canonical frontmatter+正文生成 `.codex/agents/<role>.toml`)。幂等:目标已是当前态则跳过;canonical 变了重新生成 toml。新工具 = 加一条 `agentDef`(复用已有 handler)或一个新 handler,**主投递流程不变**。
- **删除/状态**:`removeAgentDelivery` 解除各工具投递;`getAgentDeliveryStatus` 报告每平台态(linked/generated/stale/missing),供 web different-tool 视图(web §6.3)。

```ts
export interface DiscoveredAgent { name: string; description?: string; source: 'project' | 'global'; paths: string[]; }
export interface AgentDeliveryStatus { platform: string; format: 'markdown' | 'toml'; target: string; state: 'linked' | 'generated' | 'stale' | 'missing'; }
```

---

## 6. Workflow:门禁与状态机

确定性核心,纯函数 + 单测。流程见 harness.md §2/§3。

**业务与状态机分层(编译式通用引擎)**,按职责拆成几个文件:

- `workflow/engine.ts`:通用有限状态机(状态/带 guard 的转移/游标,零 Withy 类型,有 `engine.test.ts`)。
- `workflow/interpret.ts`:Withy 适配层,把 `Workflow` 编译成 engine 的 `MachineDef`、把 engine 结果解释为 state/事件(有 `interpret.test.ts`)。
- `workflow/gate.ts`:门禁 checker 注册表,加门禁种类=加一个 checker;现含 artifacts/checks/approval/**note/progress** 五个 checker,IO 经 `GateContext` 注入保纯函数可单测。
- `workflow/runtime.ts`:IO 壳,读写 `.withy/`、算 gate、落盘 state/events;`hasFreshNote`/`hasProgress`/`recordNote` 在此。
- `workflow/validate.ts`:图校验。任务级的 `resolveCurrentTask`/`archiveTask`/派生指标在 `task.ts`。

分层带来的修改边界:**改 workflow 字段/分支语义只动 interpret,改/加门禁只动 gate,engine 永不重写。** note/progress 两种新门禁的算法见 [[node-gate-checkers]]。

```ts
nextNode(scope, taskId, opts?): NextResult;                   // 唯一推进入口(runtime):读取 state.currentNode;skill 走门禁,switch 需 opts.branch
compileWorkflow(wf): MachineDef;              // interpret:把 Workflow 编译为通用 engine 定义;engine.send 做转移(switch=无匹配事件→停)
rewindTo(scope, taskId, nodeId): State;       // switch 判错恢复:`withy rewind --to <node>` 退游标回目标节点、清下游 completed+approvals、记 rewind 事件(harness §3.1)
approveCurrentNode(scope, taskId, by): State; // 写 state.approvals[currentNode] + 追加 approval 事件(harness §2.6)
resolvePlannedContext(scope, taskId, nodeId): PlannedEntry[];  // 合并 global injectByDefault→项目 default→node(knowledge-base.md §7);每项带 {id, mode:'full'|'index', ...}(§4.5)
resolveSkillRef(scope, skill): { path: string };        // 名→具体 skill;解析不到则抛错(harness §5,缺则报错)
resolveCurrentTask(scope, explicit?): string | null;    // --task > 指针 > 唯一未完成兜底;多个未完成→AMBIGUOUS(harness §7.1)
phaseOf(wf, nodeId): string | null;           // 节点的阶段归属(读 node.phase);驱动 task.status(hook/complete/task 共用)
readProgress(scope, taskId): ProgressView;     // 唯一进度源:仅读 checklist.json;progress 门禁 + 归档 + web 进度(§4.7)
archiveTask(scope, taskId, { markCancelled? }): void;   // §9
export interface NextResult { ok: boolean; exitCode: 0 | 2; message?: string; state?: State; }
```

`nextNode` 的要点:

- **唯一推进入口**:`nextNode` 不接收 nodeId,只读取 `state.currentNode` 作为待完成节点,命令层表现为 `withy next`。这样 agent 不需要记节点名,也不能喊错节点。CLI `complete <node>` 明确删除,不保留兼容入口。
- **skill 节点**:核对 `gate`(artifacts 存在+非空 / checks 退出 0 / approval 已写),全过则 `advanceWorkflow` 沿 `next` 推进。
- **switch 节点**:无 `opts.branch` 时不推进,返回合法分支与 `withy next --branch <label> --reason "..."` 提示;有 branch 时要求它是合法分支(否则 exit 2),记 `state.decisions[node]={branch,reason,by,at}` + `decision` 事件,沿该分支 `next` 推进。

`stepWorkflow`(interpret)把一个 Withy action 映射成 engine 事件,交 `engine.send` 沿匹配的 transition 走一步:

- skill 节点发 `advance`(gate 编译成 guard)。
- switch 节点发分支标签,**无匹配事件即停下**(等 agent 判定);到终点(`target:null`)置 `currentNode=null`。**switch 不再由 harness 自动求值**(原 `evaluateDecision`/`readSignal`/signal 三源已废弃,harness §2.5/§3)。
- **门禁失败不改变 state**;每次推进尝试(成败)都 `appendEvent`(§4.4)。成功时返回的 state 用于拼装「下一节点接力 JSON」(harness §2.3)。
- `phaseOf` 在游标落入新阶段时驱动 `task.status` 翻转。纯函数 + 单测,确定性核心(K4)。

---

## 7. 数据契约(机制,不绑每步产物)

契约描述四方之间的**数据通道**,**与具体 step 无关**。它不规定「每步必产什么」——那是各 workflow 的自由,由节点的 `gate.artifacts` 声明(**可为空**)。

| 角色      | 职责                                            | 数据通道                                     |
| --------- | ----------------------------------------------- | -------------------------------------------- |
| AI(agent) | 干活;**若**该节点声明了 `gate.artifacts` 则产出 | task 目录文件                                |
| CLI/core  | `nextNode` 推进 state;CLI/hook 记事件           | state.json / events.jsonl                    |
| Web       | 读并展示 state/event/artifact;提供操作入口      | 只读 + 操作按钮                              |
| 用户      | approve / 跳过 / 归档;回写影响下次门禁          | state.approvals / events.jsonl / archiveTask |

**产物按需**:节点没声明 `gate.artifacts` → 门禁不查(纯执行/review 可零产物);声明了 → 缺(或空)则失败。默认 workflow 给 planning 配 `design.md` 等只是默认 workflow 的选择,非契约强制。

契约不变量(始终成立):

1. **agent 自称完成 ≠ 节点完成**,完成只由 core 门禁判定;`withy next` 读取当前游标,调用者不传 node。
2. CLI `complete` 删除,避免绕回显式节点参数。
3. 门禁永不自动放行,人工跳过必须显式(`--skip`)且留痕。
4. 计划注入与实际注入(`session_start` 事件的 `injected` 清单)的差异、以及事件缺失,是发现 hook 失效的信号,事件必须记录。

**web 操作如何对应 harness 流转**:web 的 approve/归档回写 `.withy/`,被下一次 `nextNode` 读到从而影响门禁——这是 web 与状态机唯一耦合点。

---

## 8. InitConfig:CLI 与 Web 共用的初始化模型

把「初始化的选择」抽成一个结构化对象,**三种输入产出同一个 `InitConfig`,再统一执行**,从根上统一 CLI 与 web 的初始化逻辑(诉求 1)。

```ts
// core/init-config.ts
export interface InitConfig {
  scope: 'project' | 'global';
  agents: AgentId[]; // 选中的 agent(全局模式恒为 [],不配 agent)
  skills: 'link' | 'copy'; // skill 落地方式(原 skill-mode,改短)
  user?: string; // 本地身份名(全局模式忽略)
}
```

```text
        三种输入                          统一出口
  CLI flag(--codex --claude --copy -u) ┐
  CLI 交互(inquirer/readline)          ├─► InitConfig ─► initProject(config)
  Web 表单(POST body)                  ┘         │
                                                 └─► serializeToCommand(config)
                                                     → "withy init --codex --claude -u yan"
```

- **统一问题定义**(供 CLI 交互与 web 表单同源渲染),数据从 agent 注册表派生(cli.md §6):

```ts
export const INIT_QUESTIONS = [
  {
    key: 'agents',
    type: 'multiselect',
    message: 'Select AI tools',
    choices: () => agentChoices(),
    default: () => defaultCheckedAgents(),
  },
  { key: 'skills', type: 'select', message: 'Skill install', choices: ['link', 'copy'], default: 'link' },
  { key: 'user', type: 'text', message: 'Your name', default: () => gitUserName() },
];
```

- `serializeToCommand(config)`:web 选完后展示等价命令 `withy init --codex --claude -u yan`,也用于「web 触发 init」时 spawn 的参数(web.md §2.4)。
- web 触发 init 的请求体为 `{ path, config: InitConfig }`:目标路径是 web 场景特有输入,**不进入 InitConfig 本体**(web.md §2.4)。
- flag 形态参考 Trellis:**每个 agent 一个布尔 flag**(`--codex`/`--claude`),不用 `--agents codex,claude`(诉求 2)。
- `skills` 取代冗长的 `skill-mode`;CLI 侧默认 `link`,`--copy` 切到独立副本。

---

## 9. 任务工作树与归档

### 9.1 worktree 多任务并行(已移出 MVP,方案存档)

worktree 并行已推迟(2026-06-13 评审决定):`task.json` 不含相关字段、store 不含 worktree API。回归时按以下**已确认方案**实施,不再重新设计:

- **`.withy/` 的事实源永远是主仓库工作树**:`resolveProjectScope` 识别 git worktree(`.git` 为文件而非目录)并经 commondir 重定向到主仓库根;cwd 只决定代码在哪改。否则 worktree 内的 `.withy/` 副本会接收状态写入,导致僵尸看板、合并冲突、approval 读不到。
- **创建 worktree 时 `git sparse-checkout` 排除 `.withy/`**:分支提交永不触碰任务数据,合并回 baseBranch 时 `.withy/` 零冲突。
- **cwd ≠ scope.root 时 hook/CLI 输出绝对路径**:注入上下文与产物写入都指向主仓库。
- 生命周期:**Withy 不做合并**;归档仅校验分支已合入(`git merge-base --is-ancestor`),未合入则拒绝或 `--force` 放弃;合并本身留给用户/finish 节点(PR 或本地 merge 是用户偏好)。
- 位置是实现细节(倾向 `~/.withy/worktrees/`,不污染仓库);事实源规则不依赖位置。

### 9.2 归档(校验终态 + 实施清单全完成,不改进度)

**归档 = 校验任务已收束 + 写 archivedAt + 移动整个任务目录**。归档是动作不是状态(`archivedAt` 与 `status` 正交),且**归档不推进、不改写进度**:完成由 `withy next`(游标走过 finish→`currentNode=null`→`deriveStatus`=completed)落定,归档只做终态校验。

```text
withy task archive <id> [--cancelled]  /  web 归档按钮
  → core.archiveTask(scope, id, { markCancelled? }):
      1. 读 task.json;若已 archived → 报错(幂等保护)
      2. 终态校验(非 --cancelled 时):
         a. status 必须为 'completed'(否则报错,提示先 `withy next` 走完 finish)
         b. checklist.json 的实施清单无未完成项(`readProgress` 核 done==total,否则报错列出剩余条数)
         空清单(无 items 或缺文件)视为通过,避免无清单任务被永久锁死
      3. --cancelled:跳过上述校验,直接把 status 标记为 'cancelled'(放弃半成品)
      4. 写 archivedAt=now;status 仅在 --cancelled 时变为 cancelled,否则保持 completed(归档不改它)
      5. 移动目录:tasks/<id>/ → tasks/archive/<YYYY-MM>/<id>/(按归档月分桶,对齐 Trellis)
  → create 的同名检测只查活跃任务目录;归档区跨年同 id 靠分桶路径天然共存
```

要点:

- **只有 completed 任务可正常归档**:校验而非推进;未完成任务必须先 `withy next` 走完,或用 `--cancelled` 显式放弃(记为 cancelled)。这保证归档区不混入「半成品却标着进行中」的脏数据。
- **实施清单全完成是归档的内置校验,不是节点门禁**:checklist 完成与否**不**在任何节点 gate 上(`dev`/`check`/`finish` 无 checklist 门),只在 `withy task archive` 时统一兜底核对(§4.7)。
- **Withy 永不执行 `git add`/`git commit`**;`.withy/` 变更跟随用户的正常代码提交(finish skill 仅提醒,动手的是用户或 agent)。
- `listTasks` 默认不含归档;`includeArchived` 时合并 `tasks/archive/*/*`。
- web 看板默认不显示归档,归档视图区分 completed/cancelled;归档详情的「所在节点」对已完成任务回退显示其最后完成的节点(如 `finish`,web §3.3)。

---

## 关联

- 落地状态(各域已完成/未完成清单):[[status]]
- note / progress 门禁算法、checklist 进度源细节:[[node-gate-checkers]]
- 事件模型全貌与会话注入回填:[[task-event-timeline]]
- 命令面、注册表与 configurator:[[cli]]
- 状态机流程、门禁、hook 三阶段注入:[[harness]]
- web 控制台与画布:[[web]]
- 知识库目录模型、条目 schema、注入:[[knowledge-base]]
- 测试与构建约定:[[testing-build-conventions]]
