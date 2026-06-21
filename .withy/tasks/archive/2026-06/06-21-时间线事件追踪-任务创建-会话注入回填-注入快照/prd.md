# 时间线事件追踪:任务创建/会话注入回填/注入快照

## Goal

让任务时间线成为对「任务生命周期 + 注入 + 节点小结 + 用户对话 + 实施进度」忠实、可追踪、可读的记录;并把实施进度从手编 `implement.md` 勾选框,改为命令托管的 `checklist.json`。

## Confirmed Facts

- 事件 schema 共 6 种,无 `task_created`(`packages/core/src/types.ts:133-165`)。
- `withy task start` 只写 task/state/pointer,从不 `appendEvent`(`packages/cli/src/commands/task.ts:113-115`)。
- `session_start` 仅在解析到活跃任务时写入(`packages/cli/src/commands/hook.ts:22`);创建任务那次会话因任务尚不存在而丢失。
- `session_start.injected` 只存条目 ID;注入正文 `result.text` 仅 stdout、不落盘(`packages/core/src/session/hook.ts:73`)。
- 仅 `session-start` hook 写事件;`user-prompt-submit` 只输出文本不写事件(`packages/cli/src/commands/hook.ts:32-38`)。
- 时间线/归档直接切 UTC 串、不转时区(`detail.tsx:103-104`、`archived.ts:16-25`);时间线倒序「最新在上」(`dashboard.ts:218`)。
- 进度由 `implement.md` 的 checkbox 正则解析(`store/meta.ts:24`);归档门禁读它(`task/service.ts:57-60`);dashboard 进度也读它;brainstorm 技能声明「progress is parsed from this file」(`templates/common/skills/brainstorm/SKILL.md:183`)。
- workflow 规划节点产物门禁要求 `implement.md` 存在(`.withy/workflows/default.workflow.json:28-31`;模板 `packages/cli/src/templates/workflow/workflow.json`);门禁 `artifactsChecker` 要求每个列出产物存在且非空(`packages/core/src/workflow/gate.ts:22-26`),并以「加 checker + Gate 字段」为扩展点(`gate.ts:5-8`)。
- 技能源在 `packages/cli/src/templates/common/skills/<name>/SKILL.md`(`.claude/skills/` 为安装副本)。
- `.withy/runtime/` 是现成 gitignored 瞬态目录(`paths.ts:80`);`.withy/tasks/` 纳入 git 提交。
- 会话 ID 两端可得:SessionStart hook 经 stdin JSON 拿 `session_id`;bash 侧有 `CLAUDE_CODE_SESSION_ID`(已验证)。当前仅配置 SessionStart/UserPromptSubmit 两个 hook(`.claude/settings.json`)。

## Requirements

### ① 展示层修复
- 时间线与归档时间按开发者本地时区展示。
- 执行时间线正序展示(最早在顶、最新在底),与阶段条同向。

### ② 注入追踪
- 时间线有明确「任务创建」事件,时间戳 = `task.createdAt`;时间线一律严格按事件 `ts` 升序展示(见 ①)。无前置回填时它即首条;有回填时同会话的 `session_start` 因启动时刻更早而排在其上(忠实反映「先开会话、后建任务」)。
- 创建任务那次会话的注入回填进该任务,保留原始会话启动时间戳。
- 回填按 `session_id` 精确归属本会话,并发会话不串;拿不到会话 ID 则不回填(宁缺勿错)、不报错、不阻塞。
- `session_start`(及回填的注入)保存注入内容快照(有长度上限),详情可展开查看。

### ③ 节点小结 + 用户对话留痕
- 新增 `withy note "<summary>"`,为当前节点写一条 AI 语义叙事小结(agent 产出);`currentNode` 为 null(工作流已收束)时拒绝;事件 `by` = 当前开发者 slug。
- 工作流全部 5 个 skill 节点(brainstorm/grill-me/dev/check/finish)完成都需一条本节点小结;以 `withy next` **硬门禁**保证(本轮无小结不能推进),门禁以新增 gate checker 实现;这 5 个节点的技能源都加「收尾 `withy note`」步骤,缺一会让对应节点 `withy next` 卡住却无指引。
- `user-prompt-submit` hook 在有活跃任务时记录用户 prompt **原文截断**(确定性、每条;无活跃任务不记),写入 `events.jsonl`。
- 用户 prompt 与里程碑事件**同列于执行时间线**(按时间排序),其正文像会话注入快照一样**就地折叠展开**,不单独成区。
- 工具调用不记;不新增 per-prompt AI 摘要命令;不保留通用 `injection` 事件。

### ④ 实施清单(checklist.json,取代 implement.md)
- 新增 `checklist.json` 产物,**完全取代 `implement.md`**:步骤的增/改/删/勾选全部经 `withy checklist` 命令托管,不再手写 markdown。
- 条目形如 `{ id, text, verify?, done }`;命令含 `add`/`done`/`undone`/`edit`/`remove`/`list`。
- 仅 `done` append 一条 `checkpoint` 事件(进里程碑时间线);add/edit/remove 只改文件、不进时间线。`done` 幂等:对已 done 的 id 再 `done` 为空操作、不重复落 checkpoint;`undone` 后再 `done` 视为重新完成、落新 checkpoint。
- 归档门禁与 dashboard 实施进度读 `checklist.json`(唯一进度源,无 implement.md 回退);既有任务已一次性迁移到 `checklist.json`。
- workflow 规划节点产物门禁由「列 implement.md 文件」改为**进度门禁**:`checklist.json` 非空即过。
- brainstorm 经 `withy checklist add` 建清单(不再写 implement.md);dev/finish 技能改为基于 `checklist.json`;技能与 workflow 模板改后 rebuild 并重装。
- 移除 core 的 `implement.md` 读取路径(解析器 / `readImplementation` / `unparsed` 概念一并删除);既有 5 个任务(含本任务)的 implement.md 已迁移为 checklist.json 并删除原文件。

## Acceptance Criteria

- [ ] 时间线与归档时间显示为本地时区,跨午夜日期正确(UTC+8 下 06-20T16:26Z 显示 06-21 00:26)。
- [ ] 同一任务里程碑时间线自上而下严格按 `ts` 升序,brainstorm 在顶、finish 在底。
- [ ] 新建任务产生「任务创建」事件,时间戳 = `task.createdAt`;无前置回填时它是首条;有回填时同会话 `session_start`(更早 ts)排在其上。老任务无该事件时由 `createdAt` 合成置顶。
- [ ] 无活跃任务的会话内创建任务后,该会话创建前的注入作为该会话 session_start 出现,时间戳为会话启动时刻,并据此(早于 createdAt)排在「任务创建」之上。
- [ ] 两并发会话各自注入,旧会话内创建任务只回填旧会话那条,不串入新会话。
- [ ] 会话 ID 不可得时不回填、不报错、不阻塞。
- [ ] session_start 事件含注入内容快照(超限截断),详情可展开查看文本。
- [ ] `withy note` 写入后产生含「节点 + 小结文本」的记录(`by`=开发者 slug);全部 5 个 skill 节点(brainstorm/grill-me/dev/check/finish)本轮无小结时 `withy next` 拒绝并提示 `withy note`,写后可推进;rewind 后需新一轮小结;`currentNode` 为 null 时 `withy note` 拒绝。
- [ ] 有活跃任务时每条 user prompt 在 events.jsonl 产生一条原文截断记录;无活跃任务时不产生;prompt 与里程碑事件同列于时间线(按时间),正文就地折叠展开。
- [ ] `withy checklist add/done/undone/edit/remove/list` 可托管 `checklist.json`;`add` 分配稳定单调 id 并经 `--json` 返回;`done/undone/remove` 支持多 id 批量;仅 `done` 每 id 落 `checkpoint` 事件,且对已 done 的 id 幂等(不重复落)。
- [ ] 新任务 brainstorm 经命令建出 `checklist.json` 并过规划进度门禁;dashboard 进度与归档门禁读 `readProgress`(仅 checklist.json);未完项>0 时归档被拒。
- [ ] 既有 5 个任务的 implement.md 已迁移为 checklist.json(done 状态保留)并删除原文件;core 不再有 implement.md 读取路径,dashboard 进度展示不变。

## Out of Scope

- 不记录工具调用;不新增 per-prompt AI 摘要命令;不做通用 `injection` 事件。
- 不改工作流节点业务定义(除 ③ 硬门禁、④ 进度源/门禁接入与技能改写所必需)。
- 不穷尽适配跨平台会话 ID;非当前平台至少做到「拿不到就降级不回填」。
- 不在 hook 内调用 LLM。

## Open Questions

- None.
