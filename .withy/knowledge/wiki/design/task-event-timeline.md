---
id: task-event-timeline
title: 任务事件流与时间线展示
scope: project
kind: spec
tags: [withy, events, timeline, session, hook, dashboard]
summary: events.jsonl 判别联合事件模型与前向兼容、会话注入回填的两侧 session-id 契约、dashboard 时间线本地时区+严格升序+prompt 就地折叠。
inject: index
injectByDefault: false
sources: []
updated: 2026-06-21
---

# 任务事件流与时间线展示

> `tasks/<id>/events.jsonl` 是任务执行的 append-only 真相流;dashboard 时间线是它的只读投影。本页记录几处不查代码就会重新踩的约定。详见 [[harness]](门禁/hook)、[[core]](store)、门禁侧见 [[node-gate-checkers]]。

## 1. 事件模型(判别联合,按 `type` 分立)

`TaskEventSchema`(`core/types.ts`)是 `z.discriminatedUnion('type', …)`。除原有 `complete_attempt`/`decision`/`rewind`/`skip`/`approval`/`session_start` 外,新增:

- `task_created { ts, by? }` —— 时间线起点,`ts = task.createdAt`,只在 `task start` **新建路径**写(focus 既有任务路径 `emit` 即 `process.exit`,不重复写)。
- `note { ts, node, summary, by? }` —— 节点小结,note 门禁的证据(见 [[node-gate-checkers]])。
- `prompt { ts, text }` —— 用户消息原文,截断 `PROMPT_MAX`(500),仅 user-prompt-submit hook 在有活跃任务时写。
- `checkpoint { ts, id, text }` —— checklist 条目「未完成→完成」时落,见 [[node-gate-checkers]]。
- `session_start` 增 `snapshot?` —— 注入正文快照,截断 `SNAPSHOT_MAX`(4000)。

## 2. 前向兼容靠 `readEvents` 的 safeParse

`store/events.ts:readEvents` 对每行 `TaskEventSchema.safeParse`,**解析失败的行直接跳过**(`if (parsed.success) push`)。因此老版本 core 读到新事件类型会**静默丢弃、不抛**,时间线存活。这是「新增事件类型不破坏旧消费端」的依据——新字段一律 optional、新类型靠 safeParse 容错,无需迁移已写数据。

## 3. 会话注入回填:两侧 session-id 必须相等(命脉)

目标:在「无活跃任务的会话里创建任务」时,把这次会话**创建前**的注入回填进该任务,保留原始会话启动时间戳。

机制(`core/store/sessions.ts` + `cli/commands/{hook,task}.ts`):

1. `hook session-start` 无活跃任务 → `writePendingInjection(sid, {ts, injected, snapshot})` 存到 `.withy/runtime/sessions/<sid>.json`(gitignored)。
2. `task start` 新建后 → `sweepPendingInjections()`(24h 清旧)→ `resolveSessionId()` → `claimPendingInjection(sid)`(读后即删)→ 以**原 ts + snapshot** append 首条 `session_start`。

**linchpin**:回填能命中,要求 SessionStart hook 的 stdin JSON `session_id`(`sessionIdFromHookPayload`)与 bash 侧 `CLAUDE_CODE_SESSION_ID`(`resolveSessionId`,读 `AGENT_PLATFORMS[*].sessionIdEnv`)**是同一个值**。两者不等 → pending 永不被认领 → 静默降级为「不回填」,**不报错、不阻塞**(hook 一律 soft-fail)。跨平台 session-id 来源收在 `agents/registry.ts`,不在别处硬编码。

并发与降级:pending 按 sid 隔离,认领只取本 sid;一会话多次 `task start` 首个认领、其余无 pending;拿不到 sid 则不写 pending、不回填。

## 4. 时间线展示(dashboard,只读投影)

- **本地时区**:`Intl.DateTimeFormat`(`appTemplates/Board/components/time.ts` 单一来源)按开发者本机时区取分量拼 `MM-DD HH:mm`,**不要**直接切 UTC 串(会跨午夜日期漂移)。消费方用 `<time suppressHydrationWarning>` 兜 SSR/CSR 残余差异(dashboard 本机运行,server tz=browser tz)。
- **严格按 `ts` 升序**(`a.ts.localeCompare(b.ts)`),与阶段条同向(最早在顶)。
- **回填的 session_start 排在 task_created 之上**:它 ts(会话启动)< createdAt,严格升序下自然在前——这是刻意的「先开会话、后建任务」忠实顺序(经产品确认)。
- 老任务无 `task_created` 时,由 `createdAt` 合成一条置顶起点;有真实 `task_created` 则不特判。
- **prompt 与里程碑事件同列**(不单独成区),正文与 session_start 快照共用「就地折叠」交互(`TimelineRow` 的 `foldBody`)。
- `toTimelineEvent` 把各类型映射进 `TimelineEventView`(`summary`/`text`/`snapshot` 按类型取),未知类型降级中性行。
