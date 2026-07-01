---
id: cross-tool-dispatch
title: 跨工具 agent 派发:架构选型(活 agent 编排 + headless 子代理 + tmux 只读观察)
scope: project
kind: overview
tags: [withy, dispatch, agent, executor, tmux, headless, research]
summary: '跨不同 agent CLI(Codex/opencode 等)派发的架构决策:主编排是活 AI agent(Claude Code 本体,原生 TUI),Withy 是护栏不是总指挥;子代理走 headless exec 开进 tmux 面板「只读看」,完成=进程退出;明确不做交互式子代理。派发路由由角色 frontmatter 的 engine 字段定(缺省=inherit 走原生,指定别的=拓展派发)。参考目标 = CodeMachine-CLI(TS、借其引擎适配器写法),CAO 仅作反面对照。'
inject: index
injectByDefault: false
sources: []
updated: 2026-07-01
status: draft
---

# 跨工具 agent 派发:架构选型

## 问题与范围

现有 dispatch(见 [[harness]])解决的是「同一种工具内部」的 subagent:节点声明 `agent` 角色,主 agent 派生**同类** subagent(Claude 派 Claude)。本页定的是**跨不同 agent CLI**的派发:在 dev 节点把活交给 **Codex**、test 节点交给 **opencode**。

**关键前提(决定了整套方案的简单度):Withy 的运行时总指挥不是一段程序,而是一个活的 AI agent —— 通常是 Claude Code 本体,跑在它自己的原生 TUI 里,人在那个会话里操作。** Withy(CLI + 状态机 + gate + 知识库)是**护栏 / 提词器**,不是总指挥;Web 控制台只做配置与查看;子代理的诉求是**看**它在干嘛(只读),不是钻进去敲。

这个前提把前几轮反复纠结的难题大半消掉了:**「完成感知 / 交接回主 agent / 唤醒主 agent」由主 agent 自己的运行时承担** —— 它派子活本来就是用自己的工具(跑一条命令),命令一返回它自然就知道完了、自然接着编排。于是 Withy 在跨工具派发上只需补三件小事:① 起一个**别的 CLI** 的 headless 子进程;② 让人能在 **tmux 面板里看**它;③ 把结果收成**紧凑 handback** 并出 **gate**。

## 决策(总览)

| 角色 | 怎么做 |
| --- | --- |
| **主编排** | 活 AI agent(如 Claude Code)在它自己的原生 TUI;人在此会话操作。Withy = 状态机 / gate / 知识库**护栏**,**不是总指挥**。 |
| **子代理派发** | 主 agent 跑 `withy dispatch <node>` → 把子工具 **headless 开进一个 tmux 面板** + tee 输出到 `runs/` → **等子进程退出** → 回紧凑 `handback.json` → `withy next` 卡 gate。**完成 = 进程退出**,零抓屏、零守护进程。 |
| **观察** | tmux 面板**只读看**子代理在干嘛;Web 控制台辅助配置 / 查看;`events.jsonl` 做审计。完成判定永远走 handback,不靠「面板里看到 done」。 |
| **明确不做** | **交互式子代理**(CAO 那种 attach-and-type 的活 TUI)。理由见下。 |

## 为什么不做交互式子代理(2026-06-29 定)

- **你的总指挥是活 agent,干预的自然入口是主 agent,不是钻进子代理。** 子代理跑歪 → 它干完 / 报 blocked → 结果回到 Claude Code → 人**经 Claude Code 纠偏、重新派**(或 `resume` 续上)。CAO 之所以要「钻进任意 worker」,正因为它**没有一个你正在对话的聪明总指挥**;你有,所以这类场景基本被「经主 agent 纠偏 + 停/续」覆盖。
- **完整 CAO 式交互 = 数量级的复杂,不是多写点代码。** 一旦子代理是活 TUI、跑完一轮不退出,就丢掉「进程退出=完成」这个免费信号,被迫**抓 PTY 屏幕猜状态** + 常驻服务追踪 + 往活 TUI 注入消息 —— 这正是 CAO 全部复杂度的来源(详见下「反面对照」)。对已被覆盖的需求付这个代价,投入产出最差,也违背「不为假设的未来提前设计」。
- **逃生口(留作未来,不建):** 真想亲手接管某个子代理时,**按需**在那个面板里开一个**交互的 resume 会话**(同一 `sessionId` 续上,如 `claude --resume <id>` 不带 `--print`;Codex 有对应的会话续接),这一刻就在它原生 TUI 里敲了。交互变成「想要时的一个动作」,而非「永远挂着的属性」—— 省掉抓屏 / 守护进程那整套。**当前不做,真用下来发现 resume 不够再说。**

## 参考目标

**主参考:CodeMachine-CLI**(`moazbuilds/CodeMachine-CLI`,TypeScript / Bun,Apache-2.0)。和 Withy 同生态,且执行模型一致:把每个 CLI 当 **headless 一次性命令**跑、指令喂 stdin、读结构化输出、记 `sessionId` 续接。**借它的「引擎适配器」写法,不借它的编排模型** —— 它的总指挥是**死代码**(状态机走预写菜谱),你的是**活 agent**,编排层不通用。

已核实的真实调用(可直接照抄手法,读自其 `src/infra/engines/providers/*/execution/commands.ts`):

- **Codex**:`codex exec --json --skip-git-repo-check --sandbox danger-full-access --dangerously-bypass-approvals-and-sandbox -C <dir> [--model X] -`(prompt 走 stdin;续接:`codex exec resume <id> <prompt>`)
- **Claude**:`claude --print --output-format stream-json --dangerously-skip-permissions --permission-mode bypassPermissions [--resume <id>] [--model X]`(prompt 走 stdin)
- **每工具一个小适配器**(命令名 + flag + 输出解析),放 `providers/<tool>/`;新增工具 = 加一个适配器。这正是 Withy registry 要加的 `executor`/`invoke` 维度的现成写法。
- **一处取向差异要避开**:CodeMachine 给工具开「全放开别问」(`bypass` / `skip-permissions`)换全自动;Withy 要保留「停下报 `needsInput` + 经主 agent 纠偏」,**别照搬这个放开姿态**。

**反面对照(不照搬):CAO**(`awslabs/cli-agent-orchestrator`,Python,Apache-2.0)—— 它的交互式 TUI 模型是**已否决**项,只在「为什么不做交互」处当反面教材:`FifoReader→StatusMonitor→InboxService` 抓屏管线(脆:opencode 滚屏丢标记就检测不到完成,被迫 `OPENCODE_DISABLE_MOUSE=1`)、常驻 `cao-server`、多路 inbox 投递 + 已知竞态(GH #115)。且 Python 不对生态、daemon 中心违背 [[harness]] 的「core 不托管进程」。

**tmux 手法参考:agent-os / aTerm**(`saadnvd1`,TS,MIT)—— 怎么用 Node 调 tmux、管多面板会话,照源码学。

**协议层:** A2A 过重(跨厂商 / 网络自治);ACP 是干净的「结构化实时交互」路,但**既已决定不做交互,ACP 搁置、不留接口**。

## 派发路由:角色 frontmatter 的 `engine` 字段(2026-06-29 定)

派发走原生还是拓展、派给哪个工具,由**角色定义 `.agents/agents/<role>.md` 的 frontmatter 决定** —— 加一个**可选** `engine` 字段(与已有的可选 `model` 对称;取值 = registry 平台 id:`claude` / `codex` / `opencode` …)。

判据(**core 确定性地判,不靠主 agent 临场**):

> **`engine` 缺省 或 == 当前会话平台 → 原生同工具派发(用主工具自己的 Task);`engine` 指定了别的 → 拓展派发到那个工具(`withy dispatch` → headless + tmux 面板)。**

- **缺省 = inherit(可移植角色)**:同一个 `review` 角色,主会话是 Claude 就走 Claude Task、是 Codex 就走 Codex,保住「一份角色投递到多工具」;写了 `engine` = 钉死那个工具。
- **同时决定投递**:钉死 `codex` 的角色只对 Codex 有意义,`agentDef` 投递按 `engine` 过滤(不再往无关工具的 agents 目录投)。
- **core 判,不是主 agent**:core 读 frontmatter + 按 registry `sessionIdEnv` 检测当前平台 → relay 告诉主 agent「用你的 Task」还是「跑 `withy dispatch` 到 `<engine>`」。
- **validate 校验**:`engine` 指了个没装 / 没配的工具 → validate 期警告(复用悬空 agent / skill 告警,见 [[harness]] §8)。

**配置入口(web)**:`engine` 是有实际后果的路由开关,该在 web **agents 管理页**当**结构化表单字段**开放(下拉:取值来自 registry + `inherit` 默认 + 未安装则警告),和 `model` 一起做成表单。**不要**在 Markdown 正文编辑器里暴露裸 frontmatter YAML —— frontmatter 是结构化、可校验的元数据,手敲 YAML 易错;正文编辑器只管 body(角色 prompt),元数据一律走表单。见 [[web]]。

## Withy 要负责做到什么(分层职责)

**不做总指挥** —— 主编排是活 Claude Code 会话;Withy 提供状态 / gate / 知识当护栏。

**core(`@withy/core`,确定性、绝不 spawn 进程)**

- `RunRecord` 数据模型 + `runs/` 读写。
- `handback ingest`:解析 worker 输出(`codex exec --json` / `claude --print --output-format stream-json` 的流)→ 写紧凑 `handback.json` + 更新 run 状态;**状态来自退出码,不抓 PTY**。
- gate:`withy next` 要求 handback 存在且 `status==ok` 才放行 —— 复用现有门禁范式(checker + `Gate` 开关,见 [[node-gate-checkers]])。
- registry 加 `executor` / `invoke` 维度:照 CodeMachine「每工具一张小卡片」写法,仍守 [[core]] 单一数据源(executor 元数据只在 `agents/registry.ts` 定义一次)。
- **派发路由**:读角色 frontmatter `engine` + 按 registry `sessionIdEnv` 检测当前平台 → 判原生 / 拓展(见上「派发路由」节)。

**cli(`@withy/cli`,进程启动只活在这层)**

- `withy dispatch <node>`:从 registry 取 executor → 把子工具 headless **开进一个 tmux 面板** + tee 到 `runs/` → 写 `RunRecord(running)` → **等子进程退出** → 落 handback;一律 `< /dev/null` + 硬超时,把「可能挂起」转成「确定性失败」。

**主 agent(活的总指挥)**

- 跑 `withy dispatch` → 子进程返回即完成 → 读 handback → `withy next`。
- 纠偏走**自己**:结果不对就重新派 / `codex exec resume <id>` 续接;**不钻进子代理**。

**观察(可选)**:tmux 面板只读看子代理 + Web 控制台读 `events.jsonl` / 配置(见 [[web]])。

**明确不负责**

- 不做**交互式子代理**(CAO 那套)。
- 不抓 PTY 屏幕猜状态。
- 不做 daemon / HTTP server / SQLite。
- 不当总指挥(主编排是活 agent)。
- 不实现 ACP / A2A 协议(搁置)。
- 不做 live inbox / swarm(`send_message` 多 worker 实时协作暂不做)。

## 数据形状

```text
.withy/tasks/<id>/
  runs/
    dev-1.jsonl     # worker 原始流:既喂 tmux 面板实时看,也留档
    dev-1.json      # run 记录(见下)
  handback/
    dev.json        # 给 gate 和主 agent 读的紧凑回执
```

```jsonc
// runs/dev-1.json
{
  "runId": "dev-1",
  "node": "dev",
  "executor": "codex",       // 哪个 CLI 工具
  "cwd": "/path",
  "sessionId": "7f9f…",      // 存它 → 可重新派 / 续接 / 逃生口进交互
  "status": "running|completed|error|timeout",  // 来自退出码,非 PTY 猜测
  "exitCode": 0,
  "startedAt": "…", "endedAt": "…",
  "log": "runs/dev-1.jsonl"
}
```

```jsonc
// handback/dev.json —— 跨工具交接契约,沿用同工具 subagent 的回执形状
{ "node": "dev", "status": "ok|blocked|failed", "summary": "一句话结论",
  "touched": ["src/foo.ts"], "blockers": [], "needsInput": null }
```

## 各 worker 落地差异

- **Codex(首选)**:`codex exec --json` 干净、只把最终消息打到 stdout、可 `codex exec resume`。审批走「停 → resume」最顺。CodeMachine 用的确切 flag 见「参考目标」。
- **opencode**:用 headless `opencode run`。但其 headless 回调 / resume 偏弱(CAO 把 opencode 标 experimental;agent-os 的能力表里 opencode `Resume ❌`)→ 异步派发走「handback + 轮询」,别指望结构化回调。
- **Claude(作子代理时)**:`claude --print --output-format stream-json`,可 `--resume <id>`。

## 未决与风险

- **opencode headless 未核实**:`opencode run` 的确切 JSON 输出 / 是否支持 resume,没核 opencode 官方文档,落地前真机验证。
- **codex/opencode 当前会话平台探测信号已核实为「不存在」,非「未核实」(2026-07-01)**:Codex 官方环境变量文档(developers.openai.com/codex/environment-variables)未提供任何会话内自动置入的标记;opencode 的 `OPENCODE_SESSION_ID` 只是一个未发布的 GitHub issue(`anomalyco/opencode#12158`)。`resolveCurrentPlatform` 对这两者按设计恒返回 `null`(机制通用、`claude` 可真实检测),真实检测要等上游任一方补齐信号后回填 `registry.ts` 的 `sessionIdEnv`,无需改动检测/路由逻辑本身。
- **逃生口的「resume 进原生 TUI」确切命令未核**(尤其 Codex 进交互续接哪个 flag);Claude 的 `--resume` 不带 `--print` 进交互是标准用法,有把握。
- swarm / 多 worker 实时协作不做。
- **阶段一(确定性核心路由)已实现,见 [[status]] K18/C16**:engine frontmatter、`routeAgent`、`DispatchBlock.mode/engine`、`validateWorkflow` engine 告警、`RunRecord`/`handback` 纯 schema、opencode 注册均已落地;`withy dispatch` 真正起子进程等阶段二内容仍未做。

## 关联

- 现有 dispatch、`withy next` 门禁、relay、hook 注入:[[harness]]
- `RunRecord` 落点、Store API、registry 单一数据源(含 `AGENT_PLATFORMS` 声明类型的跨包坑记录)、归档:[[core]]
- `withy dispatch` / `withy next` / `withy note` 命令族:[[cli]]
- 门禁=checker+开关的扩展范式(新增「handback 就绪」门禁照此做):[[node-gate-checkers]]
- 观察层(tmux 面板 + Web 控制台读 `events.jsonl`):[[web]]
- 实现状态登记:[[status]]

## 来源

**已核实(实际读取):**

- **CodeMachine-CLI**(`moazbuilds/CodeMachine-CLI`):`README.md`、`package.json`(TS/Bun、Apache-2.0)、`src/workflows/run.ts` + `runner/core.ts`(编排是死代码状态机)、`src/agents/execution/run.ts`、`src/infra/engines/providers/{codex,claude}/{metadata.ts,execution/commands.ts}`(两条真实命令逐字核实)。
- **CAO**(`awslabs/cli-agent-orchestrator`):`README.md`、`CODEBASE.md`、`docs/{terminal-lifecycle,event-driven-architecture,opencode-cli,inbox-delivery,control-planes}.md`(抓屏管线、inbox 投递、opencode experimental)。
- **agent-os**(`saadnvd1/agent-os`):`README.md`(TS/MIT、tmux、多 CLI、provider 能力表)。
- 协议层(经 SourceMux + 官方源):Codex `codex exec`/`--json`/`resume`(developers.openai.com/codex)、Claude `--print`/`--output-format`(code.claude.com)、ACP `agentclientprotocol.com`、A2A(`a2aproject/A2A`)。

**未核实:** opencode `opencode run` 的确切输出 / resume;Codex「进原生 TUI 续接」的确切 flag;各第三方仓库当前维护活跃度。
