# 跨工具 agent 派发 —— 阶段一:确定性核心路由地基

> 本任务是 [[cross-tool-dispatch]] 调研落地的**第一阶段**,只做**确定性核心路由**,不真正 spawn 子进程。
> 任务标题保留了整个 epic 的名字(headless / tmux / handback gate),那些属于后续阶段;本 prd 的范围以本页为准。

## Goal

让 core 能**确定性地判定**:某个带 agent 角色的节点该走「原生同工具派发」(主 agent 用自己的 Task)还是「跨工具拓展派发」到另一个 agent CLI,以及派给哪个工具。这是整套跨工具派发的地基——判定正确、可单测、无副作用,后续阶段的 `withy dispatch`(真正起进程)才有稳定依据。

修正调研前提:**主编排是任意活 agent CLI(Claude Code / Codex / opencode 均可),不特指 Claude Code**。因此「检测当前会话平台」的机制必须通用于三种编排器(而非硬编码只认 Claude),但真实命中验证受限于各平台是否已提供可用信号(见 Requirements)。

## Confirmed Facts

- 现有 `dispatch`(`packages/core/src/workflow/dispatch.ts` + `store/dispatch.ts`)是**同工具**子代理派发:节点 `agent` 声明 → relay 渲染 `DispatchBlock` → 主 agent 用自己工具派同类子代理。本任务新增的是正交的**跨工具运行时**判定。
- registry(`packages/core/src/agents/registry.ts`)目前只注册 `codex`、`claude`;**没有 `opencode`**。
- `codex` 平台**没有 `sessionIdEnv`**;只有 `claude` 有 `CLAUDE_CODE_SESSION_ID`。`resolveSessionId()` 靠 `sessionIdEnv` 检测当前平台——缺则无法判定 Codex/opencode 作为编排器时的当前平台。
- `validateWorkflow`(`packages/core/src/workflow/validate.ts`)已有 `agentExists` 悬空告警范式(warning 不 block),新的「engine 指向未装工具」告警照此做。
- 角色定义在 `.agents/agents/<role>.md`。knowledge 设计文档(`harness.md`)约定 frontmatter 应含可选 `model`,但核实 `packages/core/src/store/agents.ts` 后确认当前代码只解析 `description`(`readDescription` 正则),并未实现 `model` 的读取——`engine` 应比照这条 `description` 正则扫描的**既有实现模式**新增,而非比照一个尚未落地的 `model` 字段。
- 已核实(官方文档 + 直接 fetch):Codex CLI 官方环境变量页(developers.openai.com/codex/environment-variables)只列 `CODEX_HOME`/`CODEX_API_KEY` 等需用户或安装器主动设置的项,不含类似 `CLAUDE_CODE_SESSION_ID` 的「会话内自动置入」标记;opencode 的 `OPENCODE_SESSION_ID` 只是一个未发布的 GitHub issue(`anomalyco/opencode#12158`),尚未实现。即:codex/opencode 当前**没有**可用的会话平台探测信号,非猜测。

## Requirements

- 角色 frontmatter 新增**可选** `engine` 字段,取值为 registry 平台 id(`claude` / `codex` / `opencode`)。缺省表示 inherit(可移植角色)。
- core 提供确定性路由判定:输入=角色定义 + 当前会话平台;输出=`native`(engine 缺省或 == 当前平台)或 `cross`(engine 指定了别的平台)+ 目标 engine。判定在 core 完成,不依赖主 agent 临场判断。
- 当前会话平台检测机制通用于 registry 中任意声明了 `sessionIdEnv` 的平台(遍历命中即返回该平台,均未命中返回 `null`);opencode 需先入 registry。`claude` 有可核实的真实 `sessionIdEnv`(`CLAUDE_CODE_SESSION_ID`),本阶段可验证真实命中;`codex`/`opencode` 上游未提供会话内自动标记(已核实),`sessionIdEnv` 本阶段留空——机制仍需正确处理三者,只是后两者的「真实命中」验证推迟到上游补齐信号后。
- 路由判定结果通过既有 relay/`DispatchBlock` 通道**如实呈现**给主 agent:native 走原生 Task;cross 明确标注目标 engine,并**诚实标注**跨工具执行尚未落地(不发出一条当前跑不通的命令)。
- `validateWorkflow` 对「`engine` 指向未安装/未配置工具」产出 **warning**(复用 `agentExists` 范式,不 block 建任务)。
- 单一数据源:engine/executor 相关平台元数据只在 `registry.ts` 定义一次(遵守项目铁律)。
- 落地 RunRecord 与 handback 两份**纯 schema 契约**(TS 类型 + zod 校验器,只定形状),给阶段二一个钉死的接口。本阶段不读写、不接线、不启用任何 gate。

## Acceptance Criteria

- [ ] 角色 frontmatter 解析:含 `engine: codex` 的角色被解析出 `engine==='codex'`;不含 `engine` 的角色 `engine===undefined`;仅空白值(`engine:   `)规整为 `undefined`;非法取值(非平台 id,如 `engine: foo`)在解析层不拒绝,原样保留为字符串,由 `validateWorkflow` 告警(design 已定案)。
- [ ] 路由判定单测覆盖三类:engine 缺省→native;engine==当前平台→native;engine!=当前平台→cross+目标 engine。当前平台分别取 claude / codex / opencode 各验一遍。
- [ ] 当前平台检测:`resolveCurrentPlatform` 对「任意 registry 声明了 `sessionIdEnv` 的平台」通用——设置 `claude` 的 `CLAUDE_CODE_SESSION_ID` → 返回 `claude`;多个同时设置 → 按遍历序取第一个;均未设置 → `null`。`codex`/`opencode` 的 `sessionIdEnv` 留空是已核实的上游限制,不在本阶段验收范围内,记入风险/`[[status]]` 待补。
- [ ] `DispatchBlock`(或其等价通道)在 cross 情况下携带目标 engine 且动作文案标注「跨工具执行未落地」;native 情况下行为与现状一致(回归不破)。
- [ ] `validateWorkflow`:一个节点角色 `engine` 指向未注册/未安装工具 → 结果含一条 `level:'warning'` 且 message 指明该 engine;engine 合法或缺省 → 无此告警。
- [ ] RunRecord 与 handback 的 zod schema 存在且导出:合法对象 `parse` 通过、缺必填字段/非法 status 枚举被拒;两份 TS 类型从 schema 推导可用。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/core` build 通过;新增逻辑的相关单测通过。

## Out of Scope

- `withy dispatch <node>` 真正起子进程、headless exec、tmux 面板、tee 到 `runs/`(阶段二)。
- RunRecord 数据模型的**读写落地**、handback ingest、handback 就绪 gate 的**接线启用**(阶段二);本阶段只定这两份的 schema 形状,不读写不接线。
- registry `executor`/`invoke` 的**具体命令与 flag**(`codex exec …` 等实际调用串)——本阶段不 spawn,不需要;阶段二再加。
- web agents 管理页的 engine/model 结构化表单(阶段三)。
- resume 逃生口、opencode headless 真机核实、swarm/多 worker 实时协作。

## Open Questions

- None.
