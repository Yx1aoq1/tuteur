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
| `knowledge/` | 目录 | — | **可选**:跨项目复用的全局知识库(条目模型见 [knowledge.md](./knowledge.md));新项目 init 时作为模板候选 | 注入候选;web 知识库管理 |
| `workspace/` | 任意 | — | 全局个人草稿 | 本人 |

全局根**没有** tasks(已定,§10)、没有 workspace 名册、没有 `.developer`(全局即本人,无需过滤)。worktree 并行已移出 MVP(§9.1 方案存档)。

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
| `workflows/*.workflow.json` | JSON | 共享 | workflow 定义(门禁依据) | harness 门禁;web workflow 页 |
| `knowledge/` | 目录 | 共享 | 项目知识库(`sources/`+`wiki/`+`index.md`+`log.md`,karpathy 模式;条目 schema 见 [knowledge.md](./knowledge.md)) | hook 注入(注索引);web 知识库管理 |
| `tasks/<id>/task.json` | JSON | 共享 | 任务元数据 | web 看板/详情;CLI/门禁 |
| `tasks/<id>/state.json` | JSON | 共享 | workflow 进度游标 | web 进度;门禁推进 |
| `tasks/<id>/approvals.json` | JSON | 共享 | 人工确认记录 | web 写;门禁读 |
| `tasks/<id>/<artifact>` | MD/JSON | 共享 | agent 产物(prd.md 等,**按需**) | web artifact 查看;门禁 requiredArtifacts |
| `tasks/<id>/events.jsonl` | JSONL | 共享 | 事件流水:验收尝试/会话注入/跳过(§4.4) | web 事件时间线与统计;CLI/hook 追加 |
| `tasks/archive/<YYYY-MM>/<id>/` | 目录 | 共享 | 归档任务(整目录迁入,按归档月分桶,§9) | web 归档视图 |
| `template-hashes.json` | JSON | 共享 | skill 模板哈希(update 用) | CLI update |
| `workspace/<slug>/` | 任意 | **共享(提交)** | 用户级内容(草稿/笔记);**子目录名即项目成员名册**(§3) | 本人写;web/CLI 读名册 |
| `.developer` | JSON | **本地(gitignore)** | 当前开发者身份(对齐 Trellis `.developer`) | web 默认过滤;CLI mine |
| `runtime/` | JSON | **本地(gitignore)** | dashboard pid/port、当前任务指针 `current-task.json`(harness §7.1) | CLI dashboard/hook |

`.tuteur/.gitignore` 固定忽略:`.developer`、`runtime/`、`*.tmp`、`*.new`。**`workspace/` 提交进仓库**(对齐 Trellis)——其子目录 `workspace/<slug>/` 的集合就是项目成员名册,无需单独 `members.json`(§3)。

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

按你的决策:**对齐 Trellis —— `.developer` 存本地身份(gitignore),`workspace/` 提交进仓库、其子目录即成员名册,不单独维护 `members.json`。** 项目级过滤、全局级不过滤。

```text
身份(我是谁)   .tuteur/.developer        本地(gitignore)  { "name":"Yan","slug":"yan","initializedAt":"..." }
名册(有谁)     .tuteur/workspace/<slug>/ 共享(提交)      子目录集合 = 项目成员;友好名读 <slug>/index.md 的 H1
个人内容(我的) .tuteur/workspace/<slug>/ 共享(提交)      草稿/笔记/私有上下文(随仓库走,换机不丢)
```

- `ttur init -u <name>`:用户名来源 `--user` > `git config user.name` > 交互(同 Trellis)。写 `.developer` + 建 `workspace/<slug>/index.md`(`# <name>`),后者一提交就把「我」登记进名册。
- **名册从 `workspace/` 派生,不再有 `members.json`**:`workspace/<slug>/` 子目录名的集合就是「这个项目有谁」(都是提交内容);友好名取 `workspace/<slug>/index.md` 的 H1,缺省用 slug。这与 Trellis 一致(Trellis 也无名册文件,workspace 子目录即开发者列表)。
- 过滤口径 = **assignee**(对齐 Trellis 的 `--mine`),core 提供:

```ts
export function shouldFilterByUser(scope: Scope): boolean { return scope.kind === 'project'; }
export function isOwnedBy(task: Task, user: LocalUser): boolean {
  return task.assignee === user.slug || task.assignee === user.name;
}
export function listDevelopers(scope: Scope): { slug: string; name: string }[];  // 读 workspace/*/ 目录名 + index.md H1
```

不引入用户级 context 覆盖层(个性化靠全局/项目知识库,knowledge.md §7),也不引入名册文件,保持简单。

### 3.1 user ↔ task 关联(参考 Trellis)

Trellis 用 task.json 的 `assignee`(developer 名)关联人与任务,`--mine` 按 assignee 过滤,create 时 assignee 默认当前 developer、缺身份则报错。Tuteur 同构,但用 `.developer.slug` 作 key、`creator`+`assignee` 双字段:

| 字段 | 含义 | 写入时机 |
| --- | --- | --- |
| `creator` | 谁建的(留痕,不改) | create 时 = 当前 `.developer.slug` |
| `assignee` | 谁负责(过滤口径,可改派) | create 时默认 = 当前 `.developer.slug`;`--assignee <slug>` 改派他人 |

- **create 关联规则**:`creator = 当前 .developer.slug`;`assignee = --assignee ?? 当前 .developer.slug`。**既无 `.developer` 又无 `--assignee` → 快速失败**(对齐 Trellis「No developer set」),提示先 `ttur init -u` 或显式 `--assignee`,不静默建无主任务。
- **`--mine` = assignee 过滤**(`isOwnedBy`,上方);全局根不过滤(`shouldFilterByUser`)。
- **名册校验靠 `workspace/`**:改派/`--assignee` 的 slug 是否「在册」= `workspace/<slug>/` 是否存在(`listDevelopers`,§3);不在册可警告,不阻断——Tuteur 只做本地协作过滤,不做访问控制(PRD §7.10)。
- 改派:`ttur task assign <task> <slug>`(或 `task create --assignee`)只改 `assignee`,`creator` 不变。

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
  "status": "planning",            // planning | in_progress | completed | cancelled(cancelled 仅归档动作可写入)
  "creator": "yan",                // workspace slug;create 时 = 当前 .developer.slug(§3.1)
  "assignee": "yan",               // 过滤口径(--mine);默认 = 当前 .developer.slug,可 --assignee/task assign 改派(§3.1)
  "priority": "normal",            // low | normal | high(可选)
  "tags": [],                      // 可选
  "createdAt": "2026-06-12T10:00:00.000Z",
  "completedAt": null,             // workflow 全完成时写
  "archivedAt": null               // 归档动作时写(目录已迁入 archive/<YYYY-MM>/)
}
```

web 看板只需 `id/title/status/assignee/priority`;详情页加 `createdAt/completedAt/archivedAt`。

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

phase 不再是结构层,只是节点的展示标签(§4.3);`task.status` 由 `currentNode` 所在 phase 标签驱动(planning 标签→planning;execute/finish→in_progress;`currentNode==null`→completed);**无 phase 标签的节点不改变 status**(任务初始为 planning,仅进入带标签节点时更新)。门禁失败不改变 state——停留原节点修复后再次 complete 即返工(harness §2.4);workflow 校验拒绝带环图,state 无迭代轮次概念。web 进度只读 `currentNode/completedNodes/decisions`。

### 4.3 workflow.json(节点图)

统一**节点图**,简化约束:只有两种节点 —— `skill`(**单出**,入度不限——分支汇合点天然多入)和 `decision`(单入多出)。图必须**无环**(返工靠停留原节点重试表达,harness §2.4,validate 拒绝回边)。出边内嵌为节点的 `next`/`branches`,**省去独立 `edges[]`**。`entry` 是入口,`next:null` 是终点。`phase` 仅作展示标签(画布泳道 + 驱动 task.status)。

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
    { "id":"dev", "type":"skill", "skillRef":"dev", "next":"check", "phase":"execute" },
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
| `branches` | decision | `[{when:值,next} \| {default:true,next}]`,多后继;**必须有且仅有一个 default**(validate 强制) |
| `signal` | decision | 取值表达式:`decision.json#/size`(JSON Pointer)/ `task.priority` / `check:<id>` |
| `requiredArtifacts`/`checks`/`approvalRequired` | skill | 门禁条件,**全可选**(产物按需,§7) |
| `phase` | skill | 展示标签:泳道分组 + 驱动 task.status(无标签节点不改 status) |

**decision 节点不占 agent step**:harness 在前驱 skill 完成后**自动求值** signal 并选边,对 agent 透明(推进逻辑见 harness §3,signal 三类来源见 harness §2.5)。signal 不可读(文件/字段缺失)→ 本次 complete 整体失败(exit 2,提示信号缺失);有值但未匹配任何 `when` → 走 default 分支。一个 workflow 含多个 decision 时,信号产物按 `decisions/<nodeId>.json` 命名避免冲突(§4.6)。web 画布只渲染这两种节点、按 `next`/`branches` 画连线(web §3.3)。

### 4.4 events.jsonl(事件流水,审计与统计数据源)

run 模式已移除(交互模式唯一,Tuteur 不启动/托管 agent 进程),`events.jsonl` 是执行过程的唯一记录:按时间追加、一行一条紧凑 JSON(reason 截断),**随任务目录提交进 git**(换环境不丢任务可视内容)。CLI(complete/skip)与 hook(session-start)写入,web 事件时间线与统计页读取。

```jsonc
{"ts":"...","type":"complete_attempt","node":"check","ok":false,"reason":"check tests failed (exit 1)"}
{"ts":"...","type":"complete_attempt","node":"finish","ok":false,"reason":"当前应完成 check"}   // 喊错关 = 跳步证据
{"ts":"...","type":"session_start","injected":["api-conventions","tasks/06-12-add-auth/prd.md"]}
{"ts":"...","type":"skip","node":"check","by":"yan","reason":"flaky check,人工放行"}
```

用途:重试告警线(同节点失败超过 `config.json` 阈值 → 看板标黄;**门禁本身永不自动放行**,harness §2.4)、跳步/遵从率统计(P2 统计页:节点失败率、平均重试、最常缺产物)、hook 生效性判断(有 `session_start` 即 hook 已触发,`injected` 与计划注入对比;事件缺失 = hook 根本未触发)。

### 4.5 context.json / approvals.json

```jsonc
// context.json —— 默认注入上下文(harness §4、knowledge.md §7);按知识 id 引用,分两层(项目共享,不分用户)
{ "default": { "required":["api-conventions"], "optional":["db-schema"], "disabled":[] },
  "nodes": { "dev": { "required":["api-conventions","test-policy"] } } }      // 按节点 id 差异化
// approvals.json —— UI 写,门禁读(§9 web §6)
{ "grill-me": { "approvedAt":"...", "by":"yan" } }
```

> 无 `members.json`:成员名册由提交的 `workspace/<slug>/` 子目录派生(`listDevelopers`,§3),对齐 Trellis。

### 4.6 decision.json(分支信号产物)

由 classify 类 skill 节点产出,harness 读它做 agent 分支路由(harness §2.5)。结构自由,workflow 的 `signal` 用 JSON Pointer 取值:

```jsonc
{ "size": "large", "kind": "dev", "needsResearch": true }
```

`route` decision 的 `signal:"decision.json#/size"` 取 `size` 值匹配 branches。它是**可见、可审计**的产物 —— web 在节点上展示「判定为 large → 走 grill-me」,用户能看到为什么走这条路。一个 workflow 含多个分类节点时,信号产物按 `decisions/<nodeId>.json` 命名(signal 路径本就可配,此为默认约定)。

---

## 5. Store API(唯一碰盘层)

repository 风格,全部接 `Scope`。这是 §1 铁律的落点,CLI/app 共用,无第二套读盘实现。

```ts
// 读
listTasks(scope, { includeArchived? }): Task[];
readTask(scope, id): Task;   readState(scope, id): State;
readWorkflow(scope, id): Workflow;   readContextConfig(scope): ContextConfig;
readEvents(scope, taskId): TaskEvent[];   readArtifact(scope, taskId, rel): string;
listDevelopers(scope): Developer[];   listProjects(): ProjectRef[];   // 名册读 workspace/*/(§3);projects 全局
readCurrentTask(scope): string | null;   // runtime/current-task.json 指针(harness §7.1)
discoverSkills(scope): DiscoveredSkill[];   // 项目 scope 入参;内部扫项目目录 + 各 agent home 目录(§5.1)
// 写
writeTask(scope, task);   writeState(scope, state);   appendEvent(scope, taskId, event);
writeApproval(scope, taskId, node, by);   archiveTask(scope, id, { markCancelled? });   // §9
writeCurrentTask(scope, taskId);   clearCurrentTask(scope);   assignTask(scope, taskId, slug);   // §3.1 改派
upsertProject(path);   // 名册无写 API:`workspace/<slug>/` 由 init 建、随仓库提交即登记(§3)
```

### 5.1 Skill 发现(跨 agent + 项目/全局,带 tag)

workflow 编排 skill,需要列出本地都有哪些 skill。注意:**全局 skill 不在 `~/.tuteur/`**(§2.3 安全边界:全局根永远不放 agent 目录),而在各 agent 自己的 home 目录(`~/.claude/skills/` 等)。这是 **core 的读能力**(消费方是 web 画布的 skillRef 下拉,不暴露成 `ttur` 命令),按注册表 `skillDirs` 静态目录扫描,每条带来源 tag:

```ts
export interface DiscoveredSkill {
  name: string; description?: string;          // 解析 SKILL.md frontmatter
  agent: 'canonical' | 'codex' | 'claude' | 'gemini';
  source: 'project' | 'global';                // ← tag:项目目录 vs agent 的 home 目录
  path: string;
}
export function discoverSkills(scope: Scope): DiscoveredSkill[];   // 项目 scope;内部扫 project 组 + home 组
```

机制:注册表项 `AgentPlatformConfig` 的 `skillDirs` 拆两组 `{ project: string[]; global: string[] }`——project 组相对项目根解析,global 组相对用户 home 解析(无全局 skill 目录的 agent 留空数组)。`skillDirs` 是注册表里的**静态目录数据**;扫描 + 解析 frontmatter 的逻辑落在 **core(`store.discoverSkills`)**,不在 configurator(cli.md §8.6)。结果供画布 skillRef 下拉选择 + `resolveSkillRef` 校验;web 经 `GET /api/skills` 取数、用 `agent`/`source` tag 分组展示(web §3.3)。

---

## 6. Domain:门禁与状态机

确定性核心,纯函数 + 单测。流程见 harness.md §2/§3。

```ts
completeNode(scope, taskId, nodeId): CompleteResult;   // 与 web 端点共用;只对 skill 节点
advanceWorkflow(state, wf, readSignal): State;         // 纯函数:沿 next 推进,遇 decision 自动求值选边
evaluateDecision(node, readSignal): string;            // 读 signal → 命中 branch.next
resolvePlannedContext(scope, taskId, nodeId): string[];  // 合并 global injectByDefault→项目 default→node(knowledge.md §7);返回知识 id/路径清单
resolveSkillRef(scope, skillRef): { path: string } | null;
resolveCurrentTask(scope, explicit?): string | null;   // --task > 指针 > 唯一未完成任务兜底(harness §7.1)
archiveTask(scope, taskId, { markCancelled? }): void;  // §9
export interface CompleteResult { ok: boolean; exitCode: 0 | 2; message?: string; state?: State; }
```

`completeNode` 完成一个 skill 节点后,`advanceWorkflow` 沿 `next` 走;若后继是 decision 节点,`evaluateDecision` 读 signal 自动选边并继续,直到落到下一个 skill 节点或终点 —— **decision 对 agent 透明**(harness §3)。signal 不可读 → completeNode 整体失败(exit 2,提示信号缺失);有值未匹配 → 走 default(validate 已保证 default 存在)。**门禁失败不改变 state**;每次 complete 尝试(成败)都 `appendEvent`(§4.4);成功时返回的 state 用于拼装「下一节点接力输出」(harness §2.3)。`readSignal` 抽象三类信号源(artifact JSON / task 字段 / check),便于单测注入。

---

## 7. 数据契约(机制,不绑每步产物)

契约描述四方之间的**数据通道**,**与具体 step 无关**。它不规定「每步必产什么」—— 那是各 workflow 的自由,由 step 的 `requiredArtifacts` 声明(**可为空**)。

| 角色 | 职责 | 数据通道 |
| --- | --- | --- |
| AI(agent) | 干活;**若**该 step 声明了 requiredArtifacts 则产出 | task 目录文件 |
| CLI/core | complete 推进 state;CLI/hook 记事件 | state.json / events.jsonl |
| Web | 读并展示 state/event/artifact;提供操作入口 | 只读 + 操作按钮 |
| 用户 | approve / 跳过 / 归档;回写影响下次门禁 | approvals.json / events.jsonl / archiveTask |

**产物按需**:step 没声明 requiredArtifacts → 门禁不查(纯执行/review 可零产物);声明了 → 缺则失败。默认 workflow 给 planning 配 `prd.md` 等只是默认 workflow 的选择,非契约强制。

契约不变量(始终成立):1) **agent 自称完成 ≠ 节点完成**,完成只由 completeNode 判定;2) 门禁永不自动放行,人工跳过必须显式(`--skip`)且留痕;3) 计划注入与实际注入(`session_start` 事件的 `injected` 清单)的差异、以及事件缺失,是发现 hook 失效的信号,事件必须记录。

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
- web 触发 init 的请求体为 `{ path, config: InitConfig }`——目标路径是 web 场景特有输入,**不进入 InitConfig 本体**(web.md §2.4)。
- flag 形态参考 Trellis:**每个 agent 一个布尔 flag**(`--codex`/`--claude`),不用 `--agents codex,claude`(你的诉求 2)。
- `skills` 取代冗长的 `skill-mode`;CLI 侧默认 `link`,`--copy` 切到独立副本。

---

## 9. 任务工作树与归档

### 9.1 worktree 多任务并行(已移出 MVP,方案存档)

worktree 并行已推迟(2026-06-13 评审决定),`task.json` 不含相关字段、store 不含 worktree API。回归时按以下**已确认方案**实施,不再重新设计:

- **`.tuteur/` 的事实源永远是主仓库工作树**:`resolveProjectScope` 识别 git worktree(`.git` 为文件而非目录)并经 commondir 重定向到主仓库根;cwd 只决定代码在哪改。否则 worktree 内的 `.tuteur/` 副本会接收状态写入,导致僵尸看板、合并冲突、approval 读不到。
- **创建 worktree 时 `git sparse-checkout` 排除 `.tuteur/`**:分支提交永不触碰任务数据,合并回 baseBranch 时 `.tuteur/` 零冲突。
- **cwd ≠ scope.root 时 hook/CLI 输出绝对路径**:注入上下文与产物写入都指向主仓库。
- 生命周期:**Tuteur 不做合并**;归档仅校验分支已合入(`git merge-base --is-ancestor`),未合入则拒绝或 `--force` 放弃;合并本身留给用户/finish 节点(PR 或本地 merge 是用户偏好)。
- 位置是实现细节(倾向 `~/.tuteur/worktrees/`,不污染仓库);事实源规则不依赖位置。

### 9.2 归档(移动目录,默认不改状态,不绑产物)

**归档 = 写 archivedAt + 移动整个任务目录**,与产物无关、与完成状态正交(PRD:归档不是一种任务状态)。

```text
ttur task archive <id> [--cancelled]  /  web 归档按钮
  → core.archiveTask(scope, id, { markCancelled? }):
      1. 读 task.json;若已 archived → 报错(幂等保护)
      2. status 默认不变;任务未完成时询问(或 --cancelled 直接指定):
         按当前状态归档,或标记 status='cancelled'(cancelled 仅能由归档动作写入,不参与状态机流转)
      3. 写 archivedAt=now
      4. 移动目录:tasks/<id>/ → tasks/archive/<YYYY-MM>/<id>/(按归档月分桶,对齐 Trellis)
  → create 的同名检测只查活跃任务目录;归档区跨年同 id 靠分桶路径天然共存
```

要点:
- 归档**不要求任何产物**、**默认不改写状态**;未完成任务可诚实地以 cancelled 或原状态入档。
- **Tuteur 永不执行 `git add`/`git commit`**;`.tuteur/` 变更跟随用户的正常代码提交(finish skill 仅提醒,动手的是用户或 agent)。
- `listTasks` 默认不含归档;`includeArchived` 时合并 `tasks/archive/*/*`。
- web 看板默认不显示归档,归档视图区分 completed/cancelled。

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
| K4 | `domain`:completeNode/advanceWorkflow(节点图沿边+decision 求值+无环校验)/evaluateDecision/archiveTask + 单测 | P0 |
| K5 | `context`:resolvePlannedContext | P0 |
| K6 | `init-config`:InitConfig + INIT_QUESTIONS + serializeToCommand | P0 |
| K7 | cli/app 改依赖 core,删重复读盘与常量 | P0 |
| K8 | listDevelopers(读 workspace/)/ approval / projects 读写 | P1 |
| K9 | `discoverSkills`:项目目录 + 各 agent home 目录,带 tag(§5.1) | P1 |
| K10 | `events`:appendEvent/readEvents + 阈值告警计算(§4.4) | P0 |
| K11 | 当前任务指针:read/write/clearCurrentTask + resolveCurrentTask(harness §7.1) | P0 |
| K12 | worktree 并行(已后置,方案存档 §9.1) | P2 |

### 待确认
- ~~全局放 tasks~~ → **已定:否**。
- ~~归档分桶~~ → **已定:按 `archive/<YYYY-MM>/` 分桶**,MVP 直接做,不走平铺过渡。
- 身份/配置用 JSON 还是 Trellis 式 key=value/YAML?**推荐**:统一 JSON(web 读写一致),不引入 YAML 解析。
- core 是否独立发包?**推荐**:内部私有包,随 cli/app 构建。
