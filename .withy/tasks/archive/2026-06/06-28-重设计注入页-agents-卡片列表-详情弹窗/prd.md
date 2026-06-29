# 重设计注入页 agents:卡片列表 + 详情弹窗

## Goal

注入页的「子 agent」标签当前是「内层导航 + 220px 角色列表列 + 编辑区」三栏，视觉拥挤、空白大。改成卡片列表展示角色,点击卡片才弹出弹窗编辑 md,让信息密度和观感对齐知识库页。

## Confirmed Facts

- 当前实现集中在 `packages/app/src/appTemplates/Context/InjectionManager.tsx`:`AgentsPanel` 有独立 `w-[220px]` 角色列表列,选中后右侧用可保存的 `MarkdownEditor` 编辑(`InjectionManager.tsx:181-235`)。
- 内层导航(上下文/子 agent)宽 `w-[180px]`(`InjectionManager.tsx:25`);知识库文件列表列宽 `w-[230px]`(`Knowledge/components/FileTree.tsx:90`)。
- `AgentSummaryView` 已含 `description?` 与 `delivery[]`,无需改服务端(`packages/app/src/types/agents.ts:15-20`)。
- 看板产物弹窗 `Board/components/TaskDocsModal.tsx` 是独立文件,走 `fixed inset-0` 遮罩 + Esc + 点背景关闭 + 右上 ✕ 的只读三栏模式。
- 角色增删改 API 已具备:`PUT/DELETE /api/agents/:name`、列表 `GET /api/agents`、详情 `GET /api/agents/:name`(现有 `AgentsPanel` 已调用)。
- `line-clamp-2` 在仓库已有先例(`Workflow/components/CanvasPanel.tsx:122`);i18n 为 en/zh 两套。

## Requirements

- 「子 agent」标签去掉 `w-[220px]` 角色列表列,角色改为内容区的卡片列表。
- 内层导航宽度对齐知识库文件列表(约 230px)。
- 每张卡片展示:角色名、描述(两行,超出省略)、各工具投递态徽章。
- 提供「新建角色」入口(卡片或按钮),沿用现有命名 prompt 流程。
- 点击角色卡片弹出弹窗,复用看板产物弹窗的遮罩交互(Esc / 点背景 / ✕ 关闭)。
- 弹窗内 md 内容可编辑并保存(沿用 `MarkdownEditor` + `PUT /api/agents/:name`),保存后刷新列表。
- 弹窗内保留删除角色;删除后关闭弹窗并刷新列表。
- 无角色时显示空态提示 + 新建入口。
- 「上下文」标签行为不变。

## Acceptance Criteria

- [ ] 「子 agent」标签内容区呈现卡片列表,页面上不再有独立的 220px 角色列表列。
- [ ] 内层导航(上下文/子 agent)宽度为 230px。
- [ ] 每张卡片同时显示角色名、两行截断描述、投递态徽章;描述超两行显示省略号。
- [ ] 点击卡片弹出弹窗;按 Esc、点遮罩背景、点右上 ✕ 任一方式都能关闭。
- [ ] 弹窗内编辑 md 并保存后,接口返回成功,关闭/重开后内容为新值,列表卡片描述随之更新。
- [ ] 弹窗内点删除并确认后,该角色从列表消失,弹窗关闭。
- [ ] 点「新建角色」走命名 prompt,创建成功后角色出现在卡片列表并打开其弹窗。
- [ ] 无角色时显示空态文案与新建入口,不报错。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/app` build 均通过。

## Out of Scope

- 不重构 `TaskDocsModal`,不抽公共 Modal 外壳(仅镜像其交互模式)。
- 不改 agents 服务端读取层与 API。
- 不改「上下文」标签的编辑逻辑。
- 不新增投递/同步相关功能。

## Open Questions

- None.
