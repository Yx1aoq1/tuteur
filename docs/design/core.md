# Core 设计(@tuteur/core)

> 定位:实施规格级。`@tuteur/core` 是**唯一**的 `.tuteur/` 读写层、领域逻辑层与类型/校验事实源。CLI、app、hook 全经它访问数据。
> 本文是 [cli.md](./cli.md)、[harness.md](./harness.md)、[web.md](./web.md) 的共同底座 —— 双层数据格式、用户模型、InitConfig、归档、数据契约都在此定义。
> 参考实现:Trellis(`mindfold-ai/Trellis`)的注册表+configurator+shared 三层、归档移目录、身份文件 gitignore 等做法。**关键分歧**:Trellis 不做全局且禁止在 home 运行;我们要做全局,故对全局安装设了安全边界(§2.3)。
> 状态:**整包未实现**,本文为推荐设计。

---

## 1. 为什么要这个包

现状三处各读各的 `.tuteur/`(cli installation、app summary.ts、py hook),且 app 抄常量,必然漂移。`@tuteur/core` 收口为唯一逻辑层:

```
        ┌────────────────────────────┐
        │        @tuteur/core         │  唯一 fs 读写 + 门禁 + 校验 + 类型 + 常量
        └───┬─────────────┬───────────┘
       @tuteur/cli    @tuteur/app
            │
   平台 hook 脚本 → ttur hook → cli → core
```

铁律:**除 `core/store/*` 外,任何地方不准 `import 'node:fs'` 碰 `.tuteur/`。**

---

## 2. 双层数据模型(重新设计,逐文件定义)

存在两个根。**它们不是同构的** —— 全局是「配置 + 项目注册表 + 模板源」,项目才是「任务事实源」。

### 2.1 全局根 `~/.tuteur/`(单人,不过滤用户)

| 路径 | 格式 | git | 内容 | 谁用 |
| --- | --- | --- | --- | --- |
| `config.json` | JSON | —(在 home) | 全局默认:默认 agent/workflow、dashboard 偏好、skills 默认落地方式 | web 全局设置页读写;CLI init 读默认 |
| `projects.json` | JSON | — | 已知项目注册表 `[{path,name,addedAt}]` | web 多项目看板的列表源 |
| `workflows/*.workflow.json` | JSON | — | **可选**:跨项目复用的 workflow 模板 | 新项目 init 时作为模板候选 |
| `spec/*.md` | MD | — | **可选**:跨项目复用的规范模板 | 同上 |
| `workspace/` | 任意 | — | 全局个人草稿 | 本人 |
| `worktrees/<project>/<taskId>/` | git worktree | — | 各项目任务的并行工作树(opt-in,§9.1) | adapter 在此 cwd 执行;web 看板展示 |

全局根**没有** tasks(已定,§10)、没有 members、没有 `.user`(全局即本人,无需过滤)。worktree 集中放全局根的好处:不污染任何项目仓库、无需各项目 gitignore、全局 dashboard 天然看到所有项目的并行任务(§9.1)。

```jsonc
// ~/.tuteur/config.json
{
  "version": "0.1.0",
  "defaults": { "agent": "codex", "workflow": "default", "skills": "link" },
  "dashboard": { "host": "127.0.0.1", "port": 47321 }
}
// ~/.tuteur/projects.json
{ "projects": [ { "path": "/Users/yan/work/app-a", "name": "app-a", "addedAt": "2026-06-12T..." } ] }
```

### 2.2 项目根 `<repo>/.tuteur/`(协作,过滤用户)

| 路径 | 格式 | git | 内容 | 谁用 |
| --- | --- | --- | --- | --- |
| `config.json` | JSON | 共享 | 项目配置:默认 workflow/agent、任务过滤、dashboard 端口 | web/CLI 读 |
| `context.json` | JSON | 共享 | 默认注入上下文配置 | harness 注入;web context 页编辑 |
| `members.json` | JSON | 共享 | 成员名册 `[{slug,name,email?}]` | web 显示名/按人过滤;CLI mine 过滤 |
| `workflows/*.workflow.json` | JSON | 共享 | workflow 定义(门禁依据) | harness 门禁;web workflow 页 |
| `spec/*.md` | MD | 共享 | 项目规范/长期上下文 | hook 注入;web context 页 |
| `tasks/<id>/task.json` | JSON | 共享 | 任务元数据 | web 看板/详情;CLI/门禁 |
| `tasks/<id>/state.json` | JSON | 共享 | workflow 进度游标 | web 进度;门禁推进 |
| `tasks/<id>/approvals.json` | JSON | 共享 | 人工确认记录 | web 写;门禁读 |
| `tasks/<id>/<artifact>` | MD/JSON | 共享 | agent 产物(prd.md 等,**按需**) | web artifact 查看;门禁 requiredArtifacts |
| `tasks/<id>/runs/NNN.json`+`.log` | JSON+文本 | 共享 | run 元数据与日志 | web run 日志;adapter 写 |
| `tasks/archive/<id>/` | 目录 | 共享 | 归档任务(整目录迁入,§9) | web 归档视图 |
| `template-hashes.json` | JSON | 共享 | skill 模板哈希(update 用) | CLI update |
| `.user` | JSON | **本地(gitignore)** | 当前开发者身份 | web 默认过滤;CLI mine |
| `workspace/<username>/` | 任意 | **本地(gitignore)** | 用户级内容(草稿/笔记/私有上下文) | 本人 |
| `runtime/` | JSON | **本地(gitignore)** | dashboard pid/port | CLI dashboard |

`.tuteur/.gitignore` 固定忽略:`.user`、`workspace/`、`runtime/`、`*.tmp`、`*.new`。

### 2.3 全局安全边界(Trellis 教训)

Trellis 禁止在 home 运行,因为它会在项目根建 `.claude`/`.codex`,而 home 下这些目录是 agent 自己的全局运行时,uninstall 会误删。我们的对策:

- 全局根用**自有命名空间 `~/.tuteur/`**,绝不在 home 直接建 `.claude`/`.codex`/`.agent`。
- **`ttur init --global` 只装 workflow 模板 + 全局 config + projects 注册表,不做任何 agent 平台适配**(不在 home 建 skill 目录)。agent 适配只在项目级发生。
- 因此 §2.1 全局根没有 `.agent/skill`、没有平台目录。skill 适配是项目级概念。

### 2.4 路径解析 API

```ts
// core/paths.ts
export interface Scope { kind: 'global' | 'project'; root: string; tuteurDir: string; }
export function resolveGlobalScope(): Scope;                    // ~/.tuteur
export function resolveProjectScope(from?: string): Scope | null; // 向上找含 .tuteur 的目录
export function detectTuteur(path: string): boolean;           // 加项目时校验
export function taskDir(scope: Scope, id: string): string;
```

`resolveProjectScope` 优先级:显式 `from` > `TUTEUR_PROJECT_ROOT` > `INIT_CWD` > `cwd`,逐级向上找(吸收已删 `context.ts` 职责)。仓库根探测同 Trellis 的「向上找 `.tuteur/`」,支持嵌套仓库。

---

## 3. 用户模型

按你的决策:**用户级内容放 `workspace/<username>/`;项目级过滤、全局级不过滤。** 参考 Trellis 的 developer identity,但用 JSON(便于 web 读写)而非 key=value。

```text
身份(我是谁)   .tuteur/.user             本地  { "name":"Yan","slug":"yan","initializedAt":"..." }
名册(有谁)     .tuteur/members.json      共享  [{ "slug":"yan","name":"Yan","email":null }]
个人内容(我的) .tuteur/workspace/<slug>/ 本地  草稿/笔记/私有上下文
```

- `ttur init -u <name>`:用户名来源 `--user` > `git config user.name` > 交互(同 Trellis)。写 `.user` + 建 `workspace/<slug>/index.md` + upsert `members.json`。
- 过滤口径 = **assignee**(对齐 Trellis 的 `--mine`),core 提供:

```ts
export function shouldFilterByUser(scope: Scope): boolean { return scope.kind === 'project'; }
export function isOwnedBy(task: Task, user: LocalUser): boolean {
  return task.assignee === user.slug || task.assignee === user.name;
}
```

`members.json` 可选:无它用 slug 显示,有它显示友好名。不引入用户级 context 覆盖层,用户差异体现在 `workspace/<slug>/` 内容,保持简单。

---

## 4. 核心数据结构(重新设计)

全部用 zod 定义(TS 类型 + 运行时校验)。损坏文件**快速失败**并指明路径,不静默兜底。

### 4.1 task.json

把「状态」与「归档」「完成时间」分清:归档是动作不是状态,完成有独立时间戳。

```jsonc
{
  "id": "06-12-add-auth",          // <MM-DD>-<slug>,参考 Trellis 命名,人读友好且有序
  "title": "Add authentication",
  "workflow": "default",           // 引用 workflows/<id>.workflow.json
  "status": "planning",            // planning | in_progress | completed
  "creator": "yan",                // members slug
  "assignee": "yan",               // 过滤口径
  "priority": "normal",            // low | normal | high(可选)
  "tags": [],                      // 可选
  "defaultAgent": "codex",         // 任务默认 agent(节点可覆盖,harness §7.1)
  "worktree": null,                // git worktree 绝对路径(opt-in,§9.1);null=主工作树
  "branch": null,                  // 关联分支(worktree 模式下=task/<id>)
  "baseBranch": "main",            // 创建时所在分支,作为合并/PR 目标
  "createdAt": "2026-06-12T10:00:00.000Z",
  "completedAt": null,             // workflow 全完成时写
  "archivedAt": null               // 归档动作时写(目录已迁入 archive/)
}
```

web 看板只需 `id/title/status/assignee/priority`;详情页加 `createdAt/completedAt/branch/worktree`。

### 4.2 state.json(workflow 进度游标)

workflow 定义是静态的,state 是动态游标,由门禁维护:

```jsonc
{
  "taskId": "06-12-add-auth",
  "currentNode": "grill-me",          // 当前待完成的 skill 节点;null=workflow 完成
  "completedNodes": ["classify", "route"],   // 含已自动求值的 decision 节点
  "decisions": { "route": "large" },         // 每个 decision 的路由结果(可审计/web 展示)
  "updatedAt": "2026-06-12T10:30:00.000Z"
}
```

phase 不再是结构层,只是节点的展示标签(§4.3);`task.status` 由 `currentNode` 所在 phase 标签驱动(planning 标签→planning;execute/finish→in_progress;`currentNode==null`→completed)。web 进度只读 `currentNode/completedNodes/decisions`。

### 4.3 workflow.json(节点图)

统一**节点图**,简化约束:只有两种节点 —— `skill`(单入单出)和 `decision`(单入多出)。出边内嵌为节点的 `next`/`branches`,**省去独立 `edges[]`**。`entry` 是入口,`next:null` 是终点。`phase` 仅作展示标签(画布泳道 + 驱动 task.status)。

```jsonc
{
  "id": "default", "name": "Default Coding Workflow", "version": "0.2.0",
  "entry": "classify",
  "nodes": [
    { "id":"classify", "type":"skill", "skillRef":"classify", "next":"route",
      "requiredArtifacts":["decision.json"] },              // 轻量分类,产出信号
    { "id":"route", "type":"decision", "signal":"decision.json#/size",
      "branches":[ {"when":"small","next":"dev"}, {"default":true,"next":"grill-me"} ] },
    { "id":"grill-me", "type":"skill", "skillRef":"grill-me", "next":"dev", "phase":"planning",
      "requiredArtifacts":["design.md","checklist.json"], "approvalRequired":true },
    { "id":"dev", "type":"skill", "skillRef":"dev", "next":"check", "phase":"execute",
      "agent":"codex",                                       // 节点级 agent 指派
      "subagent":{ "isolate":true, "contextRef":"implement.json" } },  // 派隔离子 agent
    { "id":"check", "type":"skill", "skillRef":"check", "next":"finish", "phase":"execute",
      "requiredArtifacts":["check-result.json"],
      "checks":[{ "id":"tests","type":"command","command":"npm test" }] },
    { "id":"finish", "type":"skill", "skillRef":"finish", "next":null, "phase":"finish" }
  ]
}
```

| 节点字段 | 适用 | 语义 |
| --- | --- | --- |
| `type` | 全部 | `skill` \| `decision` |
| `skillRef` | skill | 引用的 skill(§5 发现/校验) |
| `next` | skill | 唯一后继 id;`null`=终点 |
| `branches` | decision | `[{when:值,next} \| {default:true,next}]`,多后继 |
| `signal` | decision | 取值表达式:`decision.json#/size`(JSON Pointer)/ `task.priority` / `check:<id>` |
| `requiredArtifacts`/`checks`/`approvalRequired` | skill | 门禁条件,**全可选**(产物按需,§7) |
| `agent` | skill | 指派执行的 agent(缺省用 task 默认,harness §7) |
| `subagent` | skill | `{isolate, contextRef}` 派隔离上下文子 agent(harness §7) |
| `phase` | skill | 展示标签:泳道分组 + 驱动 task.status |

**decision 节点不占 agent step**:harness 在前驱 skill 完成后**自动求值** signal 并选边,对 agent 透明(推进逻辑见 harness §3,signal 三类来源见 harness §2.5)。web 画布只渲染这两种节点、按 `next`/`branches` 画连线(web §3.3)。

### 4.4 run NNN.json

```jsonc
{
  "id": "001", "agent": "codex", "phase": "execute", "step": "dev",
  "command": "codex ...", "startedAt": "...", "endedAt": "...",
  "status": "success",              // success | failed | aborted
  "plannedContext": [".tuteur/spec/product.md","prd.md"],
  "actualContext": ["prd.md"],      // UI 对比 planned 找 hook 失效
  "producedArtifacts": ["design.md"],
  "failureReason": null
}
```

### 4.5 context.json / members.json / approvals.json

```jsonc
// context.json —— 默认注入上下文(harness §4)
{ "default": { "required":[".tuteur/spec/product.md"], "optional":[], "disabled":[] },
  "agents": { "dev": { "required":[".tuteur/spec/frontend.md"] } } }
// members.json
{ "members": [ { "slug":"yan", "name":"Yan", "email":null } ] }
// approvals.json —— UI 写,门禁读(§9 web §6)
{ "grill-me": { "approvedAt":"...", "by":"yan" } }
```

### 4.6 decision.json(分支信号产物)

由 classify 类 skill 节点产出,harness 读它做 agent 分支路由(harness §2.5)。结构自由,workflow 的 `signal` 用 JSON Pointer 取值:

```jsonc
{ "size": "large", "kind": "dev", "needsResearch": true }
```

`route` decision 的 `signal:"decision.json#/size"` 取 `size` 值匹配 branches。它是**可见、可审计**的产物 —— web 在节点上展示「判定为 large → 走 grill-me」,用户能看到为什么走这条路。

---

## 5. Store API(唯一碰盘层)

repository 风格,全部接 `Scope`。这是 §1 铁律的落点,CLI/app 共用,无第二套读盘实现。

```ts
// 读
listTasks(scope, { includeArchived? }): Task[];
readTask(scope, id): Task;   readState(scope, id): State;
readWorkflow(scope, id): Workflow;   readContextConfig(scope): ContextConfig;
listRuns(scope, taskId): Run[];   readArtifact(scope, taskId, rel): string;
readMembers(scope): Member[];   listProjects(): ProjectRef[];   // 全局
discoverSkills(scopes): DiscoveredSkill[];   // 跨 agent + 项目/全局 发现 skill(§5.1)
// 写
writeTask(scope, task);   writeState(scope, state);   appendRun(scope, taskId, run);
writeApproval(scope, taskId, node, by);   archiveTask(scope, id);   // §9
createWorktree(scope, taskId);   removeWorktree(scope, taskId);    // §9.1(封装 git worktree)
upsertProject(path);   upsertMember(scope, member);
```

### 5.1 Skill 发现(跨 agent + 项目/全局,带 tag)

workflow 编排 skill,需要列出本地都有哪些 skill。按你的要求用 **configurator(行为)+ shared(生成)**,扫**项目与全局两个 scope**、各 agent 的 skill 目录,每条带来源 tag:

```ts
export interface DiscoveredSkill {
  name: string; description?: string;          // 解析 SKILL.md frontmatter
  agent: 'canonical' | 'codex' | 'claude' | 'gemini';
  source: 'project' | 'global';                // ← tag:项目内 vs 本地(~/.tuteur 关联)
  path: string;
}
export function discoverSkills(scopes: Scope[]): DiscoveredSkill[];
```

机制:注册表 `AgentTool` 加 `skillDirs`(各 agent 的 skill 目录),`shared.discoverSkills` 通用扫描 + 解析 frontmatter,单个 configurator 可覆盖特殊目录结构(cli.md §8.6)。结果供画布 skillRef 下拉选择 + `resolveSkillRef` 校验;web 用 `agent`/`source` tag 分组展示(web §3.3)。

---

## 6. Domain:门禁与状态机

确定性核心,纯函数 + 单测。流程见 harness.md §2/§3。

```ts
completeNode(scope, taskId, nodeId): CompleteResult;   // 与 web 端点共用;只对 skill 节点
advanceWorkflow(state, wf, readSignal): State;         // 纯函数:沿 next 推进,遇 decision 自动求值选边
evaluateDecision(node, readSignal): string;            // 读 signal → 命中 branch.next
resolvePlannedContext(scope, taskId, nodeId): string[];
resolveSkillRef(scope, skillRef): { path: string } | null;
archiveTask(scope, taskId): void;                      // §9
export interface CompleteResult { ok: boolean; exitCode: 0 | 2; message?: string; state?: State; }
```

`completeNode` 完成一个 skill 节点后,`advanceWorkflow` 沿 `next` 走;若后继是 decision 节点,`evaluateDecision` 读 signal 自动选边并继续,直到落到下一个 skill 节点或终点 —— **decision 对 agent 透明**(harness §3)。`readSignal` 抽象三类信号源(artifact JSON / task 字段 / check),便于单测注入。

---

## 7. 数据契约(机制,不绑每步产物)

契约描述四方之间的**数据通道**,**与具体 step 无关**。它不规定「每步必产什么」—— 那是各 workflow 的自由,由 step 的 `requiredArtifacts` 声明(**可为空**)。

| 角色 | 职责 | 数据通道 |
| --- | --- | --- |
| AI(agent) | 干活;**若**该 step 声明了 requiredArtifacts 则产出 | task 目录文件 |
| CLI/core | complete 推进 state;adapter 记 run | state.json / runs/NNN.json |
| Web | 读并展示 state/run/artifact;提供操作入口 | 只读 + 操作按钮 |
| 用户 | approve / 归档;回写影响下次门禁 | approvals.json / archiveTask |

**产物按需**:step 没声明 requiredArtifacts → 门禁不查(纯执行/review 可零产物);声明了 → 缺则失败。默认 workflow 给 planning 配 `prd.md` 等只是默认 workflow 的选择,非契约强制。

契约不变量(始终成立):1) run 成功 ≠ step 完成;2) producedArtifacts 由 run 前后目录 diff 得到,不靠 agent 自报;3) planned vs actual 差异是发现 hook 失效的唯一信号,必须回写。

**「web 操作如何对应 harness 流转」**:web 的 approve/归档回写 `.tuteur/`,被下一次 `completeNode` 读到从而影响门禁 —— 这是 web 与状态机唯一耦合点。

---

## 8. InitConfig:CLI 与 Web 共用的初始化模型

把「初始化的选择」抽成一个结构化对象,**三种输入产出同一个 `InitConfig`,再统一执行**,从根上统一 CLI 与 web 的初始化逻辑(你的诉求 1)。

```ts
// core/init-config.ts
export interface InitConfig {
  scope: 'project' | 'global';
  agents: AgentId[];          // 选中的 agent(全局模式恒为 [],不配 agent)
  skills: 'link' | 'copy';    // skill 落地方式(原 skill-mode,改短)
  user?: string;              // 本地身份名(全局模式忽略)
}
```

```text
        三种输入                          统一出口
  CLI flag(--codex --claude --copy -u) ┐
  CLI 交互(inquirer/readline)          ├─► InitConfig ─► initProject(config)
  Web 表单(POST body)                  ┘         │
                                                 └─► serializeToCommand(config)
                                                     → "ttur init --codex --claude -u yan"
```

- **统一问题定义**(供 CLI 交互与 web 表单同源渲染),数据从 agent 注册表派生(cli.md §8):

```ts
export const INIT_QUESTIONS = [
  { key:'agents', type:'multiselect', message:'Select AI tools',
    choices: () => agentChoices(), default: () => defaultCheckedAgents() },
  { key:'skills', type:'select', message:'Skill install', choices:['link','copy'], default:'link' },
  { key:'user',   type:'text',   message:'Your name',     default: () => gitUserName() },
];
```

- `serializeToCommand(config)`:web 选完后展示等价命令 `ttur init --codex --claude -u yan`,也用于「web 触发 init」时 spawn 的参数(web.md §2.4)。
- flag 形态参考 Trellis:**每个 agent 一个布尔 flag**(`--codex`/`--claude`),不用 `--agents codex,claude`(你的诉求 2)。
- `skills` 取代冗长的 `skill-mode`;CLI 侧默认 `link`,`--copy` 切到独立副本。

---

## 9. 任务工作树与归档

### 9.1 worktree 多任务并行(opt-in)

多任务并行时若都在同一工作树,agent 改动会互相踩。`--worktree` 给任务独立 git 工作树+分支,**工作树集中放全局根** `~/.tuteur/worktrees/<project>/<taskId>/`(不污染任何仓库、无需各项目 gitignore、全局 dashboard 天然看到所有并行任务)。

```text
ttur task create "x" --worktree
  → projectName = projects.json 里该项目的 name
  → wt = ~/.tuteur/worktrees/<projectName>/<taskId>
  → 在项目仓库执行:git worktree add <wt> -b task/<taskId>
  → task.json 记 { worktree: <wt 绝对路径>, branch: "task/<taskId>", baseBranch: <当前分支> }
agent run:adapter 在 task.worktree 里 spawn(cwd=worktree);worktree 为空则用主工作树(harness §7)
归档:可选 合并 branch 到 baseBranch + git worktree remove
```

- **opt-in**:默认在主工作树(小任务无需隔离开销);`--worktree` 才建。
- git worktree 路径可为任意绝对路径,目录内是 `.git` 文件指回主仓库,放全局根完全可行。
- core 提供 `createWorktree(scope, taskId)` / `removeWorktree(scope, taskId)`,封装 git 命令 + 维护 task.json 字段。
- dashboard 看板按 `branch`/`worktree` 展示并行任务(web §3.2)。

### 9.2 归档(移动目录,不绑产物)

按你的设计 + Trellis 印证:**归档 = 改状态 + 移动整个任务目录**,与产物无关。

```text
ttur task archive <id>  /  web 归档按钮
  → core.archiveTask(scope, id):
      1. 读 task.json;若已 archived → 报错(幂等保护)
      2. 改 task.json:status='completed'(若未完成则提示/可选强制)、archivedAt=now
      3. shutil.move 等价:tasks/<id>/  →  tasks/archive/<id>/   (整目录迁入)
      4. 若有 worktree:git worktree remove(可选先合并 branch)
      5.(可选)git stage 源/目标路径
  → create 时扫 tasks/archive/ 是否同名,有则拒绝重建(防覆盖,参考 Trellis)
```

要点:
- 归档**不要求任何产物**;它只搬目录、确认状态、清理 worktree。
- 命名用复数 `tasks/`;归档子目录 `tasks/archive/<id>/`。是否再按 `archive/<YYYY-MM>/` 分桶见 §10 待确认。
- `listTasks` 默认不含归档;`includeArchived` 时合并 `tasks/archive/`。
- web 看板默认不显示归档,提供「已归档」筛选。

---

## 10. 代码评价与 TODO

### 评价
- core 是本轮地基,**先于一切落地**。数据结构按全局/项目分层、按 web 用途标注后,「谁存什么、web 读什么」不再含糊。
- 双层不对称(全局=配置+注册表+模板,项目=任务事实源)避免了双根都成完整事实源的复杂度。
- 全局安全边界(不在 home 配 agent)吸收了 Trellis 的真实教训,是必须守的红线。

### TODO

| # | 项 | 优先级 |
| --- | --- | --- |
| K1 | `@tuteur/core` 包骨架 + zod 类型(§4) | P0 |
| K2 | `paths`:双层 Scope + detectTuteur + 全局安全边界 | P0 |
| K3 | `store`:全部读写 + 损坏文件快速失败 | P0 |
| K4 | `domain`:completeNode/advanceWorkflow(节点图沿边+decision 求值)/evaluateDecision/archiveTask + 单测 | P0 |
| K5 | `context`:resolvePlannedContext | P0 |
| K6 | `init-config`:InitConfig + INIT_QUESTIONS + serializeToCommand | P0 |
| K7 | cli/app 改依赖 core,删重复读盘与常量 | P0 |
| K8 | members/approval/projects 读写 | P1 |
| K9 | `discoverSkills`:跨 agent + 项目/全局,带 tag(§5.1) | P1 |
| K10 | 节点 agent 解析 + 子 agent adapter(§4.3 字段、harness §7) | P1 |
| K11 | worktree:createWorktree/removeWorktree + task.json 字段(§9.1) | P1 |

### 待确认
- ~~全局放 tasks~~ → **已定:否**。
- 归档是否按 `archive/<YYYY-MM>/` 分桶?**推荐**:是(对齐 Trellis,任务多时清爽);MVP 可先平铺 `archive/<id>/`。
- 身份/配置用 JSON 还是 Trellis 式 key=value/YAML?**推荐**:统一 JSON(web 读写一致),不引入 YAML 解析。
- core 是否独立发包?**推荐**:内部私有包,随 cli/app 构建。
