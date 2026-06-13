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

对照旧设计:`complete` 是 TS、`session-start.py` 自己读 `.tuteur/` —— 两套实现必漂移。现在 hook 退化成声明文件里一行 `ttur hook` 命令(无脚本),逻辑全回到 core。

---

## 1. Workflow 模型(节点图)

静态定义 `workflows/<id>.workflow.json`(**节点图**,core §4.3),`state.json` 是动态游标。两种节点:

```text
skill 节点     单出(next),入度不限   执行一个 skill,受门禁约束;分支汇合点天然多入
decision 节点  单入多出(branches)     读 signal 自动路由,不占 agent step;必须含一个 default

entry → skill → [decision] → skill → ... → (next:null 终点)   图必须无环(返工=停留原节点重试,§2.4)
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

### 2.3 成功输出契约与 `--json`

`ttur complete` 成功不是干巴巴的 exit 0:stdout 输出**下一节点接力块**——交互模式下 session-start 本会话不会再触发,这段输出就是 agent 继续推进的唯一线索:

```text
✓ classify 完成
→ 路由判定:size=small → 跳过 grill-me(decision: route)
→ 当前节点:dev(skill: tuteur-dev,phase: execute)
   需要产物:无 | 需要确认:无
   必读上下文:api-conventions(注索引), tasks/06-13-xxx/prd.md
   完成后执行:ttur complete dev
```

decision 路由原因与看板同源(读 `state.decisions`);走到终点输出「workflow 完成,可 `ttur task archive`」。成功与失败均支持 `--json`(结构化输出,退出码语义不变);skill 模板中注明 agent 优先用 `--json`。

### 2.4 弱门禁、重试与跳过

- 门禁失败**不改变 state**:停留原节点,修复后再次 complete 即返工。workflow 图无环(validate 拒绝回边),state 无迭代轮次概念。
- 每次 complete 尝试(成败、喊错关)都追加 `events.jsonl`(core §4.4)——跳步/重试是 workflow 执行质量统计的素材,不是要物理拦死的行为。
- 同节点失败超过 `config.json` 阈值 → 看板告警(标黄「卡住」),**门禁永不自动放行**。
- 逃生通道:`ttur complete <node> --skip --reason "..."`——人工显式跳过(门禁配错/检查 flaky 时用),事件留痕(type=skip)。

### 2.5 分支信号:三类来源(回应你纠结的 agent 判断)

核心原则:**agent 永不直接选路;decision 的 `signal` 由 harness 求值。** 三类信号来源,harness 一视同仁:

| 来源 | 判断者 | `signal` 写法 | 取值 |
| --- | --- | --- | --- |
| 确定性 | harness 代码 | `task.priority` / `check:<id>` | 读 task 字段 / 上次 check 退出码 |
| **agent 分类** | 模型(经 classify 节点) | `decision.json#/size` | 读前驱 skill 产出的 `decision.json` 字段 |
| 人工 | 用户(web) | `decision:<id>` | web 面板写入 `state.decisions`,harness 读 |

**classify 机制**(你说的大型/小型、开发/调研):在 decision 前放一个轻量 skill 节点 `classify`,它只读**最小上下文**(任务标题+简述),产出 `decision.json`(core §4.6),并把它列入 `requiredArtifacts`(门禁保证产出);随后 decision 读它路由。小任务由此**跳过 grill-me/research,裁剪上下文,避免注意力转移**;重节点的子 agent 派发约定见 §7.2。人工信号未写入时,harness 到该 decision **阻塞等待**(同 approval),人工分支 MVP 可后置。

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

`task.status` 由新 `currentNode` 的 `phase` 标签驱动(planning→planning;execute/finish→in_progress;`null`→completed),**无 phase 标签的节点不改变 status**,写回 `core.writeTask`。`evaluateDecision` 的失败语义:signal 不可读(文件/字段缺失)→ 抛门禁错误,本次 complete 整体失败 exit 2(信号缺失大概率是 classify 没干好活,应被拦住返工);有值但未匹配任何 `when` → 走 default(validate 强制每个 decision 有且仅有一个 default,并拒绝带环图)。`readSignal` 抽象三类信号源便于单测注入。纯函数 + 单测,确定性核心(core.md K4)。

---

## 4. 文档与上下文流转

「文档/提示词如何流转」的核心,三段式:内容源 → 配置层 → 计划层 → 实际层。

```text
 内容源(agent 维护)    配置层(用户改)        计划层(每次注入时算)      实际层(hook 写事件)
 knowledge/(全局+项目) context.json     ─►   plannedContext     ─►    session_start 事件的 injected 清单
 = karpathy LLM Wiki    (default/node/        = resolvePlanned          hook 触发时追加 events.jsonl
   (knowledge.md)        user 分层)            Context(scope,task,        UI 对比 planned vs injected;
 task artifact                               node,user)                整段会话无事件 = hook 根本未触发
```

- 内容源是**知识库**(`knowledge/`,knowledge.md):agent 维护的 wiki + index;注入默认注「索引(title+summary+路径)」,agent 按需读全文。
- `context.json` 语义、`resolvePlannedContext` 归 core(core.md §5/§6);**按知识 id 引用、default/node 两层(项目共享,不分用户)**(knowledge.md §7)。
- `implement.json`/`check.json` 是**上下文清单**(列某 step 必读条目),非产物结果;子 agent 经 pull-based prelude 自行读取(§7.2)。
- planned 与 `injected` 的差异、以及 `session_start` 事件缺失,是发现 hook 失效的信号,事件必须记录(core.md §7 不变量 3;UI 见 web.md §3.1)。

```jsonc
// context.json(按知识 id 引用,default/node 两层;详见 knowledge.md §7)
{ "default": { "required":["api-conventions"], "optional":["db-schema"], "disabled":[] },
  "nodes": { "dev": { "required":["api-conventions","test-policy"] } } }
```

`resolvePlannedContext(scope,task,node)` = 合并(全局 `injectByDefault` → 项目 `default` → `nodes[node]`)+ task 关键 artifact;产出本次注入的知识 id/路径清单。**个性化由全局/项目两级承载,不分用户**(全局库即用户专属,knowledge.md §8)。

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

当前缺口:workflow 类 5 个 SKILL.md(brainstorm/grill-me/dev/check/finish)+ 维护类 `tuteur-knowledge`(知识库维护,knowledge.md §5)全是 `TODO:` 占位。门禁可先于 skill 内容落地,但端到端跑通前必须填实(§9 H6)。`tuteur-knowledge` 不是 workflow 节点,而是按需调用的维护 skill,不进默认 workflow。

---

## 6. Hook 注入(薄转发模型)

平台 hook 入口**不含业务**,只把事件转发到 `ttur hook <event>`(优先直接命令,无包装脚本,§6.3);真正逻辑在 core。

### 6.1 三个 hook 阶段与职责(参考 Trellis,适配节点图)

Trellis 用三个生命周期 hook 把「工作流约束」喂给 agent:会话启动注全量、每轮注 breadcrumb 防漂移、派生子 agent 时注精选上下文。Tuteur 沿用同样三阶段,但内容改成节点图语义、逻辑收进 `ttur hook`:

| 阶段(`ttur hook <event>`) | 平台事件 | 时机 | 注入什么 | 输出形态 | MVP |
| --- | --- | --- | --- | --- | --- |
| `session-start` | SessionStart | 会话启动一次 | **全量**:会话须知 + 首回复确认提示 + 当前态(开发者身份/git/活跃任务)+ workflow 概览(当前节点·主体阶段·下游节点·skill 路由)+ **任务状态机**(多态 + 显式 Next-Action)+ planned context | stdout 文本 / `additionalContext` | **P0 核心** |
| `inject-workflow-state` | UserPromptSubmit(Gemini 为 `BeforeAgent`) | 每轮用户输入 | **轻量 breadcrumb**:当前节点 + 下一条命令(`ttur complete <node>`),防止 agent 跑偏当前步 | `additionalContext` JSON | P2 |
| `inject-subagent-context` | PreToolUse / SubagentStart | 主 agent 派生子 agent | 该节点的**精选上下文清单**(plannedContext + 必需产物)注入子 agent prompt | `updatedInput` JSON(push)/ pull prelude | P1+(MVP 走 pull,§7.2) |

设计意图(对应 PRD §7.7/§7.9):**session-start 一次性把「该项目怎么走、现在走到哪、下一步干啥」讲清;per-turn 用最短 breadcrumb 把 agent 钉在当前节点**(counter「静默失守」);**子 agent 注入**让派生出去的 agent 不丢上下文。三者粒度递减、频率递增。

### 6.2 输入/输出契约(三阶段共用)

- **任务定位**:**不依赖环境变量**——`core.resolveCurrentTask`:显式参数 > `runtime/current-task.json` 指针 > 唯一未完成任务兜底(§7.1);`TUTEUR_PROJECT_ROOT` 仅作 scope 解析兜底。命令以 session cwd 运行,scope 据此解析。
- **kill-switch / 跳过**(对齐 Trellis `should_skip_injection`):`TUTEUR_HOOKS=0` 或检测到平台非交互标志(`CLAUDE_NON_INTERACTIVE=1` 等)时**静默退出 0、不注入**,避免污染脚本化/CI 会话。
- **软失败**:任何异常只写 stderr,退出码非 0,平台忽略——**hook 绝不阻断会话**(Tuteur 的硬约束在 `ttur complete` 门禁,不在 hook)。
- **输出信封按平台与事件不同**(core 内 `renderHookOutput(event, platform, body)` 统一适配):

  | 事件 | 平台事件名 | 信封 | 说明 |
  | --- | --- | --- | --- |
  | session-start | `SessionStart` | stdout 文本,或 `{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext}}` | 平台能直接吃 stdout 的走文本,否则包 JSON |
  | inject-workflow-state | `UserPromptSubmit`(Gemini `BeforeAgent`) | `{hookSpecificOutput:{hookEventName, additionalContext}}` | 事件名按平台切换(Gemini 0.40+ 改名) |
  | inject-subagent-context | `PreToolUse`/`SubagentStart` | `{hookSpecificOutput:{…, updatedInput:{…, prompt}}}`(多格式兼容) | 改写子 agent prompt;pull 平台不发此 hook |

  平台差异(事件名、信封字段)收在 core 一处适配,`ttur hook` 据 `--platform`(或自动探测:env var / cwd 下 `.codex`/`.claude` 目录)选形态——**所有平台共用同一套上下文计算**。

### 6.3 hook 入口:优先直接命令,不用脚本

逻辑全在 `ttur hook`,平台 hook 入口只需「调起 ttur」。已核实 **Claude 与 Codex 的 hook 配置都接受命令字符串**(`type:"command"`),因此入口**直接写命令、不落任何 `.py`/`.sh` 包装脚本**:

```jsonc
// 三平台都把命令直接填进声明文件(cli.md §8.4)
"command": "ttur hook session-start"
```

为什么不退回 `.sh`:本项目主跑 Windows,`.sh` 的 shebang 在 cmd/PowerShell 下不可执行、需额外接 bash,是**最不可移植**的;而 `ttur` 经 npm 安装会带 `ttur.cmd` shim,直接命令在 cmd/PowerShell/bash 都解析得了。把逻辑搬进 CLI 的意义就是让 hook 不依赖任何解释器——换成 `.sh` 等于把「依赖 Python」换成「依赖 bash」,在 Windows 上是退步。

仅当某平台的 hook **只接受脚本文件路径**(当前三平台都不是)时才需包装;那时也优先可移植形式(Codex 提供 `command_windows` 做 Windows 覆盖),而非 shebang 脚本。命令以 session cwd 为工作目录运行,`ttur` 据此解析 scope/当前任务,无需相对路径或 git-root 处理。

### 6.4 `session-start` 功能规格(全量注入)

会话启动注入的内容分段组织(参考 Trellis `session-start.py` 的 `<session-context>`/`<current-state>`/`<workflow>`/`<task-status>` 分块),`ttur hook session-start` 依次拼出:

| 段 | 内容 | 来源 |
| --- | --- | --- |
| `<session-context>` | 一句话告知「这是 Tuteur 托管项目,按下文走」 | 固定 |
| 首回复确认提示(一次性) | 让 agent 在**首条可见回复**用一句话确认「Tuteur 已注入:workflow/任务状态/上下文」——人能直接看到 hook 生效,没看到=hook 没触发(与 events.jsonl 缺 `session_start` 互为旁证) | 固定 |
| `<current-state>` | 开发者身份(`.developer`)、git 分支/状态、活跃任务列表 | core 读 `.developer`/git/`listTasks` |
| `<workflow>` | 当前 workflow 概览:当前节点、主体阶段(phase)、已完成节点、下游节点与 skill 路由(节点图的「该怎么走」) | `readWorkflow`+`readState` |
| `<task-status>` | **任务状态机**(下方多态),每态点名显式 Next-Action | `resolveCurrentTask`+`completeNode` 预判 |
| `<required-context>` | 该节点的 planned context 清单(必读规范/产物) | `resolvePlannedContext` |

任务状态机(对齐 Trellis 的多态 Next-Action,映射到节点图):

- **NO ACTIVE TASK** → 引导 `ttur task create "<title>"` 或 `ttur task start <id>`
- **STALE POINTER**(指针指向已不存在的任务)→ 引导清理指针后再 start
- **PLANNING / IN PROGRESS**(停在某节点)→ 注入当前节点 + 完成命令 `ttur complete <node> --json`
- **BLOCKED**(上次门禁失败、停留原节点)→ 点名缺失的产物/检查项 + 重试命令(`completeResult` 复用,§2.3)
- **COMPLETED** → 引导 `ttur task archive`

参考实现(core,节点图状态机;`completeNode` 预判缺失项以输出 BLOCKED 态):

```ts
// cli/commands/hook.ts → 调 core
export function runSessionStartHook(): number {
  const scope = resolveProjectScope();
  if (!scope) return 0;                                  // 非 Tuteur 项目,静默
  const taskId = resolveCurrentTask(scope);              // 指针 > 唯一未完成任务兜底(§7.1)
  const out: string[] = ['# Tuteur workflow context\n'];

  // 多态输出(每态点名 Next-Action,见上表):
  let planned: string[] = readContextConfig(scope).default.required;
  if (taskId) {
    const st = readState(scope, taskId);
    planned = resolvePlannedContext(scope, taskId, st.currentNode ?? '');
    out.push(`- Task ${taskId} · Node ${st.currentNode} · Phase ${st.phase ?? '-'}`);
    out.push(`- Completed: ${st.completedNodes.join(', ') || '(none)'}`);
    out.push(`- Next-Action: ttur complete ${st.currentNode} --task ${taskId} --json\n`);
  } else {
    out.push('- NO ACTIVE TASK · Next-Action: ttur task create "<title>" 或 ttur task start <id>\n');
  }
  if (planned.length) out.push('## Required context\n' + planned.map(p => `- ${p}`).join('\n'));
  process.stdout.write(out.join('\n'));
  if (taskId) appendEvent(scope, taskId, { type: 'session_start', injected: planned });  // 实际注入回写
  return 0;
}
```

要点:软失败(异常只记 stderr 不阻断);每次会话点名 `ttur complete` 推进入口;注入由 core 统一计算,Codex/Claude/Gemini 共用同一逻辑,差异只在 §6.2 的输出信封。⚠️ Codex 的 hook 需用户手动开 feature flag 并 `/hooks` 信任(cli.md §8.4)。

### 6.5 `inject-workflow-state` 功能规格(每轮 breadcrumb,P2)

每次用户输入前注入**一行级** breadcrumb,把 agent 钉在当前节点——这是 Trellis 对抗「agent 跳步/忘记当前步」的核心机制,代价极小(短文本,全量只在 session-start 给一次)。

- 内容:`当前任务 · 当前节点 · 主体阶段 · Next-Action: ttur complete <node>`;无活跃任务时给「描述需求后 `ttur task create`」的提示。
- **单一事实源**:breadcrumb 由 `readState`+`readWorkflow` 现算,不存第二份副本(Trellis 教训:从 workflow.md tag 取,绝不 hardcode 字典)。
- 输出:`additionalContext` JSON,事件名按平台(§6.2)。
- 频率高,**不写 events**(避免刷屏);hook 生效与否仍以 session_start 事件判断。
- Codex 特例:因其 SessionStart 可被移除,可在 per-turn 里补一段 bootstrap(提示 agent 调 `ttur hook session-start` 拉全量),对齐 Trellis 的 `CODEX_*_NOTICE`。

### 6.6 `inject-subagent-context` 功能规格(子 agent 注入,P1+)

主 agent 派生子 agent(implement/check/research 类角色,§7.2)时,把该节点的精选上下文塞进子 agent,使其「拿到完整信息后自治」,不靠对话历史传递。

- **push 平台**(hook 能改写子 agent prompt):PreToolUse 拦截 Task 调用,读当前节点的 plannedContext + 必需产物清单,`updatedInput.prompt` 注入后放行(`permissionDecision:"allow"`)。
- **pull 平台**(Codex/Gemini 等 class-2,hook 不能改子 agent prompt):**MVP 默认走这条**——子 agent 在 skill 正文约定的 prelude 里**自己**调 `ttur`/读节点上下文(§7.2 pull-based prelude)。
- 子 agent 自豁免:已经是被派发的 implement/check 角色时,不再递归派发同类(对齐 Trellis 的 self-exemption 提示)。

### 6.7 跨平台与健壮性(Trellis 教训 → Tuteur 简化)

| 关注点 | Trellis(py 脚本里各自处理) | Tuteur(逻辑在 `ttur` Node CLI) |
| --- | --- | --- |
| 平台探测 | 每个 .py 重复 env var + 脚本路径判定 | core 一处 `detectPlatform`(env/`--platform`/cwd 目录) |
| 事件名/信封差异 | 每个脚本各写一遍多格式输出 | core 一处 `renderHookOutput`(§6.2 矩阵) |
| Windows 路径/编码 | 每个 .py 手动 `/c/`→`C:\` 规整 + 逐流 UTF-8 重配 | **Node 原生 UTF-8 + path,免去全部 hack**——这是「逻辑进 CLI」的直接红利 |
| push/pull 分类 | `SHARED_HOOKS_BY_PLATFORM` 表按平台分发不同脚本 | 注册表静态数据标注平台能力,core 据此选 push/pull(§7.2) |
| kill-switch / 软失败 | `should_skip_injection` + 全程 try/except | §6.2 统一约定 |

结论:Trellis 因为 hook 逻辑在 py 脚本里,被迫在每个脚本重复处理编码/路径/平台/信封;Tuteur 把这些全收进 `ttur hook`(Node),**hook 入口只剩一行命令**,跨平台差异退化成 core 里的几张表。

---

## 7. 当前任务定位与子 agent 约定(交互模式)

run 模式已移除(2026-06-13 评审):**Tuteur 不启动、不托管 agent 进程**,执行只发生在用户自己开的交互会话里。本节定义两件事:hook/CLI 如何知道「现在在干哪个任务」,以及子 agent 的分工约定。

### 7.1 当前任务定位(对齐 Trellis)

```text
解析优先级(core.resolveCurrentTask):
  1. 显式 --task <id>(命令参数)
  2. runtime/current-task.json 指针(gitignore;ttur task start <id> 写入,完成/归档自动清除)
  3. 唯一未完成任务兜底(planning + in_progress 恰好一个时自动选中)
  指针指向不存在的任务 → STALE,提示清理而非静默忽略
```

MVP 用单指针文件,不做 Trellis 的 per-session 分键(`.runtime/sessions/<platform>_<sessionID>.json` 是它为多窗口打的补丁,依赖会话 ID 传播且有真实失效案例 #264)。多窗口需求出现时再升级,路径已被 Trellis 验证。

### 7.2 子 agent 约定(agent 自主派发)

「开不开子 agent」完全由主 agent 决定,Tuteur 不替它派(PRD §6.2)。系统只做两件事(均为 Trellis 已验证形态):

- **预置子 agent 角色定义**(实现/检查/调研,放各平台 agents 目录),skill 正文写调度协议(如「实现完成后派 check 子 agent 再报告完成」),即 Trellis 的 dispatch protocol。
- **上下文供给走 pull-based prelude**(MVP 唯一路径):子 agent 定义顶部写「Required: 先读 `ttur task status --json` 与任务上下文清单(implement.json 等)」,由子 agent 自己拉取。支持工具派发 hook 的平台(Claude 等)的 `inject-subagent-context` 自动注入留 P1+(§6.1)。

目的不变:重上下文工作在子 agent 中执行,主 agent 上下文保持干净,缓解注意力转移(§2.5)——只是实现手段从 harness 强制改为 skill 约定。

---

## 8. 用户扩展点

「让用户自由拓展」是产品核心,四类扩展**都不改 CLI 源码**:

| 扩展 | 改什么 | 生效 | 安全网 |
| --- | --- | --- | --- |
| 自定义 workflow | 加 `workflows/<id>.workflow.json` + task 指定 `workflow` | core 按新定义门禁 | `workflow validate` 校验 skillRef/路径 |
| 自定义 skill | 改/加 `.agent/skill/<name>/SKILL.md` | `skillRef` 引用 | `update` 哈希保护用户改动(cli.md §7) |
| 扩充知识库 | 往 `knowledge/sources/` 放源 + 调 `tuteur-knowledge` skill(agent 维护 wiki/index) | 注入按 id 注索引(knowledge.md) | planned/actual 差异显形错误路径 |
| 配置注入集 | 编辑 `context.json`(default/node 两层,引用知识 id) | session-start hook 注入 | 计划 vs 实际 diff(web §3) |
| 自定义注入集 | 编辑 `context.json` 的 `nodes.<node>` | 按节点差异化注入 | —— |
| **接入新 agent** | 数据注册表加一条 + `configurators/<id>.ts` + `templates/<id>/` 模板树 | 派发自动调用 | 模板拷贝(hook 即模板文件,cli.md §8) |

目标(PRD UX):编辑结构化 workflow 比编辑长篇 Markdown 更安全 —— 因为它可校验、门禁由代码执行,改错不会让流程静默失守。

用户级内容放 `workspace/<username>/`(本地),不引入用户级 context 覆盖层(core.md §3),保持简单。

---

## 9. 代码评价与 TODO

### 评价
- 统一到「core 唯一逻辑 + ttur 唯一入口 + hook 薄转发」后,诉求 1(机制不统一)从根上解决:py 不再含逻辑,注入/流转/查询同源。
- 当前 hook/skill 全占位,harness 还不能真正约束任何东西 —— 这是 P0 重点。
- Codex 主线 + canonical skill + 交互模式唯一,最快验证门禁闭环。

### TODO

| # | 项 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| H1 | 默认 workflow 改节点图(含 classify→route 分支)+ 门禁字段 | P0 | core §4.3 |
| H2 | `advanceWorkflow` + `evaluateDecision`(default/无环/signal 失败语义)+ 单测 | P0 | core K4 |
| H3 | `completeNode` 门禁(只对 skill 节点;失败不改 state;appendEvent) | P0 | H2 |
| H4 | `ttur hook session-start`(分段注入 + 多态 Next-Action,§6.4)+ hook 声明文件(命令直配) | P0 | core context |
| H5 | plannedContext 计算 + session_start 事件回写(injected 清单)+ `renderHookOutput`/`detectPlatform`(§6.2) | P0 | §4/§6 |
| H6 | 填实 5 个 SKILL.md + classify skill(含 --json 指引与子 agent 调度协议) | P0 | —— |
| H7 | `ttur task start` + resolveCurrentTask(指针/兜底/STALE) | P0 | §7.1 |
| H8 | complete 成功接力输出 + `--json`(成败统一结构化) | P0 | §2.3 |
| H9 | 分支信号三类求值(确定性/decision.json/人工) | P0 | §2.5 |
| H10 | skillRef 解析与 validate(连通/无环/decision default) | P1 | core §5.1 |
| H11 | approval 读写(approvals.json) | P1 | web §6 |
| H12 | `inject-workflow-state`(每轮 breadcrumb,§6.5)/ `inject-subagent-context`(子 agent 注入,§6.6;push 平台)hook | P2 | §6.1、§7.2 |

### 待确认
- hook 注入是否统一 stdout?**推荐**:是,契约层对所有平台一致,差异只在各平台模板的 hook 声明文件。
- ~~actualContext 采集精度~~ → **已定**:以 session_start 事件的 `injected` 清单近似,精确到 agent 实开文件后置。
- 人工分支(web 选路由)是否进 MVP?**推荐**:先做确定性 + agent 分类两类,人工分支后置。
