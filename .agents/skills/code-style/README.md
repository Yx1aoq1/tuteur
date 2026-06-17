# code-style

统一代码风格（不改业务语义）的可复用技能安装与接入说明。

## 适用范围

- 导入/导出组织（含 `index.ts` / barrel）
- 注释与文档规范（含 JSDoc、`@example`、顶层说明、字段说明）
- 排版与空行可读性（声明段、控制块、对象成员分组）

## Default TS/JS Preset

- 当前 skill 自带一套 `default TS/JS preset`，适用于大多数 TypeScript / JavaScript 项目的风格统一任务。
- 这套 preset 保留了现有的机械规则，例如长度排序、命名分组、JSDoc / `@example` 约束。
- 这些规则是本 skill 的默认预设，不等同于所有项目都必须采用的行业标准。

## 安装

### 通用接入方式

将 `code-style/` 目录放入你的 Agent 运行时可发现的 skills 目录，并保留以下结构：

```text
<skill_root>/
  SKILL.md
  README.md
  references/
```

其中 `<skill_root>` 指向当前 skill 目录本身，例如 `/path/to/skills/code-style`。

### Meitu 内部安装方式

```bash
npx -y @meitu/skills add git@git.meitu.com:fex/internal-skills.git --skill code-style
```

使用 `npx @meitu/skills` 脚本前，需确保全局 `.npmrc` 包含以下配置：

```bash
npmrc="$HOME/.npmrc"; block=$'@meitu:registry=http://npm.meitu-int.com\nregistry=https://registry.npmmirror.com'; grep -Fqx "$block" "$npmrc" 2>/dev/null || printf '%s\n' "$block" >> "$npmrc"
```

详细配置说明参考 [`.npmrc` 配置说明](https://cf.meitu.com/confluence/x/XTuOEg)。

## 宿主接入

### 职责边界

- `SKILL.md` 与 `references/*`：
  - 负责规则层划分、执行流程、默认预设与检查清单。
- 宿主 `AGENTS.md` / `CLAUDE.md`：
  - 负责触发路由、执行责任，以及是否要求最终回报命中规则层和自检结果。
- 项目私有规范：
  - 负责框架、国际化、组件库、提交流程、Node / pnpm 版本等仓库专属约束。

### Required Host Config

将下面片段加入宿主项目的 style-routing 或 skill-routing 区块：

```md
### Code Style Skill

- 风格统一与可读性优化的请求（包括但不限于导入导出组织、注释规范、 JSDoc、`@example`、空行排版、对象成员分组空行）必须触发 `code-style` skill；即使用户未显式提及技能名，只要诉求本质是风格统一，也应触发。
- `code-style` skill 与其 `references/` 是代码风格细则的唯一真源。
- 纯空行与可读性排版请求默认只命中 `layout-readability`，不得自动升级成 `comment-doc`。
- 一旦命中某个规则层，该层内适用规则必须完整执行，不能因为“最小改动”跳过硬规则。
- 未明确要求语义重写时，`comment-doc` 默认执行“保守格式化 / 结构统一”，优先统一注释形态与结构，不主动扩大文案改写范围。
- 最终输出必须说明本次命中的规则层，以及按哪些规则完成了自检。

**技能路径**: `<skill_root>/SKILL.md`
```

### Optional Project Overlay

项目如需在默认 preset 之上叠加仓库专属要求，可在自己的 `AGENTS.md` / `CLAUDE.md` 追加补充，例如：

- 组件库或框架偏好
- 国际化、埋点、可访问性约束
- 提交流程、构建流程、运行时版本要求

这些内容属于项目 overlay，不应回写到通用 skill 本体。

## Default Preset References

- [SKILL.md](./SKILL.md): 分层入口、执行流程、强制执行与收尾方式
- [references/import-style.md](./references/import-style.md): `import` 默认 TS/JS 预设
- [references/export-style.md](./references/export-style.md): `export/barrel` 默认 TS/JS 预设
- [references/comment-style.md](./references/comment-style.md): `comment-doc` 默认 TS/JS 预设
- [references/layout-readability.md](./references/layout-readability.md): `layout-readability` 默认 TS/JS 预设
- [references/checklist.md](./references/checklist.md): 收尾检查清单

## 不应放入通用 Skill 的内容

- 项目专属技术栈约束，例如 Ant Design、Tailwind、Zustand、next-intl 等
- 仓库工作流政策，例如“禁止主动创建文档文件”
- 项目构建、部署、提交命令与版本锁定要求

## 路径写法建议

- 推荐：`<skill_root>/SKILL.md`（可移植，跨不同 Agent 目录兼容）
- 不推荐：将路径写死为 `.agents/skills/...`、`.codex/skills/...` 等单一运行时目录

## 说明

- 本 README 只描述安装、宿主接入与职责边界，不重复展开 `references/*.md` 全文。
- 运行时入口请查看 `SKILL.md`；具体规则按需读取对应 `references/` 文档。
