---
id: status
title: '实现状态(已完成 / 未完成)'
scope: project
kind: overview
tags: [withy, status, roadmap]
summary: 'Withy 各域(core/cli/harness/web)的实现状态清单:已完成 ✅ / 进行中 🟡 / 未完成(❌·P0–P2)。设计页只述核心设计与规划,落地状态集中在此一页,避免双份漂移。'
inject: index
injectByDefault: false
updated: 2026-06-22
---

# 实现状态(已完成 / 未完成)

各设计页只述**核心设计与规划**;**实现进度集中在本页**,新「已实现」能力在此更新对应行,不再回灌设计页。

图例:✅ 已实现 · 🟡 部分/进行中 · ❌ 未做 · P0–P2 优先级(未排期)。

## Core(@withy/core)

| #   | 项                                                                                       | 状态                                            |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| K1  | `@withy/core` 包骨架 + zod 类型                                                           | ✅ 已实现                                       |
| K2  | `paths`:双层 Scope + detectWithy + 全局安全边界                                           | ✅ 已实现                                       |
| K3  | `store`:全部读写 + 损坏文件快速失败                                                       | ✅ 已实现                                       |
| K4  | `workflow`(engine/interpret/gate/runtime)+ `task`(archive 等)+ 单测                       | ✅ 已实现                                       |
| K4a | `nextNode`/`withy next`:读当前节点、唯一推进门禁、switch 分支提示;删 `complete`           | ✅ 已实现                                       |
| K5  | `context`:resolvePlannedContext                                                           | ✅ 已实现                                       |
| K6  | `init-config`:InitConfig + INIT_QUESTIONS + serializeToCommand                            | 🟡 core/CLI 已实现;web 接入待补                 |
| K7  | cli/app 改依赖 core,删重复读盘与常量                                                     | 🟡 CLI 已接入;app 仍有待办                      |
| K8  | listDevelopers / approval / projects 读写                                                 | 🟡 approval/projects 已实现;listDevelopers 待补 |
| K9  | `discoverSkills`:项目 + 各 agent home,带 tag                                             | 🟡 基础版已实现                                 |
| K10 | `events`:appendEvent/readEvents + 阈值告警                                                | ✅ 已实现                                       |
| K11 | 当前任务指针:read/write/clear + resolveCurrentTask                                        | ✅ 已实现                                       |
| K12 | worktree 并行(已后置,方案存档)                                                           | P2                                              |
| K13 | `gate.artifacts` 升级 `ArtifactSpec` + validate template                                  | 🟡 ArtifactSpec 已实现;模板注入待补             |
| K14 | `checklist.json` + `withy checklist` 托管 + `readProgress` 唯一进度源(取代 implement.md) | ✅ 已实现                                       |
| K15 | 注入形态:`inject:full\|index` + `resolvePlannedContext` 返回带形态正文                    | ✅ 已实现                                       |
| K16 | `knowledge`:`covers`/`cover` 边 + `graph.json` 派生缓存 + 关系查询 + lint 悬空 covers     | ✅ 已实现                                       |

## CLI(@withy/cli)

| #   | 项                                                                                   | 状态                                       |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| C1  | CLI 改依赖 `@withy/core`,删自有读盘/常量                                             | ✅ 已实现                                   |
| C2  | `task start`(建/聚焦合一)/`list`/`status`/`archive`                                  | ✅ 已实现(assign 已删,改派手编 task.json)  |
| C3  | `next`(当前节点门禁、switch `--branch`、`--skip` 留痕)+ `rewind` + `approve`         | ✅ 已实现(`complete` 已删除)               |
| C4  | `hook <event>` + hook 声明文件 + session_start 回写                                   | 🟡 session-start;per-turn/子 agent 待补     |
| C5  | 数据注册表 + PLATFORM_CONFIGURATORS 行为表 + 模板树承载 hook                          | ✅ 已实现                                   |
| C6  | InitConfig 三输入(flag/交互/web)+ serializeToCommand                                 | 🟡 CLI/core 已实现;web 表单待接入           |
| C7  | `init --global` / `uninstall --global` / dashboard 多项目                            | 🟡 CLI 已实现;web 多项目待补                |
| C8  | `knowledge graph/index/lint/related/coverage`(分 scope)                              | ✅ 已实现                                   |
| C9  | 全局 `--json` flag + 每命令人读渲染                                                   | ❌ 待实现(当前 agent 命令恒 JSON)          |
| C10 | `checklist.json` 由 `withy checklist` 托管 + `readProgress` 唯一进度源               | ✅ 已实现                                   |
| C11 | `workflow validate` CLI 命令删除(`validateWorkflow` 仍作 core 函数)                  | ✅ 已实现                                   |
| C12 | `discoverSkills` 富化(按 agent 细分 tag)                                             | 🟡 基础版已实现                             |
| C13 | workflow 类 skill 正文 + `withy-knowledge`                                            | ✅ 已落地                                   |
| C14 | `task start --worktree`(已后置)                                                      | P2                                         |

## Harness(状态机/门禁/hook)

| #   | 项                                                                              | 状态                                          |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| H1  | 默认 workflow 改固定三阶段 + 节点图 + gate 门禁                                 | ✅ 已实现                                      |
| H2  | `advanceWorkflow` + `rewindTo` + 单测                                           | ✅ 已实现                                      |
| H3  | 推进门禁(skill 走 gate / switch 带 --branch;失败不改 state)                     | ✅ 已实现(迁为 `nextNode`)                     |
| H3a | `withy next`/`nextNode`:读当前节点、唯一推进门禁、switch 分支提示;删 `complete` | ✅ 已实现                                      |
| H4  | `withy hook session-start`(分段注入 + 多态 Next-Action)+ hook 声明文件          | ✅ 已实现(session-start)                       |
| H5  | plannedContext + session_start 回写 + 平台信封适配                              | 🟡 planned/session_start 已实现;平台信封待补   |
| H6  | 填实 5 个 SKILL.md + `withy-knowledge`                                          | ✅ 正文已落地(子 agent 调度协议待补)          |
| H7  | `withy task start` + resolveCurrentTask                                         | ✅ 已实现                                      |
| H8  | `next` 成功接力 JSON + switch 接力                                              | ✅ 已实现                                      |
| H9  | switch 判定(--branch/--reason)+ `withy rewind`                                  | ✅ 已实现                                      |
| H10 | skill 解析与 validate                                                           | ✅ 已实现                                      |
| H11 | approval 读写 + `withy approve`(当前节点,无 node 参数)                          | ✅ 已实现                                      |
| H12 | `inject-workflow-state` / `inject-subagent-context` hook                        | 🟡 部分(无任务提醒已落地);breadcrumb/子 agent 待补 |
| H13 | `renderSessionStart` 分 section + `<current-state>` git 块 + 接通 `.withy/guide.md` | ✅ 已实现                                      |
| H14 | `resolvePlannedContext` 返回 `PlannedEntry[]`(带 mode)+ 按形态注入              | ✅ 已实现                                      |
| H15 | session-start 走到声明 `template` 的节点时注模板正文                            | P1                                            |

## Web(@withy/app)

| #   | 项                                                                  | 状态      |
| --- | ------------------------------------------------------------------ | --------- |
| W1  | app 依赖 core,替换 summary.ts/product.ts                           | ✅ 已实现 |
| W2  | 项目列表 + 加项目/切换                                              | ✅ 已实现 |
| W3  | 任务看板 + 详情                                                     | ✅ 已实现 |
| W4  | 事件时间线页 + 注入对比                                             | 🟡 P1     |
| W5  | 全局配置页(`/settings`)                                            | 🟡 P1     |
| W6  | approval 面板                                                      | 🟡 P1     |
| W7  | 注入编排器页(`/p/context`,default/node + 实时预览)                | 🟡 P1     |
| W7b | 知识库管理页(全局+项目两区 CRUD + md 渲染)                        | ✅ 已实现 |
| W7c | 知识库图谱视图(全局/项目/合并三档)                               | 🟡 P2     |
| W8  | 推进按钮(next)→ 复用 core                                          | 🟡 P1     |
| W9  | standalone server                                                  | 🟡 P1     |
| W10 | workflow 画布编辑(自由画布 + 软泳道,React Flow)                  | ✅ 已实现 |
| W11 | skill 选择器 + skill 发现                                           | ✅ 已实现 |
| W12 | 归档按钮 + 活跃/已归档切换                                          | ✅ 已实现 |
| W13 | 实时更新:chokidar watch + SSE                                      | 🟡 P1     |
| W14 | worktree/branch 展示(已后置)                                      | P2        |
| W15 | artifact 查看器 / members 页                                       | P2        |
| W16 | 任务详情三层进度(phase/gate/checklist)+ 实施计划只读渲染          | ✅ 已实现 |
| W17 | session-start 预览 + 画布节点产物清单/模板引用                      | P2        |

---

## 关联

- 需求侧(PRD):[[prd]]
- 分域设计:[[core]] · [[cli]] · [[harness]] · [[web]] · [[knowledge-base]]
