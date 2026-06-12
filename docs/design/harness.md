# Harness 设计

> 定位:实施规格级。Tuteur「约束层」核心 —— workflow 状态机、`complete` 门禁、文档/提示词流转、hook 注入、用户扩展点。
> 主线 agent:**Codex**(`skill.mode='canonical'`,适配最薄)。
> 逻辑归属:**所有判定都在 [@tuteur/core](./core.md);CLI 与 hook 都是 core 的调用方,不重复实现。**
> 数据 schema 见 [core.md §4](./core.md#4-类型与校验);数据契约见 [core.md §7](./core.md#7-数据契约ai产出--cli记录--web展示--用户操作)。

---

## 0. 理念与统一原则

不用 Markdown 求 AI「应该怎么做」,而用结构化 workflow + 代码门禁判定「这步算不算做完」。Skill(Markdown)只答「怎么做」,harness 答「做完没」。

**统一原则(本轮重构核心)**:harness 只有一个逻辑层 = `@tuteur/core`,只有一个调用入口形态 = `ttur` 子命令。

```text
主动事件(agent 干完活)   →  ttur complete <node>   ┐
被动事件(平台会话开始)   →  ttur hook <event>      ├─→ @tuteur/core(唯一逻辑)
查询(看注入计划)        →  ttur context show       ┘
平台 hook 脚本(py/sh)   →  只转发到 ttur,不含业务
```

对照旧设计:`complete` 是 TS、`session-start.py` 自己读 `.tuteur/` —— 两套实现必漂移。现在 py 退化成一行转发,逻辑全回到 core。

---

## 1. Workflow 模型(节点图)

静态定义 `workflows/<id>.workflow.json`(**节点图**,core §4.3),`state.json` 是动态游标。两种节点:

```text
skill 节点     单入单出(next)      执行一个 skill,受门禁约束
decision 节点  单入多出(branches)  读 signal 自动路由,不占 agent step

entry → skill → [decision] → skill → ... → (next:null 终点)
```

默认 workflow:`classify →[route]→ {small:dev | 否则:grill-me} → dev → check → finish`。门禁条件(requiredArtifacts/checks/approval)全部**可选**,产物按需(core §7)。

**主体流程 vs 执行步骤(两层,回答你"去掉 phases 后怎么看主体流程")**:phase 不是被删,而是从「硬结构」降为「节点标签」:

```text
主体流程(粗粒度)= phase 标签   planning → execute → finish   ← "在哪个大阶段",驱动 task.status / web 泳道
执行步骤(细粒度)= 节点图        classify→route→dev→...        ← "具体哪一步",可分支
```

判断当前主体流程 = `currentNode` 的 `phase` 标签。约定:主路径上 phase 单调推进(planning→execute→finish),分支内节点继承所在阶段的标签。有了分支后流程不再线性,phase 退为标签才能让分支跨阶段表达,同时仍保留「主体阶段概览」。

---

## 2. `complete <node>` 门禁

CLI 命令(`ttur complete <node>`)与 web 端点共用 `core.completeNode`,**只对 skill 节点**(decision 由 harness 自动推进,无需 complete)。

### 2.1 流程

```text
core.completeNode(scope, taskId, node)
  读 workflow + state
  node == state.currentNode 且为 skill 节点? ──否──► exit 2
  requiredArtifacts 全存在? ──否──► exit 2:列缺失文件
  逐条跑 checks(command,只看退出码) ─非0─► exit 2:打印失败命令+输出尾部
  approvalRequired 且未 approve? ──► exit 2:"等待 UI approval"
  markCompleted + advanceWorkflow(§3,自动穿过 decision)+ writeState
  exit 0
```

### 2.2 参考实现(core/domain.ts,待实现)

```ts
export function completeNode(scope: Scope, taskId: string, nodeId: string): CompleteResult {
  const wf = readWorkflow(scope, readTask(scope, taskId).workflow);
  const state = readState(scope, taskId);
  const node = wf.nodes.find(n => n.id === nodeId);
  if (!node || node.type !== 'skill') return gate(`"${nodeId}" 不是 skill 节点`);
  if (state.currentNode !== nodeId)   return gate(`当前应完成 "${state.currentNode}",不是 "${nodeId}"`);

  const missing = (node.requiredArtifacts ?? []).filter(rel => !existsSync(taskPath(scope, taskId, rel)));
  if (missing.length) return gate(`Missing artifacts:\n  ${missing.join('\n  ')}`);
  for (const c of node.checks ?? []) {
    const { code, output } = runCommand(c.command, { cwd: scope.root });
    if (code !== 0) return gate(`Check "${c.id}" failed (exit ${code}):\n${tail(output)}`);
  }
  if (node.approvalRequired && !isApproved(scope, taskId, nodeId))
    return gate(`"${nodeId}" 等待 UI approval`);

  const next = advanceWorkflow(markCompleted(state, nodeId), wf, makeSignalReader(scope, taskId));
  writeState(scope, next);
  return { ok: true, exitCode: 0, state: next };
}
const gate = (m: string): CompleteResult => ({ ok: false, exitCode: 2, message: m });
```

退出码 2 = 门禁正常拒绝 → web 422(web.md §4.1)。Check 只看退出码;approval 由 core 读 `approvals.json`(UI 写、CLI 读)。

### 2.5 分支信号:三类来源(回应你纠结的 agent 判断)

核心原则:**agent 永不直接选路;decision 的 `signal` 由 harness 求值。** 三类信号来源,harness 一视同仁:

| 来源 | 判断者 | `signal` 写法 | 取值 |
| --- | --- | --- | --- |
| 确定性 | harness 代码 | `task.priority` / `check:<id>` | 读 task 字段 / 上次 check 退出码 |
| **agent 分类** | 模型(经 classify 节点) | `decision.json#/size` | 读前驱 skill 产出的 `decision.json` 字段 |
| 人工 | 用户(web) | `decision:<id>` | web 面板写入 `state.decisions`,harness 读 |

**classify 机制**(你说的大型/小型、开发/调研):在 decision 前放一个轻量 skill 节点 `classify`,它只读**最小上下文**(任务标题+简述),产出 `decision.json`(core §4.6),并把它列入 `requiredArtifacts`(门禁保证产出);随后 decision 读它路由。小任务由此**跳过 grill-me/research,裁剪上下文,避免注意力转移**;重节点再派子 agent 隔离(§7)。人工信号未写入时,harness 到该 decision **阻塞等待**(同 approval),人工分支 MVP 可后置。

---

## 3. 状态推进(advanceWorkflow,纯函数)

完成一个 skill 节点后沿 `next` 走;遇 decision 自动 `evaluateDecision` 选边,直到落到下一个 skill 节点或终点:

```ts
export function advanceWorkflow(state: State, wf: Workflow, readSignal: SignalReader): State {
  const completed = [...state.completedNodes, state.currentNode];
  const decisions = { ...state.decisions };
  let cursor = nodeById(wf, state.currentNode!).next;        // skill 单出
  while (cursor) {
    const node = nodeById(wf, cursor);
    if (node.type === 'skill') break;                        // 落到 skill 节点,停
    const chosen = evaluateDecision(node, readSignal);       // decision:读 signal 选 branch
    decisions[node.id] = chosen;
    completed.push(node.id);                                 // decision 自动完成,不占 agent step
    cursor = node.branches.find(b => b.when === chosen)?.next
           ?? node.branches.find(b => b.default)!.next;
  }
  return { ...state, currentNode: cursor ?? null, completedNodes: completed, decisions, updatedAt: now() };
}
export function evaluateDecision(node: DecisionNode, readSignal: SignalReader): string {
  return String(readSignal(node.signal));                    // 'decision.json#/size' → 'large'
}
```

`task.status` 由新 `currentNode` 的 `phase` 标签驱动(planning→planning;execute/finish→in_progress;`null`→completed),写回 `core.writeTask`。`readSignal` 抽象三类信号源便于单测注入。纯函数 + 单测,确定性核心(core.md K4)。

---

## 4. 文档与上下文流转

「文档/提示词如何流转」的核心,三段式:配置层 → 计划层 → 实际层。

```text
 配置层(用户改)         计划层(每 run 算)        实际层(run 后回写)
 context.json     ─►   plannedContext     ─►    actualContext
 spec/*.md             = resolvePlanned          = hook/agent 实际读到
 task artifact           Context(scope,           写入 run.json
                         task, step)               UI 对比 planned vs actual
```

- `context.json` 语义、`resolvePlannedContext` 归 core(core.md §5/§6)。
- `implement.json`/`check.json` 是**上下文清单**(列某 step 必读文件),非产物结果。
- **planned vs actual 差异**是发现 hook 失效的唯一信号,必须回写(core.md §7 不变量 3;UI 见 web.md §3.1)。

```jsonc
// context.json
{ "default": { "required":[".tuteur/spec/product.md"], "optional":[], "disabled":[] },
  "agents": { "dev": { "required":[".tuteur/spec/frontend.md"] } } }
```

`resolvePlannedContext(step)` = `default.required` ∪ `agents[step].required` ∪ 启用的 optional − disabled + task 关键 artifact。

---

## 5. Skill 流转

skill 本体统一在 `.agent/skill`,平台目录是适配层(由注册表的 `skillTarget` + init 的 `skills`(link/copy)决定,cli.md §8)。workflow 用 `skillRef` 引用。

```text
templates/common/skills/<base>/SKILL.md   (含 {{变量}})
   │ resolveWorkflowSkills:替换变量
   ▼
.agent/skill/tuteur-<base>/SKILL.md        (canonical;Codex/Gemini 直接用)
   │ symlink|copy(Claude)
   ▼
.claude/skills/tuteur-<base>/
```

变量替换表(`{{PRODUCT_NAME}}`/`{{SKILL_NAME}}`/`{{CMD_REF_PREFIX}}`/`{{USER_ACTION_LABEL}}`/`{{CLI_FLAG}}`)来自注册表的 `templateContext`。

`skillRef` 解析归 core(`resolveSkillRef`):候选名 `getBundledSkillName(ref)` → 查 `.agent/skill` → 查平台副本 → 都无则 workflow 校验报错。**让悬空 skillRef 在 init/validate 期暴露,而非 run 时。**

当前缺口:5 个 SKILL.md 全是 `TODO:` 占位。门禁可先于 skill 内容落地,但端到端跑通前必须填实(§9 H6)。

---

## 6. Hook 注入(薄转发模型)

平台 hook 入口脚本**不含业务**,只转发到 `ttur hook <event>`;真正逻辑在 core。

### 6.1 三类事件

| 事件 | 时机 | core 读 | 输出 |
| --- | --- | --- | --- |
| `session-start` | 会话启动 | config/context + 活跃 task state + planned context | stdout 注入文本 |
| `inject-workflow-state` | 会话内/run 内 | state + artifact 目录 | 当前 phase/step、缺失 artifact 摘要 |
| `inject-subagent-context` | 派生子 agent | 父上下文 + 当前 step | 子 agent 继承上下文 |

### 6.2 输入/输出契约

- 输入:环境变量 `TUTEUR_PROJECT_ROOT` / `TUTEUR_TASK_ID` / `TUTEUR_STEP_ID`(adapter/dashboard 启动 agent 时注入)。
- 输出:**stdout = 注入内容**(带标记 Markdown);退出码 `0` 成功、非 `0` 失败(平台忽略,**绝不阻断会话**)。

### 6.3 转发脚本(平台侧,由 configurator 生成)

```python
#!/usr/bin/env python3
import os, subprocess, sys
sys.exit(subprocess.run(["ttur", "hook", "session-start"], env=os.environ).returncode)
```

能直接配命令的平台连脚本都省,直接填 `ttur hook session-start`(cli.md §8.4)。

### 6.4 `ttur hook session-start` 内部(core,参考实现)

```ts
// cli/commands/hook.ts → 调 core
export function runSessionStartHook(): number {
  const scope = resolveProjectScope();
  if (!scope) return 0;                                  // 非 Tuteur 项目,静默
  const taskId = process.env.TUTEUR_TASK_ID;
  const out: string[] = ['# Tuteur workflow context\n'];

  let planned: string[] = readContextConfig(scope).default.required;
  if (taskId) {
    const st = readState(scope, taskId);
    planned = resolvePlannedContext(scope, taskId, st.currentNode ?? '');
    out.push(`- Task ${taskId} · Node ${st.currentNode}`);
    out.push(`- Completed: ${st.completedNodes.join(', ') || '(none)'}`);
    out.push(`- 完成当前节点:ttur complete ${st.currentNode} --task ${taskId}\n`);
  }
  if (planned.length) out.push('## Required context\n' + planned.map(p => `- ${p}`).join('\n'));
  process.stdout.write(out.join('\n'));
  // 回写 actualContext 由 adapter 在 run 内完成(§7)
  return 0;
}
```

要点:失败软退出(异常只记 stderr 不阻断);每次会话提示 `ttur complete` 推进入口;注入由 core 统一计算,Codex/Claude/Gemini 共用同一逻辑,差异只在转发脚本与 registry。

---

## 7. Agent Adapter:节点级 agent + 子 agent

封装「启动 run + 捕获日志 + 写 run 元数据」,本轮纳入**节点级 agent 指派**与**子 agent 隔离**(两者都进 MVP)。

### 7.1 节点级 agent 指派

节点的 `agent` 字段覆盖 task 默认 agent,不同节点可用不同工具:

```ts
resolveNodeAgent(node, task) = node.agent ?? task.defaultAgent ?? config.defaults.agent
```

adapter 据此从注册表选工具启动(research 节点用擅长检索的、dev 用 codex)。

### 7.2 子 agent 隔离

节点 `subagent.isolate` 为真时,该节点在**隔离上下文**执行,只读 `contextRef` 指向的清单文件,产出回主流程:

- 支持子 agent 的平台(注册表 `agentCapable`,如 Claude/Codex):走真子 agent,经 `inject-subagent-context` hook 喂 `contextRef`(如 `implement.json`)列出的文件。
- 不支持的平台:降级为「同 agent 顺序执行 + 仅注入 contextRef 上下文」,行为等价但不隔离。

目的:重上下文节点(dev/check)隔离执行,主 agent 上下文保持干净 —— 直接缓解注意力转移(§2.5)。

### 7.3 run 流程

```text
core/adapter:runAgent({ scope, taskId, node })
  1. agent = resolveNodeAgent(node, task);  plannedContext = resolvePlannedContext(...)
  2. cwd = task.worktree ?? scope.root        # opt-in worktree 则在隔离工作树执行(core §9.1)
  3. 注入环境变量 TUTEUR_*(供 hook 转发)
  4. node.subagent?.isolate ? 派子 agent(喂 contextRef 清单) : 主 agent
  5. spawn <agent>(cwd),pipe → tasks/<id>/runs/NNN.log
  6. 记 startedAt/endedAt/exitCode/status
  7. 回写 actualContext(hook emit 列表)+ producedArtifacts(run 前后目录 diff)
  8. core.appendRun(...);提示运行 ttur complete <node>
```

**run 成功 ≠ 节点完成**;`producedArtifacts` 由目录 diff,不靠 agent 自报(core.md §7)。MVP 主线 Codex;`ttur run <node>` 是否进 MVP 见 cli.md §9.3。

---

## 8. 用户扩展点

「让用户自由拓展」是产品核心,四类扩展**都不改 CLI 源码**:

| 扩展 | 改什么 | 生效 | 安全网 |
| --- | --- | --- | --- |
| 自定义 workflow | 加 `workflows/<id>.workflow.json` + task 指定 `workflow` | core 按新定义门禁 | `workflow validate` 校验 skillRef/路径 |
| 自定义 skill | 改/加 `.agent/skill/<name>/SKILL.md` | `skillRef` 引用 | `update` 哈希保护用户改动(cli.md §7) |
| 自定义 spec | 加 `spec/*.md` + `context.json` 登记 | session-start hook 注入 | planned/actual 差异显形错误路径 |
| 自定义注入集 | 编辑 `context.json` 的 `agents.<step>` | 按 step 差异化注入 | —— |
| **接入新 agent** | 注册表加一条 + `configurators/<id>.ts` | 派发自动调用 | registry 适配器(cli.md §8) |

目标(PRD UX):编辑结构化 workflow 比编辑长篇 Markdown 更安全 —— 因为它可校验、门禁由代码执行,改错不会让流程静默失守。

用户级内容放 `workspace/<username>/`(本地),不引入用户级 context 覆盖层(core.md §3),保持简单。

---

## 9. 代码评价与 TODO

### 评价
- 统一到「core 唯一逻辑 + ttur 唯一入口 + hook 薄转发」后,诉求 1(机制不统一)从根上解决:py 不再含逻辑,注入/流转/查询同源。
- 当前 hook/skill/adapter 全占位,harness 还不能真正约束任何东西 —— 这是 P0 重点。
- Codex 主线 + canonical skill,最快验证门禁闭环。

### TODO

| # | 项 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| H1 | 默认 workflow 改节点图(含 classify→route 分支)+ 门禁字段 | P0 | core §4.3 |
| H2 | `advanceWorkflow`(沿边+decision 求值)+ `evaluateDecision` + 单测 | P0 | core K4 |
| H3 | `completeNode` 门禁(只对 skill 节点) | P0 | H2 |
| H4 | `ttur hook session-start` + 转发脚本 | P0 | core context |
| H5 | plannedContext 计算 + run actualContext 回写 | P0 | §4/§7 |
| H6 | 填实 5 个 SKILL.md + classify skill | P0 | —— |
| H7 | Codex adapter + run 记录 + 节点级 agent 解析 | P1 | §7 |
| H8 | 子 agent 隔离(isolate + contextRef + subagent hook) | P1 | §7.2 |
| H9 | 分支信号三类求值(确定性/decision.json/人工) | P0 | §2.5 |
| H10 | skillRef 解析与 validate | P1 | core §5.1 |
| H11 | approval 读写(approvals.json) | P1 | web §6 |
| H12 | inject-workflow-state hook | P2 | §6.1 |

### 待确认
- hook 注入是否统一 stdout?**推荐**:是,契约层对所有平台一致,差异只在转发脚本与 registry。
- actualContext 采集精度?**推荐**:MVP 用 hook emit 列表近似,精确到 agent 实开文件后置。
- 人工分支(web 选路由)是否进 MVP?**推荐**:先做确定性 + agent 分类两类,人工分支后置。
