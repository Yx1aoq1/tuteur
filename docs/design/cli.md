# CLI 设计

> 适用范围:`packages/cli`(`@tuteur/cli`,可执行名 `ttur`)。
> 定位:实施规格级。CLI 是用户与 agent 的稳定入口、确定性逻辑的调用方。**所有 `.tuteur/` 读写与门禁都委托 [@tuteur/core](./core.md),CLI 不自己碰盘。**
> 数据 schema 见 [core.md §4](./core.md#4-类型与校验);双层模型见 [core.md §2](./core.md#2-双层模型全局-vs-项目)。
> 先看 [INDEX.md](./INDEX.md) 的实现状态矩阵区分已实现/待实现。

---

## 1. 职责边界

| CLI 负责 | 委托给谁 |
| --- | --- |
| 命令解析、交互、参数校验 | —— |
| 初始化项目/全局结构、装 skill、配 agent | configurator 引擎(§8) |
| 读写数据、计算 phase/step、门禁判定 | **@tuteur/core**(store + domain) |
| hook 事件入口(`ttur hook <event>`) | core(context/state) |
| 模板更新冲突检测 | installation/managed-templates |

核心不变量:**run 成功 ≠ 节点完成**,完成只由 `ttur complete <node>`(经 `core.completeNode`)判定。

---

## 2. 包结构与入口

```text
packages/cli/src/
  index.ts                # shebang 入口
  program.ts              # commander 装配
  commands/
    index.ts              # 约定式动态加载器
    init.ts               # [已实现] 初始化(待扩展 --global)
    dashboard.ts          # [已实现] dashboard 进程管理
    uninstall.ts update.ts# [已实现] 卸载 / 模板更新
    task.ts               # [待实现] 任务命令族
    complete.ts           # [待实现] 节点门禁(调 core.completeNode)
    hook.ts               # [待实现] 平台事件入口(§5)
  configurators/
    registry.ts           # [待实现] AGENT_TOOLS 注册表(平台元数据单一源)
    shared.ts             # [部分实现] resolveSkills/writeSkills/linkSkills/copySkills/占位符
    codex.ts claude.ts gemini.ts  # [部分实现] 每平台 configurator
    index.ts              # [待实现] configureAgentPlatform 派发 + hook 登记适配器
  installation/
    init.ts               # initProject():调 core 建结构 + 装 skill + 配 agent
    managed-templates.ts  # 模板哈希追踪
  templates/              # 写入用户仓库的模板源(见 harness.md §6)
```

### 2.1 约定式命令加载(已实现,保留)

`commands/index.ts` 扫描目录,每个文件默认导出 `(program)=>void|Promise<void>`,按字母序注册。**加命令 = 放一个文件**,不改 `program.ts`。新增 `task.ts`/`complete.ts`/`hook.ts` 即自动生效。

---

## 3. 命名常量

`constants/product.ts` 由产品名派生一切(`PRODUCT_DISPLAY_NAME`→`Tuteur`、`CLI_COMMAND_NAME`→`ttur`、`PROJECT_DIR_NAME`→`.tuteur`、`getBundledSkillName('dev')`→`tuteur-dev`、`getSlashCommandPrefix()`→`/tuteur:`)。**这些常量应迁入 core 或由 core 复导出,app 不再手抄**(消除 `app/product.ts` 重复,core.md K6)。

---

## 4. 已实现命令(保留,部分待扩展)

### 4.1 `ttur init`

参考 Trellis:**每个 agent 一个布尔 flag**(不用 `--agents codex,claude`);所有选择收敛成 [InitConfig](./core.md#8-initconfigcli-与-web-共用的初始化模型),三种输入(flag / 交互 / web 表单)同源产出,统一执行。

```text
ttur init [-y|--yes] [-u|--user <name>] [--global] [--copy]
          [--codex] [--claude] [--gemini] ...      # 每个 agent 一个 flag(由注册表派生)
```

| 选项 | 作用 |
| --- | --- |
| `--codex` / `--claude` / `--gemini` | 选中对应 agent;由 `AGENT_TOOLS` 注册表的 `cliFlag` 派生(§8) |
| `-y, --yes` | 用注册表 `defaultChecked` 的 agent,跳过交互;隐含冲突时 skip |
| `-u, --user <name>` | 本地身份;缺省取 `git config user.name`(同 Trellis) |
| `--global` | **写 `~/.tuteur/` 全局根**;全局只装 workflow 模板+config+projects,**不配 agent、不建 members**(core.md §2.3 安全边界) |
| `--copy` | skill 写独立副本;缺省 `link`(软链共享)。取代冗长的 `--skill-mode` |

显式 flag > `-y` 默认 > 交互(三路优先级同 Trellis)。所有选项都映射到 InitConfig 字段,因此 `ttur init --codex --claude -u yan` 与交互、与 web 表单等价 —— web「初始化项目」按钮即 `spawn` 序列化出的这条命令(web.md §2.4)。

流程(项目模式):

```text
ttur init
  → 收集 InitConfig(flag 解析 / 交互问 INIT_QUESTIONS / web 表单,三选一)
  → initProject(config)
      ├─ core 建 scope 目录(项目:tasks/workflows/spec/...;全局:config+projects+模板)
      ├─ 写 config.json / context.json / 默认 workflow
      ├─ installCanonicalWorkflowSkills() → .agent/skill/<name>(不覆盖)
      ├─ 项目模式:写 .user + workspace/<slug>/ + upsert members.json
      ├─ 对每个 agent:configureAgentPlatform(id, ctx)   # §8 派发到 configurators/<id>.ts
      └─ recordCurrentTemplateHashes()
```

全局模式(`--global`)跳过 agent 配置与 members/workspace —— 只在 `~/.tuteur/` 落 config + projects 注册表 + workflow/spec 模板(core.md §2.1/§2.3)。

**交互输入**:agent 多选用 `@inquirer/prompts` 的 checkbox(choices 由注册表 `defaultChecked` 派生);名字这类纯文本输入参考 Trellis 用 readline 避免闪烁。问题定义见 `INIT_QUESTIONS`(core.md §8),与 web 表单同源。

### 4.2 `ttur dashboard start|stop`(已实现,待调整)

当前 `start` 把单一 `TUTEUR_PROJECT_ROOT` 传给 `next dev`。**多项目 dashboard 下,项目根不再由启动参数固定**,而由 web 端选择(web.md §2)。`start` 应改为:确保全局根存在 → 启动 dashboard(不强绑单项目)→ 写 `runtime/dashboard.json`。详见 web.md §7。

### 4.3 `ttur update` / `uninstall`(已实现,保留)

基于 `managed-templates` 哈希追踪,见 §7。`uninstall` 需支持 `--global` 清理全局根。

---

## 5. 待实现命令

退出码约定:`0` 成功 / `1` 通用错误 / `2` **门禁失败** / `3` 用户取消。

### 5.1 `ttur task ...`

```text
ttur task create "<title>" [--workflow <id>] [--assignee <slug>] [--worktree]
ttur task list [--mine|--all] [--status ...]
ttur task status <task>
ttur task archive <task>
```

`create`:`core.resolveProjectScope()` → 校验 workflow → `taskId=<MM-DD>-<slug>` → `core.writeTask/writeState`(初始化到首 phase 首 step);create 前扫 `tasks/archive/` 防同名重建(core.md §9);`--worktree` 时调 `core.createWorktree`(在 `~/.tuteur/worktrees/<project>/<taskId>` 建 worktree+分支,core §9.1)。`list --mine` 用 `core.isOwnedBy`(按 assignee)+ `core.shouldFilterByUser`(全局根不过滤,core.md §3),默认不含归档。`archive`:`core.archiveTask` —— 改状态 + 移动整个任务目录到 `tasks/archive/<id>/` + 清理 worktree,**不绑任何产物**(core.md §9)。

### 5.2 `ttur complete <node>` —— 核心门禁

```text
ttur complete <node> [--task <task>]      # node 必须是 skill 节点(decision 由 harness 自动推进)
  → core.completeNode(scope, taskId, node)
  → result.ok  → exit 0(沿边推进,自动穿过 decision,改 task.status)
  → !result.ok → exit 2 + stderr 打印缺失项
```

CLI 只做"解析参数 + 调 core + 映射退出码",**门禁与节点图推进全在 core**(harness.md §2/§3)。

### 5.3 `ttur hook <event>` —— 平台事件统一入口(本轮新增)

把被动事件收敛成 CLI 子命令,消除 py 里的业务逻辑(harness.md §1)。

```text
ttur hook session-start            # 平台会话启动时被转发调用;stdout 输出注入内容
ttur hook pre-step  / post-step    # 可选
  环境变量输入:TUTEUR_PROJECT_ROOT / TUTEUR_TASK_ID / TUTEUR_STEP_ID
  退出码:0=成功(stdout 即注入文本);非0=失败(平台忽略,不阻断会话)
```

`hook session-start` 内部:`core.resolveProjectScope` → `core.readState` + `core.resolvePlannedContext` → 拼注入文本到 stdout(参考实现见 harness.md §6.4)。

---

## 6. 数据文件(归属 core)

`.tuteur/` 结构、各 JSON schema、双层布局**统一在 [core.md §2/§4](./core.md)**,本文不复制。CLI 只通过 `core.store` 读写。

已实现并由 `init` 写出的:`config.json`、`context.json`、`workflows/default.workflow.json`、`template-hashes.json`、`.user`、`workspace/<slug>/index.md`。
待实现:`tasks/<id>/{task,state}.json`、`runs/NNN.json`、`members.json`、`approvals.json`。

> 注意:`init` 当前写的 `default.workflow.json` 的 step 只有 `skillRef`/`required`,缺 `requiredArtifacts`/`checks`。补全门禁字段见 harness.md §1。

---

## 7. 模板更新机制(managed-templates,已实现)

```text
analyzeTemplateChange:
  不存在→create  内容相同→unchanged  哈希匹配(用户没改)→auto-update  否则→conflict

ttur update → create/auto-update 直接写;conflict → --force(备份后覆盖)/--skip-all/--create-new/交互
```

`hashContent=sha256`,清单存 `template-hashes.json`。扫描 `.agent/skill` 与 `.claude/skills`(copy 副本计入,symlink 跳过)。这套机制保护用户对 skill 的自定义改动不被升级覆盖(harness.md §8 扩展安全网)。

---

## 8. Agent 接入:注册表 + per-agent configurator + 通用层

按你的要求回到 **Trellis 风格**(每个 `configurators/<agent>.ts` 一个配置器),并抽出通用配置层与生成方法。三层职责:

```text
注册表(数据)  registry.ts:AGENT_TOOLS —— 平台元数据单一源(派生 init flag/勾选/InitConfig)
配置器(行为)  configurators/<id>.ts:configure<Id>(ctx,tool) —— 只写本平台特有目录/格式
通用层(生成)  shared.ts:resolveSkills/writeSkills/linkSkills/copySkills/resolvePlaceholders
派发          index.ts:configureAgentPlatform(id, ctx)
```

设计原则(同 Trellis):**平台差异建模成注册表里的枚举字段(`templateContext`),公共生成逻辑全部下沉 shared,configurator 只表达「这个平台的目录布局/文件格式」。** 不用 OOP 基类,契约是隐式的函数类型 + 共用 shared helper。

### 8.1 AGENT_TOOLS 注册表(数据单一源)

```ts
// configurators/registry.ts
export interface AgentTool {
  id: string; name: string; configDir: string;        // '.codex' / '.claude'
  cliFlag: string; defaultChecked: boolean;            // init flag 与默认勾选
  skillTarget: string | null;                          // skill 适配目录;null=只用 .agent/skill
  skillDirs: string[];                                 // 该 agent 的 skill 发现目录(§8.6)
  supportsAgentSkills?: boolean;                       // 直接读共享 .agent/skill(Codex/Gemini)
  agentCapable?: boolean;                              // 是否支持隔离子 agent(harness §7.2)
  hooks?: { sessionStart?: string; registry: HookRegistry };
  templateContext: TemplateContext;                    // 占位符渲染上下文(枚举字段)
}
export interface TemplateContext { cmdRefPrefix: string; userActionLabel: 'Skills' | 'Slash commands'; cliFlag: string; }

export const AGENT_TOOLS: Record<string, AgentTool> = {
  codex:  { id:'codex', name:'Codex', configDir:'.codex', cliFlag:'codex',
            defaultChecked:true, skillTarget:null, supportsAgentSkills:true,
            hooks:{ sessionStart:'.codex/hooks/session-start.py', registry:'codex-hooks-json' },
            templateContext:{ cmdRefPrefix:'$', userActionLabel:'Skills', cliFlag:'codex' } },
  claude: { id:'claude', name:'Claude Code', configDir:'.claude', cliFlag:'claude',
            defaultChecked:true, skillTarget:'.claude/skills',
            hooks:{ registry:'claude-settings' },
            templateContext:{ cmdRefPrefix:'/tuteur:', userActionLabel:'Slash commands', cliFlag:'claude' } },
  gemini: { id:'gemini', name:'Gemini CLI', configDir:'.gemini', cliFlag:'gemini',
            defaultChecked:false, skillTarget:null, supportsAgentSkills:true,
            templateContext:{ cmdRefPrefix:'/tuteur:', userActionLabel:'Slash commands', cliFlag:'gemini' } },
};
```

init 的 agent flag、交互勾选、InitConfig 全从这张表派生(§4.1、core.md §8)。

### 8.2 per-agent configurator(行为)

每个 `configurators/<id>.ts` 导出 `configure<Id>(ctx, tool): Promise<ConfigureResult>`,只写平台特有目录/格式,公共动作调 shared:

```ts
// configurators/claude.ts
export async function configureClaude(ctx: ConfigureContext, tool: AgentTool): Promise<ConfigureResult> {
  const written: string[] = [];
  if (tool.skillTarget) {                              // skill:link 或 copy 到 .claude/skills
    ctx.skills === 'copy'
      ? copySkills({ ...ctx, target: tool.skillTarget })
      : linkSkills({ ...ctx, target: tool.skillTarget });
  }
  if (tool.hooks) registerHook(ctx, tool);             // hook:转发脚本 + 登记(§8.4)
  // TODO: slash commands 待 workflow command 契约稳定
  return { configured: true, writtenPaths: written };
}
// configurators/codex.ts —— supportsAgentSkills,skill 直接用 .agent/skill,只登记 hook
export async function configureCodex(ctx: ConfigureContext, tool: AgentTool): Promise<ConfigureResult> {
  if (tool.hooks) registerHook(ctx, tool);
  return { configured: true, writtenPaths: [] };
}
```

隐式契约:`type PlatformConfigurator = (ctx: ConfigureContext, tool: AgentTool) => Promise<ConfigureResult>`。派发:`index.ts` 的 `configureAgentPlatform(id, ctx) = configurators[id](ctx, AGENT_TOOLS[id])`。

### 8.3 通用层 shared.ts(生成方法)

所有 configurator 共用,保证 skill 渲染/写盘/软链/占位符一致:

```ts
resolveSkills(ctx: TemplateContext): { name; content }[];   // 读 common/skills/*,替换占位符
writeSkills(root, skills): string[];                        // 写盘(不覆盖同名)
linkSkills({ projectRoot, target }): string[];              // 软链 .agent/skill → target(Win 用 junction)
copySkills({ projectRoot, target }): string[];              // 复制独立副本
resolvePlaceholders(content, ctx): string;                  // {{PRODUCT_NAME}}/{{SKILL_NAME}}/{{CMD_REF_PREFIX}}/{{USER_ACTION_LABEL}}/{{CLI_FLAG}}
installCanonicalWorkflowSkills({ projectRoot }): string[];  // 装到 .agent/skill
```

占位符替换表(值由 `templateContext` 提供)见 harness.md §5.1。**关键不变量(Trellis 教训)**:init 写盘与 update collect 必须用**同一组** resolve helper,否则升级用户会丢文件。

### 8.4 Hook 登记与转发脚本

`registerHook(ctx, tool)` = 写一行转发脚本 + 按 `hooks.registry` 登记到平台声明文件:

| registry | 写入 | 格式 |
| --- | --- | --- |
| `codex-hooks-json` | `.codex/hooks.json` | `{ "hooks": { "sessionStart": "<entry>" } }` |
| `claude-settings` | `.claude/settings.json` | 合并 hooks 段 |
| `gemini-settings` | `.gemini/settings.json` | 合并 hooks 段 |

转发脚本(逻辑全在 `ttur hook`,harness.md §6.3):

```python
#!/usr/bin/env python3
import os, subprocess, sys
sys.exit(subprocess.run(["ttur", "hook", "session-start"], env=os.environ).returncode)
```

### 8.5 加一个新 agent 的步骤

1. `AGENT_TOOLS` 加一条(cliFlag/configDir/templateContext/hooks)。
2. 加 `configurators/<id>.ts` 写本平台特有布局(多数照抄 codex/claude 模式)。
3. 若 hook 登记是新格式,加一个 registry 适配器。

公共生成逻辑(skill 渲染/写盘/软链)零增量 —— 这就是「通用 agent 配置层 + 生成方法」。**全局模式不走 configurator**(core.md §2.3)。

### 8.6 Skill 发现(configurator + shared,项目+全局)

workflow 编排 skill,需列出本地所有 skill。注册表 `skillDirs` 声明各 agent 的 skill 目录,`shared.discoverSkills` 通用扫描**项目与全局两个 scope**:

```ts
// shared.ts
export function discoverSkills(scopes: Scope[]): DiscoveredSkill[] {
  const out: DiscoveredSkill[] = [];
  for (const scope of scopes) {                          // 项目 + 全局
    for (const tool of Object.values(AGENT_TOOLS))
      for (const dir of tool.skillDirs)
        for (const s of scanSkillDir(scope, dir))        // 解析 SKILL.md frontmatter
          out.push({ ...s, agent: tool.id, source: scope.kind });   // 带 source tag
    out.push(...scanCanonical(scope));                   // .agent/skill canonical
  }
  return dedupe(out);
}
```

`ttur skill list` 输出发现结果(name/agent/source);web 画布 skillRef 下拉用它、按 `agent`/`source` tag 分组(web §3.3)。目录结构特殊的 agent 可在自己的 configurator 覆盖 `scanSkillDir`。

---

## 9. 代码评价与 TODO

### 9.1 评价
- 约定式命令加载、哈希追踪更新、幂等写入:成熟,保留。
- **注册表 + per-agent configurator + shared 通用层**(Trellis 风格)兼顾「每平台一个文件可读」与「公共生成逻辑不重复」,呼应你的诉求 4。
- **InitConfig 统一模型** 让 CLI flag/交互/web 表单三种输入同源,初始化逻辑只有一份(诉求 1)。
- **依赖 core** 后,CLI 不再持有读盘逻辑,与 app 行为天然一致(诉求 2)。
- 现状缺口仍是:核心命令(task/complete/hook)未实现、无测试。

### 9.2 TODO

| # | 项 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| C1 | CLI 改依赖 `@tuteur/core`,删自有读盘/常量 | P0 | core K1-K7 |
| C2 | `task create/list/status/archive`(archive 移目录) | P0 | core store/§9 |
| C3 | `complete <node>`(调 core.completeNode,退出码 0/2) | P0 | core K4 |
| C4 | `hook <event>` 入口 + 转发脚本生成 | P0 | core context、harness §6 |
| C5 | 注册表(含 skillDirs/agentCapable)+ per-agent configurator + hook 适配器 | P0 | §8 |
| C6 | InitConfig 三输入(flag/交互/web)+ serializeToCommand | P0 | core §8 |
| C7 | `init --global`(只装模板+config+projects,不配 agent) | P1 | core §2.3 |
| C8 | `uninstall --global`、dashboard 多项目调整 | P1 | web §2/§7 |
| C9 | 给门禁/状态/归档/decision 写 Vitest | P0 | core K4 |
| C10 | `skill list`(discoverSkills,跨 agent+项目/全局,带 tag) | P1 | §8.6、core §5.1 |
| C11 | `workflow validate`(节点连通/skillRef/单入单出) | P2 | core resolveSkillRef |
| C12 | `task create --worktree`(调 core.createWorktree) | P1 | core K11 |

### 9.3 待确认
- agent flag 全集是否随注册表增长(每加平台一个 `--xxx`)?**推荐**:是,与 Trellis 一致;flag↔注册表用编译期断言锁一致性。
- `ttur run <node>` 是否进 MVP?**推荐**:进,仅 Codex 薄封装(adapter 见 harness.md §7)。
- 缺省 `--task`?**推荐**:单任务自动选,多任务要求显式,不引入"活跃任务"。
