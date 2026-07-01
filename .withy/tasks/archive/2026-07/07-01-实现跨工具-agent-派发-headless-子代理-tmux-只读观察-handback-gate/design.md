# Design: 跨工具 agent 派发 —— 阶段一:确定性核心路由地基

> 落地 [[cross-tool-dispatch]] 的第一阶段。只做确定性判定与契约定义,不 spawn 进程。

## Summary

在 core 里加一层**确定性路由判定**:读角色 frontmatter 新增的可选 `engine` 字段 + 检测当前会话平台 → 判「原生同工具派发」还是「跨工具拓展派发」到指定 engine,判定结果经既有 `DispatchBlock` 通道如实传给主 agent。配套把 **opencode 注册为完整 install 平台**(用户选定:直接入 `AGENT_PLATFORMS`),并定义 **RunRecord / handback 两份纯 zod 契约**给阶段二。全程无进程副作用,路由/检测/校验/契约均可单测。

选此形态的原因:判定放 core 才能确定性、可测、不靠主 agent 临场;engine 沿用现有 `description` frontmatter 正则 scan 的既有实现模式(而非一个尚未落地的 `model` 字段)与 `agentExists` 告警范式,改动面小、贴合仓库既有模式。

## Architecture and Boundaries

**新增/触及的单元(核心逻辑在 `@withy/core`;opencode configurator 在 cli;engine 校验的 ctx 注入分别接入 cli 与 app 各自已有的 `validateWorkflow` 调用点):**

1. **registry(`agents/registry.ts` + `agents/types.ts`)** — opencode 入 `AGENT_PLATFORMS`;新增 `resolveCurrentPlatform(env)` 返回当前平台 id;`AgentTool` 联合类型随之含 `opencode`。
2. **frontmatter 解析(`store/agents.ts` + `agents/agents.ts`)** — 现有正则 scan 扩出 `engine`,`ScannedAgent`/`DiscoveredAgent` 带上 `engine: string | undefined`(与 `description` 同为未校验的原始字符串,不提前窄化成 `AgentTool`);新增 `resolveAgentEngine(scope, role): string | undefined` 按角色名解析 engine(role 不存在或未声明 engine 都返回 `undefined`)。
3. **路由判定(`workflow/dispatch.ts`)** — 新增纯函数 `routeAgent({ engine }, currentPlatform)` → `{ mode: 'native' | 'cross', engine? }`;`dispatchBlock` 消费它,给 `DispatchBlock` 加 `mode`/`engine` 字段与诚实动作文案。
4. **校验(`workflow/validate.ts` + 两处调用方 `cli/commands/task.ts`、`app/api/workflows/[id]/route.ts`)** — `ValidateContext` 新增两个谓词(`resolveAgentEngine`/`enginePlatformAvailable`,见下),核心判定逻辑在 core;两处既有 `validateWorkflow(...)` 调用(它们已各自注入 `agentExists`)照同一范式各加两行注入,否则新告警只在其中一处生效。
5. **契约(`types.ts`)** — 新增 `RunRecordSchema` / `HandbackSchema` 及推导类型,仅导出形状;`AgentToolSchema` 从 `AGENT_PLATFORMS` 键派生(而非在 `types.ts` 手写字面量),守单一数据源。
6. **opencode configurator(`cli/configurators/opencode.ts` + `registry.ts`)** — 补齐 `PLATFORM_CONFIGURATORS` 穷举 Record;新增 `templates/opencode/agents/.gitkeep`(核实 `copyAgentTemplates`:源目录缺失时优雅空返回,不报错——这条只是跟 claude/codex 保持「每个已注册平台都有一份 template 目录」的一致性,不是避免崩溃;`skills/.gitkeep` 不需要,`installAgentSkills` 统一读 `common/skills/`,不读任何按平台的模板 skills 目录,claude 同样没有这份);init 接入随 `getInitAgentChoices` 自动发生。

**明确边界:**

- core **绝不 spawn**;本阶段连 spawn 的调用点都不建(阶段二的 `withy dispatch` 在 cli)。
- 不写 `runs/`、不 ingest handback、不接任何 gate。RunRecord/handback 只有 schema,无读写函数。
- registry `executor`/`invoke` 的**实际命令串**(`codex exec …`)不加——本阶段不执行,不需要。
- 单一数据源铁律:opencode 平台元数据只在 `registry.ts` 定义一次;engine 合法取值 = `AgentTool` 联合,不另立清单。

## Components

### `engine` frontmatter 字段

- **做什么**:角色 `.agents/agents/<role>.md` frontmatter 的可选 `engine`。缺省 = inherit。
- **调用方怎么用**:web 表单(阶段三)或手写;core 读它做路由。
- **依赖**:沿用 `store/agents.ts` 的正则 scan(不引入 YAML 解析器,与现有 `description` 抓取同法)。非法取值不在解析层拒,交给 validate 出 warning(与 `model` 一样宽松)。
- **类型**:`ScannedAgent.engine`/`DiscoveredAgent.engine` 为 `string | undefined`(和 `description` 一样是未校验的原始字符串),不提前窄化成 `AgentTool` ——解析层不知道值是否合法,窄化会是不成立的类型断言;是否是已知平台由 validate 阶段的 `enginePlatformAvailable` 判断。
- **空值规整**:正则要求 `.+`(至少一个非换行字符),`engine:` 后完全无内容时天然不匹配、按未声明处理;但 `engine:   `(仅空白)会匹配后被 `.trim()` 成 `''`——需显式把 trim 后的空字符串规整为 `undefined`(视同未声明),否则会被当成一个非法但「已设置」的 engine 值,类型判定和路由消息里会出现空字符串 engine。

### `resolveCurrentPlatform(env)`

- **做什么**:遍历 `AGENT_PLATFORMS`,返回第一个 `sessionIdEnv` 命中的平台 id,否则 `null`。与既有 `resolveSessionId` 对称(后者返回 id 值,本函数返回平台)。
- **调用方**:relay/`dispatchBlock` 组装时传入,喂给 `routeAgent`。
- **依赖**:各平台 `sessionIdEnv`。**已核实缺口(非猜测)**:Codex 官方环境变量文档未提供任何会话内自动标记;opencode 的 `OPENCODE_SESSION_ID` 是未发布的 GitHub issue(`#12158`)。两者 `sessionIdEnv` 本阶段留空,`resolveCurrentPlatform` 对它们恒返回 `null`——机制通用、行为安全(见「风险 1」),真实检测推迟到上游补齐信号后回填 registry。

### `routeAgent(agent, currentPlatform)` — 纯函数

- **输入**:`{ engine?: string }`(角色解析出的原始 engine 字符串,未校验)+ `currentPlatform: AgentTool | null`。
- **输出**:`{ mode: 'native' } | { mode: 'cross', engine: string }`。
- **判据**:
  - `engine` 缺省 → `native`。
  - `engine === currentPlatform` → `native`。
  - `engine` 有值且 `!== currentPlatform`(含 currentPlatform 为 null)→ `cross`,目标 = `engine`。
- **不依赖 fs**,纯字符串比较,不要求 `engine` 是合法 `AgentTool`——非法值一样能正确落入 `cross`(design 的 Error Handling 一节已覆盖),单测直给。

### `DispatchBlock` 扩展

- 现有字段(`role`/`activeTask`/`curated`/`action`)保留;新增 `mode: 'native' | 'cross'` 与可选 `engine: string`(cross 时携带,值直接来自角色声明的原始字符串,可能不是一个真实已装平台——文案会如实提示)。
- `mode==='native'`:`action` 与现状一致(主 agent 用自己 Task)。回归不破。
- `mode==='cross'`:`action` 诚实标注「该步应交给 `<engine>` 运行时,但跨工具执行(`withy dispatch`)尚未落地(阶段二),当前请按原生方式代跑或暂停」——**不发出跑不通的命令**。

### validate engine 告警

- **为什么不是一个谓词**:`agentExists(name)` 够用是因为 core 已持有要查的 id(`node.agent`)。engine 不一样——`validateWorkflow` 手上只有 `node.agent`(角色名),`engine` 值本身锁在角色文件 frontmatter 里,core 纯函数读不到,必须先经一次「角色名→engine」的解析,才轮到「这个 engine 是否已知/已装」的判断。因此拆两个职责单一的谓词,而不是一个谓词或一个杂糅返回对象:
  ```ts
  export interface ValidateContext {
    ...
    agentExists?: (name: string) => boolean;
    // 角色名 → 其声明的 engine(role 不存在或未声明 engine 都返回 undefined)。
    resolveAgentEngine?: (role: string) => string | undefined;
    // 该 engine 是否是已知且已配置(configDir 存在)的平台。
    enginePlatformAvailable?: (engine: string) => boolean;
  }
  ```
- **validate.ts 内的判定**:节点有 `agent` 且 `ctx.resolveAgentEngine` 注入 → 解析 engine;engine 非空且 `ctx.enginePlatformAvailable` 注入且返回 `false` → 一条 `level:'warning'`,message 同时点出 role 与 engine(如 \`agent "review" 的 engine "foo" 未注册或未配置\`);engine 为 `undefined`(缺省/inherit)或 `enginePlatformAvailable` 返回 `true` → 无告警。两个谓词均可选,未注入时整段检查跳过(与 `agentExists` 的可选注入范式一致)。
- **`enginePlatformAvailable` 的判据**:复用 `agents/deploy.ts` 里 `deployAgents` 已有的「`configDir` 是否存在于项目」定义(该文件第 82/95 行的既有约定)—— `engine in AGENT_PLATFORMS && existsSync(resolve(scope.root, AGENT_PLATFORMS[engine].configDir))`。未知 id 和已知但未配置,统一收敛成 `false`(告警文案不需要区分这两种,AC 里也只要求「message 指明该 engine」)。
- **两处调用方都要接入**:`packages/cli/src/commands/task.ts`(`withy task start` 建任务前的校验)与 `packages/app/src/app/api/workflows/[id]/route.ts`(web 画布保存时的校验)各自已经独立注入 `agentExists: name => agentExists(scope, name)`——是两个独立调用点,不是共享一份 ctx。这次要在两处各自照抄同一范式加上 `resolveAgentEngine`/`enginePlatformAvailable` 两行注入,否则新告警只在其中一处生效(如只改 cli,web 画布保存工作流永远不会提示 engine 问题)。这两处目前都没有专门的单测覆盖(`agentExists` 的两行注入本身也没有),新增的两行按同等严格度对待——由 `pnpm typecheck` 兜底类型正确性,不必新起一套集成测试。

### RunRecord / handback 契约(`types.ts`)

```ts
export const RunStatusSchema = z.enum(['running', 'completed', 'error', 'timeout']);
export const RunRecordSchema = z.object({
  runId: z.string(), node: z.string(), executor: AgentToolSchema,
  cwd: z.string(), sessionId: z.string().optional(),
  status: RunStatusSchema, exitCode: z.number().int().optional(),
  startedAt: z.string(), endedAt: z.string().optional(), log: z.string().optional(),
});
export const HandbackStatusSchema = z.enum(['ok', 'blocked', 'failed']);
export const HandbackSchema = z.object({
  node: z.string(), status: HandbackStatusSchema, summary: z.string(),
  touched: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  needsInput: z.string().nullable().default(null),
});
```

- 仅定形状 + 导出类型;无 store 读写、无 paths 落点(阶段二再加 `runs/` 路径与 API)。
- `executor` 复用 `AgentTool`:`AgentToolSchema` 从 `AGENT_PLATFORMS` 键派生(`z.enum(Object.keys(AGENT_PLATFORMS) as [AgentTool, ...AgentTool[]])`),不在 `types.ts` 手写字面量清单——项目「单一数据源」铁律要求平台元数据只在 `registry.ts` 定义一次;已核实 `types.ts` 当前零依赖(只 import `zod`)、`agents/registry.ts` 也不反向依赖 `types.ts`,两者互相 import 不成环。

### opencode 平台条目 + configurator

- registry 条目(据核实约定):`configDir:'.opencode'`、`agentDef:{ target:'.opencode/agents', format:'markdown' }`(与 claude 同格式,可共用 canonical)、`skillTarget:'.opencode/skills'`、`skillDirs.project:['.opencode/skills']`、`supportsAgentSkills:true`、`cliFlag:'opencode'`、`templateContext`(命令前缀 `/`)。`sessionIdEnv`:留空(与风险 1 的决定一致——上游未提供该信号,不用占位值填充)。
- `defaultChecked:false` —— opencode headless/会话检测未核实,不默认推给 `withy init` 用户。
- `configureOpencode`:参照 `configureClaude`(markdown agent 同构)最小实现,交付 skills/agents 到 `.opencode/*`。

## Data Flow and Contracts

```
角色 .md frontmatter ──scan──▶ ScannedAgent.engine ──┐
                                                      ├─▶ routeAgent ─▶ { mode, engine? } ─▶ DispatchBlock ─▶ relay ─▶ 主 agent
process.env ──resolveCurrentPlatform──▶ currentPlatform┘
```

- **不变量**:`routeAgent` 对同一 `(engine, currentPlatform)` 恒定;`native` 决策不携带 engine(主 agent 用自身工具,无需命名平台)。
- **契约**:`DispatchBlock.mode` 决定主 agent 走原生 Task 还是等待阶段二;cross 情况下 `engine` 一定存在。

## Error Handling and Edge Cases

- **currentPlatform 无法检测(null)**:`engine` 缺省仍 `native`(主 agent 用自身工具,正确);`engine` 有值 → 一律 `cross`。副作用:主 agent 恰是该 engine 时会误判 cross —— 但阶段二才真正 dispatch,当前只是文案提示,**不产生错误行为**,已记风险。
- **engine 非法取值**(如 `engine: foo`):解析层不拒(宽松),validate 出 warning;`routeAgent` 收到未知值按「!== currentPlatform」→ cross(文案会提示未装),不崩。
- **回归保护**:所有现有 `agent` 节点(无 engine)→ `native` → `DispatchBlock` 行为逐字等同现状。

## Compatibility and Migration

- **向后兼容**:`engine`、`DispatchBlock.mode`/`engine`、RunRecord/handback schema 全为**新增可选**;老任务/老角色无 engine → native 路径不变。
- **迁移**:无数据迁移。opencode 入 `AGENT_PLATFORMS` 会让 `withy init` 多一个(默认不勾)选项,属新增能力非破坏。
- **单一数据源**:`sessionIdEnv` 若为补 codex/opencode 而调整,只动 `registry.ts`。

## Testing Strategy

- **frontmatter 解析**:含/不含/非法 `engine` 三例 → 解析结果符合预期。
- **routeAgent 矩阵**:currentPlatform ∈ {claude, codex, opencode, null} × engine ∈ {缺省, 同, 异} → mode/engine 断言。
- **resolveCurrentPlatform**:注入设置了某平台 `sessionIdEnv` 的 env → 返回该平台;都没设 → null;多个设置 → 遍历序命中。
- **validate**:两个谓词都注入时——engine 解析出的值未知/未装(`enginePlatformAvailable` 返回 `false`)→ 恰一条 warning 且 message 同时含 role 与 engine;engine 合法已装或角色未声明 engine(`resolveAgentEngine` 返回 `undefined`)→ 无告警。任一谓词未注入 → 整段检查跳过(比照现有「skips the agent check when no resolver is injected」用例)。
- **契约 schema**:合法对象 parse 通过;缺必填/非法枚举被拒;默认值(touched/blockers/needsInput)生效。
- **回归**:无 engine 的 `dispatchBlock` 快照与现状一致。
- 命令:`pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/core` build、相关包 `vitest`。

## Risks and Rollback

- **风险 1(已核实,非猜测):codex/opencode 上游未提供「当前会话」env 变量**(Codex 官方文档未列出此类信号;opencode 的 `OPENCODE_SESSION_ID` 是未发布 issue `#12158`),`resolveCurrentPlatform` 对这两者恒 `null`。影响面:无 `engine` 的角色(inherit,最常见场景)不受影响,仍正确判 `native`——`routeAgent` 第一条判据(`engine` 缺省 → `native`)本就不看 `currentPlatform`;只有**显式钉死 `engine: codex` 且恰好跑在 Codex 编排下**时,才会因检测不到「当前就是 codex」而误判 `cross`(仅文案提示「跨工具执行未落地」,阶段一不 spawn,无实际错误行为)。缓解:① 已定为本阶段验收范围外的已知限制(非本阶段待办);② `sessionIdEnv` 留空,`routeAgent` 兜底安全;③ 记入 [[status]] 待补,上游任一方提供真实信号后回填 registry 即可,`resolveCurrentPlatform`/`routeAgent` 逻辑无需改动。
- **风险 2:opencode configurator 基于文档约定而非真机验证** → 目录/格式可能有出入。缓解:参照 claude 同构最小实现 + `defaultChecked:false` 不默认启用 + 阶段二真机核实前不接 dispatch。
- **风险 3(实现期发现并修复):扩 `AgentTool` 联合的连带编译影响本来不生效**。原以为「类型系统会逐点报错」是现成安全网,实现期实测证伪:`registry.ts` 的 `defineAgentPlatforms` 用「参数与返回都重新构造 mapped type」的写法,在 `@withy/core` 自身编译内没问题,但跨包消费时(`tsc -p tsconfig.build.json` 出 `.d.ts`)这个具体写法会把 `AGENT_PLATFORMS` 的声明类型收窄丢失,坍缩成 `{ [x: string]: AgentPlatformConfig<string> }` 索引签名——`AgentTool` 因此在 core 之外退化成普通 `string`,`cli` 的 `PLATFORM_CONFIGURATORS: Record<AgentTool, PlatformConfigurator>` 缺一个平台条目也不报错(已用移除 opencode 条目重跑 `pnpm --filter @withy/cli typecheck` 实测复现)。顺带发现同一函数「id/cliFlag 与 key 一致性在编译期核对」的注释承诺也没有真正生效(故意写错 id 同样不报错)。两条都是历史遗留,不是本任务引入。**已修复**:`defineAgentPlatforms` 改为参数与返回都直接是 `TPlatforms` 本身(不重新派生 mapped type),`.d.ts` 验证后正确保留字面量 key;`AGENT_PLATFORMS` 各条目因此不再自动获得 `AgentPlatformConfig` 的统一可选字段访问,改为新增 `platformList()` helper(内部转型为 `AgentPlatformConfig[]`)供需要按通用形状遍历所有平台的六处调用点使用,`getInitAgentChoices` 仍直接用 `Object.values(AGENT_PLATFORMS)` 保留精确联合类型。移除后重跑 typecheck 确认 `TS2741: Property 'opencode' is missing...` 真实抛出,修复前后各验证一次。id/cliFlag↔key 的编译期一致性检查本次未一并修复(需要另一套写法,收益小于本任务范围,记入 [[status]] 留作独立后续)。
- **回滚**:各单元均为新增/可选,`git revert` 即可;无落盘数据、无 schema 迁移,回滚无残留。
