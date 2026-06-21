---
id: node-gate-checkers
title: 节点门禁扩展:note / progress 与 checklist 进度源
scope: project
kind: spec
tags: [withy, gate, checklist, progress, note, workflow]
summary: 门禁=checker+Gate 字段的扩展范式;note 门禁的「新鲜度 floor」算法;progress 门禁为何用独立 checker 而非 AND-list 产物;checklist.json 为唯一进度源。
inject: index
injectByDefault: false
covers: [packages/core/src/workflow/gate.ts, packages/core/src/store/checklist.ts, packages/core/src/task/checklist.ts]
sources: []
updated: 2026-06-21
---

# 节点门禁扩展:note / progress 与 checklist 进度源

> 门禁系统(`core/workflow/gate.ts`)是 checker 注册表:**加一种门禁 = 加一个 checker + 一个 `Gate` 字段**,不动引擎/步进策略。IO 经 `GateContext` 注入,保持纯函数可单测。本页记录本轮新增的两种门禁与进度源切换。门禁全貌见 [[harness]];Gate schema 与 checker 落点见 [[core]] §4.3/§6;`withy note`/`withy checklist` 命令面见 [[cli]] §3.1/§3.3;事件侧见 [[task-event-timeline]]。

## 1. note 门禁与「新鲜度 floor」(非显然)

`Gate.note: true` 要求当前节点**本轮**有一条 `withy note` 小结才能 `withy next`。难点是判定「本轮」——`runtime.ts:hasFreshNote(events, node)`:

- floor = 该节点 `rewind{node}` 与 `complete_attempt{node, ok:true}` 的**最大 ts**;一条 note 有效当且仅当 `note.ts ≥ floor`(floor 不存在=首次进入 → 任意该节点 note 即可)。
- 关键洞察:events.jsonl 是 append-only,**历史 complete_attempt 不被 rewind 删除**。所以「rewind 到祖先后再次穿过本节点」时,上一轮的旧 note 因早于上次完成 ts 而自动失效,迫使补写新 note。复访场景靠这条才正确。
- 失败的 `complete_attempt{ok:false}` 不抬升 floor(只有成功完成才算「上一轮结束」)。

覆盖范围:workflow 模板 5 个 skill 节点(brainstorm/grill-me/dev/check/finish)gate 全加 `note:true`,对应 5 个 SKILL.md 都加「收尾 `withy note`」步骤——**漏一个**,那个节点的 `withy next` 会卡住却无指引。`withy note` 在 `currentNode` 为 null 时拒绝,`by`=开发者 slug。

## 2. progress 门禁:为何是独立 checker 而非列产物

规划节点需要「存在非空实施计划」才放行。**不能**把 `checklist.json` 当普通 `artifacts` 列出:`artifactsChecker` 是「列表内全部存在」的 **AND-list**,且早先列 `implement.md` 时也只是文件存在检查。正确做法是按扩展范式新增 `Gate.progress: true` + `progressChecker`,`hasProgress` 走 `readProgress`(见下)判断有无非空计划。这样语义清晰、与 note 门禁同构。

## 3. checklist.json 为唯一进度源(已取代 implement.md)

- `checklist.json`(`{ nextId, items:[{id,text,verify?,done}] }`)由 `withy checklist add/done/undone/edit/remove/list` 命令托管;`nextId` 单调、**id 永不复用**(删除不重编号)。
- 仅 `done` 对「未完成→完成」的 id 落一条 `checkpoint` 事件;已 done 幂等(不重复落)。坏 id 报错非静默。
- `store/checklist.ts:readProgress` 是**唯一进度源**:仅读 `checklist.json`(缺失 → `source:'none'`),供归档门禁、dashboard 计数与详情列表共用。`implement.md` 的读取路径(解析器/`readImplementation`/`unparsed` 概念)已删除,既有任务一次性迁移(旧 md → checklist.json,保留 done)。
- 交互契约:`checklist.json` 是 dev 节点的步骤契约,`add --json` 即时返回分配的 id,agent 手中始终有当前条目+id,`list` 仅用于断线重连重新对齐。

## 4. 踩过的坑:浅拷贝共享内嵌数组

`readChecklistOrEmpty` 早先写成 `return readChecklist(...) ?? { ...EMPTY_CHECKLIST }`,其中 `EMPTY_CHECKLIST` 是模块级常量。`{...x}` 只浅拷贝顶层,**`items` 数组仍是同一引用**——于是每个「空清单」都往同一个数组里 push,跨任务串数据(单测 `edit/remove` 暴露)。修法:空值返回**新建**结构(`() => ({ nextId:1, items:[] })`)。教训:任何「默认空值」含可变内嵌结构时,必须每次新建,不能 spread 一个共享常量。
