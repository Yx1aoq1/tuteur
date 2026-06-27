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
status: stable
---

# 节点门禁扩展:note / progress 与 checklist 进度源

## 扩展范式:一个检查函数加一个开关

门禁系统(`core/workflow/gate.ts`)本质是一张检查函数(checker)注册表。新增一种门禁只做两件事:写一个检查函数、给 `Gate` 加一个开关字段。引擎和步进策略都不用动。

检查函数要读的数据(读盘、读事件)统一经 `GateContext` 注入,函数本身保持纯函数,方便单测。

## note 门禁:本轮必须留一条小结才放行

`Gate.note: true` 的节点,要求**本轮**写过一条 `withy note` 小结,才允许 `withy next`。难点是怎么判断「本轮」。

判断逻辑在 `runtime.ts:hasFreshNote(events, node)`,核心是一个时间下限(floor):

- floor 取该节点两类事件的最大时间戳:`rewind{node}` 与成功的 `complete_attempt{node, ok:true}`。
- 一条 note 有效,当且仅当它的时间戳 `≥ floor`;floor 不存在说明首次进入,任意一条该节点的 note 都算数。
- 失败的完成尝试(`ok:false`)不抬高 floor —— 只有成功完成才算「上一轮结束」。

**为什么要这个下限**:`events.jsonl` 只追加、不删除。rewind 回到祖先节点后再次经过本节点时,上一轮的旧 note 时间戳早于上次完成时间,自动失效,逼着补写新 note。复访场景靠这条才正确。

**覆盖范围**:workflow 模板里 5 个 skill 节点(brainstorm / grill-me / dev / check / finish)的 gate 都加了 `note:true`,对应 5 个 SKILL.md 也都加了「收尾写 `withy note`」这一步。漏配一个,那个节点的 `withy next` 会卡住却没有提示。另:`withy note` 在没有活跃节点时拒绝执行,`by` 字段记开发者 slug。

## progress 门禁:为什么单独写一个检查函数

规划节点要求「存在一份非空的实施计划」才放行。这里不能复用普通的 `artifacts` 列表检查。

原因:`artifactsChecker` 是「列表里的文件全部存在」的与逻辑(AND-list),只查文件在不在,不查内容空不空。把 `checklist.json` 塞进 `artifacts`,只能保证文件存在,保证不了计划非空。

正确做法是按扩展范式新增 `Gate.progress: true` 开关 + `progressChecker` 检查函数,通过 `readProgress`(见下)判断有没有非空计划。这样语义清晰,和 note 门禁同构。

## checklist.json:唯一的进度源(已取代 implement.md)

实施进度现在只认 `checklist.json` 一个来源,旧的 `implement.md` 读取路径已删除。

**数据结构与命令**:`checklist.json` 形如 `{ nextId, items:[{id,text,verify?,done}] }`,由 `withy checklist add/done/undone/edit/remove/list` 托管。`nextId` 单调递增,**id 永不复用**(删除条目不重新编号)。

**事件落点**:只有把某个 id 从「未完成」改成「完成」时,才落一条 `checkpoint` 事件;已完成的再 done 是幂等的(不重复落)。传坏 id 直接报错,不静默吞掉。

**唯一进度源**:`store/checklist.ts:readProgress` 是唯一的进度读取口,只读 `checklist.json`(文件缺失则返回 `source:'none'`)。归档门禁、dashboard 计数、详情列表都共用它。`implement.md` 相关的解析器、`readImplementation`、`unparsed` 概念全部删除,旧任务一次性迁移(旧 md 转成 checklist.json,保留完成状态)。

**交互契约**:`checklist.json` 是 dev 节点的步骤契约。`add --json` 即时返回分配好的 id,agent 手里始终握着「当前条目 + id」;`list` 只在断线重连、需要重新对齐时用。

## 踩过的坑:浅拷贝共享了内嵌数组

`readChecklistOrEmpty` 早先写成 `return readChecklist(...) ?? { ...EMPTY_CHECKLIST }`,其中 `EMPTY_CHECKLIST` 是模块级常量。

问题:`{...x}` 只浅拷贝顶层,**`items` 数组仍是同一个引用**。于是每个「空清单」都往同一个数组里 push,跨任务串了数据(单测 `edit` / `remove` 暴露出来)。

修法:空值时返回**新建**结构 `() => ({ nextId:1, items:[] })`。

**教训**:任何「默认空值」只要含可变的内嵌结构,就必须每次新建,不能 spread 一个共享常量。

## 关联

- 门禁全貌:[[harness]]
- `Gate` 字段定义与检查函数落点:[[core]] §4.3 / §6
- `withy note`、`withy checklist` 命令:[[cli]] §3.1 / §3.3
- 事件侧(note / checkpoint 事件):[[task-event-timeline]]
