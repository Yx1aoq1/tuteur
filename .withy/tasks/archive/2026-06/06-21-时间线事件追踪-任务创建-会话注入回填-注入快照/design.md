# Design: 时间线事件追踪:任务创建/会话注入回填/注入快照

## Summary

四块协同:① app 展示层修时区与严格升序排序;② core 事件模型扩展(task_created / 注入快照 / 按会话回填);③ 新增 `withy note`(节点小结,以新增 `noteChecker` 硬门禁,覆盖全部 5 个 skill 节点)+ user-prompt-submit hook 记录用户 prompt 原文(与里程碑事件同列于时间线,正文就地折叠);④ 新增 `checklist.json` 命令托管,**完全取代 `implement.md`**(既有任务已迁移、implement.md 读取路径已删),规划门禁改为 `progressChecker`(checklist.json 非空即过),并同步改 brainstorm/dev/finish 技能与 workflow 模板。事件模型按类型分立;会话 ID 来源收进 `AGENT_PLATFORMS`;老数据/跨平台均降级兼容。

## Architecture and Boundaries

- **core/types.ts** — 扩展 `TaskEventSchema`(`task_created`/`note`/`prompt`/`checkpoint`,`session_start` 加 `snapshot?`);`Gate` 加 `note?: boolean`;新增 `ChecklistSchema`。
- **core/constants.ts** — `SNAPSHOT_MAX`/`PROMPT_MAX`。
- **core/store** — `checklist.json` 读写 + `readProgress`(唯一进度源,仅 checklist.json);`runtime/sessions/<sid>.json` pending 读写/认领/清扫。
- **core/workflow/gate.ts** — 新增 `noteChecker` 与 `progressChecker`;`Gate` 加 `note?`/`progress?`;`GateContext` 加 `hasNote()`、`hasProgress()`。
- **core/workflow/runtime.ts** — 绑定 `hasNote`(读 events 判本轮当前节点是否有 note)与 `hasProgress`(走 `readProgress`)。
- **core/session/hook.ts** — `renderSessionStart` 额外返回 `snapshot`。
- **core/agents/registry.ts** — `AGENT_PLATFORMS` 增会话 ID 来源 + `resolveSessionId()`。
- **cli/commands/hook.ts** — session-start 读 stdin `session_id`;user-prompt-submit 有任务写 `prompt`。
- **cli/commands/task.ts** — `task start` 写 `task_created`、按 sid 认领回填。
- **cli/commands** — 新增 `withy note`、`withy checklist`(add/done/undone/edit/remove/list)。
- **cli/templates/workflow/workflow.json** — 规划节点产物门禁由列 `implement.md` 改为 `progress:true`(checklist.json 非空即过);5 个 skill 节点 gate 各加 `note:true`。
- **cli/templates/common/skills/{brainstorm,grill-me,dev,check,finish}/SKILL.md** — 5 个 skill 节点各加「收尾 `withy note`」步骤;brainstorm/dev/finish 另改为驱动 checklist.json。
- **app** — 本地时区 + 升序 + 新事件渲染 + 快照展开;prompt 折叠分区;progress 读 `readProgress`。

边界:除 store 碰盘层外不直接读写 `.withy/`;schema/常量只在 core;会话 ID 来源只在 registry;门禁扩展只加 checker + Gate 字段,不动引擎。`note`/`progress` 与既有 `artifacts`/`checks`/`approval` 同为 AND 关系(任一不过即 block)。

## Components

### 1. 事件 schema(core/types.ts,判别联合扩展)
- `task_created`: `{ ts, type:'task_created', by? }`(ts = `task.createdAt`)。
- `session_start`: 加 `snapshot: z.string().optional()`(截断 `SNAPSHOT_MAX`=4000);保留 `injected`。
- `prompt`: `{ ts, type:'prompt', text: string }`(截断 `PROMPT_MAX`=500;hook 写)。
- `note`: `{ ts, type:'note', node: string, summary: string, by? }`。
- `checkpoint`: `{ ts, type:'checkpoint', id: string, text: string }`。

### 2. checklist.json 与进度源(core/store)
- `ChecklistSchema`:`{ nextId: number, items: [ { id: string, text: string, verify?: string, done: boolean } ] }`。`nextId` 为单调计数器,id = 分配时 `nextId` 转字符串后自增;**删除条目不重编号、id 永不复用**。
- `readChecklist`/`writeChecklist`;`readProgress(scope,id)`:**唯一进度源,仅 checklist.json**(文件存在则以其为准,即便 `items` 为空 → 进度 0/0、归档放行;文件缺失 → source 'none')。返回 `{ source, items:[{id,text,done}], done, total }`,既供归档门禁/dashboard 计数,也供详情列表渲染条目。既有 5 个任务的 implement.md 已迁移为 checklist.json,core 不再解析 implement.md。
- 归档门禁(`task/service.ts`)与 dashboard `readImplementationView` 改调 `readProgress`。

### 3. note 门禁 + progress 门禁(core/workflow/gate.ts + runtime.ts)
- `Gate` 加 `note?: boolean`、`progress?: boolean`。
- `noteChecker`:`gate.note && !ctx.hasNote() → ['record a node summary: run "withy note"']`。
- `progressChecker`:`gate.progress && !ctx.hasProgress() → ['missing implementation plan: run "withy checklist add"']`(`hasProgress` 走 `readProgress`,checklist.json 非空即真)。取代「把 implement.md 当普通 artifact 列出」——后者是 AND-list,换成 checklist.json 给不出语义,故用独立 checker。
- `GateContext` 加 `hasNote()`、`hasProgress()`;runtime.ts 绑定:`hasNote` = 存在 `note{node=currentNode}` 且其 ts ≥ `nodeEnteredAt`(= 最近 `rewind{node}` 与最近 `complete_attempt{node,ok:true}` 的较大 ts;append-only 日志保留历史完成事件,故复访本节点时旧 note 因早于上次完成 ts 而失效;两者皆无则任意该节点 note 即可)。
- workflow 模板 5 个 skill 节点 gate 各加 `"note": true`;规划节点(brainstorm/grill-me)以 `"progress": true` 取代列 implement.md 文件。

### 4. 会话 pending 注入(core/store + runtime)
- `.withy/runtime/sessions/<sid>.json`:`{ ts, snapshot, injected }`。
- `writePendingInjection` / `claimPendingInjection`(读后删)/ `sweepPendingInjections(maxAgeMs=24h)`。gitignored。

### 5. 会话 ID 来源(core/agents/registry.ts)
- `AgentPlatformConfig` 增 `sessionIdEnv?`(Claude=`CLAUDE_CODE_SESSION_ID`)、`hookSessionIdField?`(Claude=`session_id`)。
- `resolveSessionId()`:按当前平台读 env;拿不到返 null。

### 6. 命令(cli)
- `withy note "<summary>"`:为 `state.currentNode` append `note`(`by`=开发者 slug);空 summary 拒绝;`currentNode` 为 null(工作流已收束)拒绝。
- `withy checklist`(读改写 `checklist.json`,统一支持 `--json`):
  - `add "<text>" [--verify "<cmd>"]`:单条新增,`--json` 返回 `{id}`;批量经 stdin 传 `[{text,verify?},…]`,返回 `{ids:[…]}`。
  - `done <id...>` / `undone <id...>` / `remove <id...>`:接收**多个 id** 批量处理;`done` 每个**由未完成转完成**的 id append 一条 `checkpoint`(对已 done 的 id 幂等:不改文件、不落事件);`undone` 后再 `done` 算重新完成、落新 checkpoint。`undone`/`remove`/`edit`/`add` 不落事件。坏 id 报错非静默。
  - `edit <id> "<text>" [--verify "<cmd>"]`;`list [--json]`:输出当前全量(供断线重连重新对齐)。
- 交互契约:`checklist.json` 是 dev 节点的契约文件,dev 技能在节点开始时读入,agent 手中始终有当前条目+id;`add --json` 即时返回 id。**无需每次操作前 `list`**,`list` 仅用于重新对齐。

### 7. 技能与 workflow 模板改写(cli/templates)
- `workflow.json`:规划节点(brainstorm/grill-me)以 `progress:true` 取代列 `implement.md`;5 个 skill 节点 gate 各加 `note:true`。
- 5 个 skill 节点的 SKILL.md(brainstorm/grill-me/dev/check/finish)各加「节点收尾 `withy note "<小结>"` 再 `withy next`」步骤——否则该节点 `withy next` 会因 note 门禁卡住而 agent 无指引。
- `brainstorm/SKILL.md`:产出计划改为经 `withy checklist add` 建 `checklist.json`(替代写 implement.md);删/改「progress is parsed from implement.md」表述。
- `dev/SKILL.md`:以 `checklist.json` 为步骤契约;完成步用 `withy checklist done <id>`。
- `finish/SKILL.md`:核对进度读 `checklist.json` / `withy checklist list`。
- 改后 `pnpm --filter @withy/cli build` 重建 dist 并重装 `.claude/skills` 与 `.withy/workflows`。

### 8. 展示(app)
- `formatEventTime`/`archived.ts`:`Intl.DateTimeFormat` 本地时区 + `<time suppressHydrationWarning>`(dashboard 为开发者本机运行,server tz=browser tz;suppressHydrationWarning 兜住残余漂移)。
- `readTimelineView`:**严格按 `ts` 升序**;**含 `prompt`**(与里程碑事件同列);仅当 events 无任何 `task_created` 时由 `createdAt` 合成置顶(老任务)。新任务有真实 `task_created`,回填的 `session_start`(ts<createdAt)自然排在其上,不特判置顶。
- `TimelineRow`:渲染 `task_created`/`note`/`checkpoint`/`prompt`;`session_start` 快照与 `prompt` 正文共用同一就地折叠交互(不同提示文案,不单独成区)。`TimelineEventView` 扩展 `summary?`/`text?`/`snapshot?` 字段供新类型;未知类型仍降级中性行。
- progress 视图改读 `readProgress`;`messages/zh.json`/`en.json` 增 label(含 `event.prompt`/`promptToggle`)。

## Data Flow and Contracts

**会话启动**:`hook session-start` 读 stdin `session_id` → 有任务:`appendEvent(session_start{snapshot})`;无任务:`writePendingInjection`。

**用户发言**:`hook user-prompt-submit` → 有任务:读 stdin prompt 原文 → `appendEvent(prompt{text 截断})`;无任务:维持 nudge、不写事件。

**创建任务**:`task start` **新建路径**(非 focus 既有任务路径——后者 `emit` 即 `process.exit`,不重复写)写 task/state/pointer → `appendEvent(task_created{ts=createdAt})` → `sweepPendingInjections` → `resolveSessionId()`:得 sid 且有 pending → `claimPendingInjection` 以原 ts+snapshot append 首条 `session_start` 并删;否则跳过回填。

**节点推进**:agent `withy note "..."` → `withy next` 经 `noteChecker` 校验本轮 note → 通过则游标前移。规划节点另经 `progressChecker` 校验存在非空计划。

**进度/归档**:`withy checklist done <id>` → 改 checklist.json + append `checkpoint`;归档读 `readProgress`,未完>0 拒绝。

不变量:events.jsonl append-only、按 ts 升序消费;新字段对老数据 optional;文本不参与排序;`readEvents` 用 `safeParse` 跳过无法解析的行,故老消费端遇新事件类型静默丢弃(不抛、时间线存活);进度统一走 `readProgress`(仅 checklist.json)。

## Error Handling and Edge Cases

- 无 `session_id`:不写 pending、不回填,soft-fail 继续。
- 并发会话:pending 按 sid 隔离,认领只取本 sid。
- 一会话多次 task start:首个认领并删 pending,后续无 pending 可领。
- 会话从不建任务:pending 由 `sweepPendingInjections` 按 24h 清理。
- 既有任务无 checklist.json:已一次性迁移(解析旧 implement.md → 生成 checklist.json,保留 done,删原文件);此后所有任务以 checklist.json 为唯一进度源。
- 老任务 events 无 task_created/snapshot:合成起点 + 快照段隐藏。
- 新门禁遇在飞任务:当前 skill 节点无 note → `withy next` 一次性提示补写,非死锁;rewind 后旧 note 失效需重写。
- prompt/snapshot 超限:截断加 `…`。
- hook 读 stdin 失败/超时:退化为现有行为,绝不阻塞会话。
- checklist `done` 不存在的 id:报错非静默;对已 done 的 id 幂等(不改文件、不重复落 checkpoint);空 checklist 归档放行(0 未完项)。
- `withy note`:空 summary 或 `currentNode` 为 null 时拒绝并给明确提示;switch 节点上虽可写但无 note 门禁,属无害。

## Compatibility and Migration

- 无破坏性数据迁移。新增 schema 字段全 optional;新事件类型老消费端忽略(`readEvents` safeParse 跳过;app 显式映射,未知类型降级中性行)。
- 进度统一为 checklist.json:既有 5 个任务一次性迁移(旧 implement.md → checklist.json,保留 done),core 删除 implement.md 解析路径与 `unparsed` 概念,无双轨。
- 既有 hooks 命令签名不变,仅内部新增读 stdin / 写事件。
- 技能与 workflow 模板改写需 rebuild + 重装生效。
- 新命令(note/checklist)为新增 CLI 面;`Gate.note`/`Gate.progress` 为可选字段,老 workflow 无此字段即不强制。
- 本任务自身已迁移到 checklist.json(随既有任务一并迁移);若重装新 workflow 后本任务推进剩余节点(dev/check/finish),note 门禁对在飞任务一次性提示补 `withy note` 即过,非死锁;grill-me 已在重装前通过,不受 note 门禁影响。

## Testing Strategy

- core 单测:新事件 zod(含 optional 回退);`readProgress`(checklist.json 存在/空 items/缺失 source=none)+ 返回 items;`readChecklist`/`writeChecklist`;`noteChecker`+`hasNote`(无 note 拒、有 note 过、rewind 后失效、复访本节点旧 note 失效);`progressChecker`+`hasProgress`;pending 写/认领/清扫;`resolveSessionId` 各平台 + 缺失;截断常量。
- cli 单测:`task start` 仅新建路径写 task_created + 回填(有/无 sid、有/无 pending、两 sid 隔离);`note` 落事件(by=slug、currentNode 为 null 拒);`checklist done` 落 checkpoint + 改文件、已 done 幂等、其余命令不落事件、坏 id 报错;`next` note/progress 门禁拒绝/通过/rewind 后;hook 两 hook 各分支。
- app:`readTimelineView` 严格升序 + 过滤 prompt + 合成起点 + 回填 session_start 排在 task_created 之上;`readPromptsView`;`formatEventTime` 固定 tz 断言;progress 双源。
- 手验(agent-browser):UTC+8 时间线日期/顺序;新会话建任务回填带快照且排在「任务创建」之上;5 节点未 note 各被拒;对话折叠分区;新任务 checklist 经命令建出并驱动进度与归档。
- 平台契约(手验,②③ 命脉):确认 Claude Code SessionStart hook stdin JSON 带 `session_id`、UserPromptSubmit 带 `prompt`,且 SessionStart 的 `session_id` 与 bash 侧 `CLAUDE_CODE_SESSION_ID` **相等**(否则回填永不命中,降级为不回填)。

## Risks and Rollback

- 风险:note 门禁误卡 → 缓解:仅查本轮 note,reason 明确,写一条即过;`--skip` 人工旁路既有。
- 风险:5 节点强制 note 在轻量节点(check/finish)增摩擦 → 缓解:每节点一句即过,换取每节点可追溯小结(PRD 已定全节点)。
- 风险:每轮 prompt + 每会话 snapshot 增 events 体量/ git diff → 缓解:`PROMPT_MAX`/`SNAPSHOT_MAX` 截断;入 git 已确认。
- 风险:会话 ID 两侧不相等 → 回填静默失效;缓解:soft-fail 降级不回填、不报错,手验环节验证相等性。
- 回滚:四块解耦,可按 ①/②/③/④ 单独回退;schema 仅增 optional 字段/类型,回退不影响已写数据读取。
