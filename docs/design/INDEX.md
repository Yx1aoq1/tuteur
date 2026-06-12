# Tuteur 设计文档索引

> 这是 `docs/design/` 的入口。**先读本页,再按需跳转。**
> 背景见 [../PRD.md](../PRD.md)、[../ARCHITECTURE.md](../ARCHITECTURE.md);本目录是实施规格级的分域细化。
> 主线:**唯一逻辑层 `@tuteur/core` + 唯一入口 `ttur` + hook 薄转发 + 双层(全局/项目)+ InitConfig 统一初始化 + 注册表/per-agent configurator/通用层 + 节点图 workflow(skill/decision 两类节点)+ 分支信号(agent 产信号、harness 路由)。**
> 参考实现:Trellis(`mindfold-ai/Trellis`)—— configurator 三层、归档移目录、身份 gitignore、per-agent flag;**反向教训**:其禁止 home 运行,我们做全局时设了安全边界(core §2.3)。

---

## 1. 文档地图(5 份)

| 文档 | 讲什么 | 何时读 |
| --- | --- | --- |
| [core.md](./core.md) | **事实源**:`@tuteur/core`、双层数据格式、用户模型、**节点图 workflow/state**、InitConfig、归档、**skill 发现**、数据契约 | 读写 `.tuteur/`、类型、门禁、全局/项目、用户、初始化、归档、契约时 |
| [cli.md](./cli.md) | `ttur` 命令(`complete <node>`/`hook`/`skill list`/`--global`)、注册表+per-agent configurator+通用层、模板更新 | 改命令、加 agent 平台、做 hook 入口、skill 发现时 |
| [harness.md](./harness.md) | 节点图门禁、**分支信号三类来源**、上下文流转、hook 薄转发、**节点级 agent + 子 agent**、用户扩展 | 做门禁、分支、写 hook、定注入、派子 agent 时 |
| [web.md](./web.md) | 多项目+全局 dashboard、**workflow 画布编辑**、页面、API、web 触发 init | 做 UI、画布、加 API 时 |

**依赖方向**:cli / harness / web 都引用 **core**。数据 schema、双层模型、节点图、用户模型、InitConfig、归档、skill 发现、数据契约只在 core 定义一次,其余引用不重写。

---

## 2. 针对历轮不满的解法

| 你的不满 | 解法 | 落点 |
| --- | --- | --- |
| 流程用 CLI、session 用 py 不统一 | hook 退化为薄转发 → `ttur hook <event>`,逻辑全在 core | harness §0/§6、cli §8.4 |
| 读本地数据未抽公共 util | `@tuteur/core` 唯一读写层,cli/app/hook 共用 | core 全文 |
| 用户数据无管理 | `.user`+`members.json`+`workspace/<user>/`;项目过滤、全局不过滤 | core §3 |
| web 页面没对齐 | 多项目看板+全局配置+项目过滤+web 触发 init | web §2/§3 |
| agent 接入无统一流程 | **注册表 + per-agent configurator + shared 通用层**(Trellis 风格) | cli §8 |
| 无数据契约 | 四方数据通道契约(机制,产物按需,不绑每步) | core §7 |
| web/cli 交互不统一 | **InitConfig** 统一模型,flag/交互/web 表单同源,serializeToCommand | core §8、cli §4.1 |
| 归档绑产物、逻辑不清 | 归档=改状态+移整个目录到 `tasks/archive/`,**不绑产物** | core §9 |
| `--agents`/`skill-mode` 命名 | per-agent flag(`--codex`)+ `skills`(`--copy`) | cli §4.1 |
| 数据结构不满意 | 按全局/项目分层逐文件重定义 + web 用途标注 | core §2/§4 |
| workflow 需画布+分支 | 节点图(skill/decision)+ 画布编辑;分支=agent 产 decision.json、harness 路由 | core §4.3、harness §2.5、web §3.3 |
| 读不到本地 skill | `discoverSkills`:configurator+shared 扫项目+全局各 agent,带 source tag | core §5.1、cli §8.6 |
| 工程化:节点 agent/子 agent | 节点级 `agent` 指派 + `subagent.isolate` 隔离上下文 | harness §7 |
| 去掉 phases 怎么看主体流程 | phase 保留为**节点标签**(粗粒度阶段)+ 节点图(细粒度) | harness §1 |
| web 不实时 | chokidar watch `.tuteur/` + SSE 推送局部刷新 | web §4.2 |
| 多任务并行 | opt-in worktree,集中 `~/.tuteur/worktrees/<project>/<taskId>` | core §9.1 |

---

## 3. 实现状态矩阵

> **当前只实现初始化与模板管理骨架。** 驱动闭环的核心(core 包、task/complete/hook、门禁、adapter、UI 视图、多项目)全部待实现。标 `[待实现]` 为推荐方案,可调但应守契约。

| 能力 | 状态 | 落点 |
| --- | --- | --- |
| `ttur init` / `dashboard` / `update` / `uninstall` | ✅ 已实现 | cli §4 |
| configurator(Codex/Gemini 空、Claude 仅 skill) | ⚠️ 待补全为注册表+per-agent+通用层 | cli §8 |
| dashboard 用户识别+任务计数(单项目) | ✅ 已实现(待并入 core) | web §3 |
| **`@tuteur/core` 包** | ❌ 未建 | core 全文 |
| 双层(全局/项目)模型 + projects 注册表 | ❌ 未实现 | core §2 |
| InitConfig 统一初始化(flag/交互/web 同源) | ❌ 未实现 | core §8 |
| `ttur task`(含归档移目录) / `complete` / `hook` | ❌ 未实现 | cli §5、core §9 |
| workflow 节点图 + 分支信号(decision/classify) | ❌ 未实现 | core §4.3、harness §2.5 |
| 节点门禁 completeNode + advanceWorkflow(沿边+decision) | ❌ 未实现 | harness §2/§3 |
| skill 发现(跨 agent + 项目/全局,带 tag) | ❌ 未实现 | core §5.1、cli §8.6 |
| 节点级 agent 指派 + 子 agent 隔离 | ❌ 未实现 | harness §7 |
| workflow 画布编辑(skill/decision 节点) | ❌ 未实现 | web §3.3 |
| 实时更新(chokidar watch + SSE) | ❌ 未实现 | web §4.2 |
| worktree 多任务并行(opt-in,全局集中) | ❌ 未实现 | core §9.1 |
| 上下文流转 planned/actual + 回写 | ❌ 未实现 | harness §4 |
| hook 薄转发 + `ttur hook` 注入 | ❌ 未实现(现全占位) | harness §6 |
| skill 正文(5 个 SKILL.md 全 TODO) | ❌ 未实现 | harness §5 |
| Codex adapter + run 记录 | ❌ 未实现 | harness §7 |
| 多项目 dashboard + 全局配置 + web 触发 init | ❌ 未实现 | web §2-§6 |
| members / approval 读写 | ❌ 未实现 | core §3、web §6 |

---

## 4. 核心概念速查

| 术语 | 一句话 | 详见 |
| --- | --- | --- |
| Scope | 全局(`~/.tuteur`)或项目(`<repo>/.tuteur`)根;全局不过滤用户,项目过滤 | core §2 |
| @tuteur/core | 唯一碰盘 + 门禁 + 类型层,cli/app/hook 共用 | core §1/§5/§6 |
| 节点图 workflow | skill 节点(单入单出)+ decision 节点(单入多出);出边内嵌 next/branches | core §4.3 |
| 节点门禁 | `completeNode` 判 artifact/check/approval;decision 自动求值推进 | harness §2/§3 |
| 分支信号 | 确定性 / agent 分类(decision.json)/ 人工;**agent 产信号不选路** | harness §2.5 |
| skill 发现 | `discoverSkills` 扫项目+全局各 agent,带 agent/source tag | core §5.1 |
| 上下文流转 | context.json → plannedContext → hook 注入 → actualContext → run 回写 | harness §4 |
| Hook 薄转发 | py 脚本只 `exec ttur hook <event>`,逻辑在 core | harness §6 |
| Agent 接入 | 注册表(数据)+ per-agent configurator(行为)+ shared(生成) | cli §8 |
| InitConfig | flag/交互/web 表单同源产出,统一执行 + 序列化成命令 | core §8 |
| 归档 | 改状态 + 移整个任务目录到 `tasks/archive/`,不绑产物 | core §9 |
| 数据契约 | 四方数据通道(机制,产物按需,不绑每步) | core §7 |
| 用户模型 | `.user`+`members.json`+`workspace/<user>/` | core §3 |
| 主体流程 vs 步骤 | phase 标签(粗:planning/execute/finish)+ 节点图(细) | harness §1 |
| 实时更新 | chokidar watch `.tuteur/` + SSE 推浏览器局部刷新 | web §4.2 |
| worktree 并行 | opt-in,`~/.tuteur/worktrees/<project>/<taskId>`,任务级隔离 | core §9.1 |

最重要不变量:**run 成功 ≠ 节点完成**;完成只由 `completeNode` 判定。

---

## 5. 落地优先级(P0 有序)

```text
P0(主闭环,先地基后闭环)
  1. @tuteur/core:包+zod类型+双层 paths+store              core K1-K3
  2. domain:completeNode/advanceWorkflow(节点图+decision 求值)+单测  core K4 / harness H2-H3/H9
  3. InitConfig + INIT_QUESTIONS + serializeToCommand          core K6 / cli C6
  4. cli/app 改依赖 core,删重复读盘与常量                    cli C1 / web W1
  5. ttur task create/list/status/archive(归档移目录)        cli C2 / core §9
  6. 默认 workflow 改节点图(含 classify→route 分支)          harness H1
  7. ttur complete <node>(调 core,退出码 0/2)              cli C3
  8. ttur hook session-start + 转发脚本 + planned/actual      harness H4-H5 / cli C4
  9. 注册表+per-agent configurator+hook 登记适配器            cli C5
 10. 填实 5 个 SKILL.md + classify skill                      harness H6
 11. web 项目列表+任务看板+详情+web 触发 init                 web W2-W3

P1:节点级 agent+子 agent(H7-H8)、skill 发现(K9/C10/W11)、workflow 画布(W10)、
    实时更新 watch+SSE(W13)、worktree 并行(K11/C12/W14)、
    Codex adapter+run(W4)、approval(H11/W6)、全局配置页(W5)、context 页(W7)、
    --global(C7)、standalone(W9)、skillRef 校验(H10)
P2:人工分支、workflow validate、artifact 查看器、members、inject-workflow-state hook
```

---

## 6. 待产品确认汇总(推荐已给,❓需拍板)

| 主题 | 推荐 | ❓ |
| --- | --- | --- |
| 全局根放 tasks | **已定:否**,全局只放 config+注册表+模板 | |
| 加项目无 .tuteur 时 | **已定:做「初始化项目」按钮**,web 经非交互 init 触发 | |
| agent 接入方式 | **已定:注册表+per-agent configurator+通用层**(Trellis 风格) | |
| `--agents`/`skill-mode` 命名 | **已定:per-agent flag(`--codex`)+ `--copy`** | |
| 归档逻辑 | **已定:移目录+改状态,不绑产物** | |
| workflow 模型 | **已定:统一节点图**(skill/decision 两类节点) | |
| 画布编辑 MVP | **已定:可编辑画布**,仅 skill+分支节点、单入单出 | |
| 分支判断机制 | **已定:agent 产 decision.json 信号,harness 路由** | |
| 节点 agent / 子 agent | **已定:两者都进 MVP** | |
| 实时更新机制 | **已定:文件监听(chokidar)+ SSE** | |
| worktree 并行 | **已定:opt-in,集中放 `~/.tuteur/worktrees/<project>/<taskId>`** | |
| phase 去留 | **已定:保留为节点标签**(主体阶段概览 + task.status) | |
| 归档是否按 `archive/<YYYY-MM>/` 分桶 | 是(对齐 Trellis);MVP 可先平铺 `archive/<id>/` | ❓ |
| 身份/配置文件格式 | 统一 JSON(web 读写一致),不引入 YAML | ❓ |
| `ttur run <step>` 进 MVP | 进,仅 Codex 薄封装 | ❓ |
| actualContext 采集精度 | MVP 用 hook emit 列表近似 | ❓ |
| web 是否可编辑 artifact | 只读 + approval/context 编辑 | ❓ |
| core 是否独立发包 | 内部私有包,随 cli/app 构建 | |
| 子 agent 上下文 | 不进 MVP | |

---

## 7. 维护约定

- 数据结构/双层/用户/契约只在 **core.md** 改,其余引用。
- 新「已实现」能力 → 更新 §3 状态矩阵(❌→✅)。
- 推荐方案被采纳/否决 → 更新对应 §9.3 与本页 §6,去掉 `[待实现]`/❓。
- 实施规格定位,不写营销话术;每条主张可追溯到代码或明确标注推荐。
