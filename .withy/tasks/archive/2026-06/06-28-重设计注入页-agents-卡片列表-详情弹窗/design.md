# Design: 重设计注入页 agents:卡片列表 + 详情弹窗

## Summary

把 `AgentsPanel` 从「列表列 + 内联编辑区」改为「卡片列表 + 详情弹窗」。卡片列表占满内容区,弹窗复用看板 `TaskDocsModal` 的遮罩交互模式(不抽公共组件,镜像其结构),内部嵌可保存的 `MarkdownEditor` 与删除按钮。内层导航宽度由 180px 提到 230px 与知识库一致。服务端与 API 不动。

选这个方案因为:改动集中在前端单一文件夹,复用现有 API 与 `MarkdownEditor`,新增一个独立弹窗文件与 `TaskDocsModal` 形成一致的弹窗约定,信息密度和观感对齐知识库页。

## Architecture and Boundaries

- `InjectionManager.tsx`:仅把内层导航 `w-[180px]` → `w-[230px]`,其余不变。
- `AgentsPanel`(仍在 `InjectionManager.tsx` 内):去掉 220px 列表列,改为单列内容区渲染卡片网格;管理 `agents` 列表、`openName`(当前打开弹窗的角色名)、新建/刷新逻辑。
- 新增 `Context/AgentDetailModal.tsx`:独立弹窗组件,负责按角色名拉详情、编辑保存、删除。

边界:服务端读取层(`server/agents.ts`)、API 路由、`MarkdownEditor`、`TaskDocsModal` 均不改。

## Components

### AgentsPanel(改造)

- 输入:`project`、`initialAgents`。
- 状态:`agents`(列表)、`openName`(`string | null`,弹窗打开的角色)。
- 渲染:内容区为可滚动卡片网格 —— 首张「+ 新建角色」虚线卡片,其后每角色一张卡片。无角色时网格内显示空态文案 + 新建卡片。
- 行为:
  - 点角色卡片 → `setOpenName(name)`。
  - 新建 → 沿用现有 `window.prompt` 命名 + `PUT`,成功后 `refresh()` 并 `setOpenName(name)`。
  - `refresh()` 重取 `GET /api/agents` 更新 `agents`(保存/删除后由弹窗回调触发)。

### AgentCard(新,`AgentsPanel` 内的小组件)

- 输入:`agent: AgentSummaryView`、`onClick`。
- 渲染:角色名(粗体)+ 描述 `line-clamp-2`(无描述则留空)+ 底部投递态徽章行(复用 `DeliveryBadge`)。

### AgentDetailModal(新文件)

- 输入:`project`、`name`、`onClose()`、`onSaved()`、`onDeleted()`。
- 行为:挂载后按 `name` 拉 `GET /api/agents/:name` 取正文;Esc / 点遮罩 / ✕ 关闭。
- 内容:头部显示角色名 + canonical 路径 `.agents/agents/<name>.md` + 删除按钮;主体为 `MarkdownEditor`(`onSave` 走 `PUT`,成功后 `onSaved()`);删除走 `DELETE` + confirm,成功后 `onDeleted()`。
- 遮罩外壳镜像 `TaskDocsModal`:`fixed inset-0 z-50 ... bg-[color-mix(...)]`,内层 `stopPropagation`,Esc 监听。

## Data Flow and Contracts

- 列表:`GET /api/agents?project=` → `{ agents: AgentSummaryView[] }`。
- 详情:`GET /api/agents/:name?project=` → `{ ok, agent: AgentDetailView }`。
- 保存:`PUT /api/agents/:name?project=`,body `{ body }` → `{ ok }`;成功后 `AgentsPanel.refresh()`。
- 删除:`DELETE /api/agents/:name?project=` → `{ ok }`;成功后弹窗关闭 + `refresh()`。
- 不变量:`openName` 非空时才挂载弹窗;弹窗内详情按 `name` 派生,切换/关闭即丢弃。

## Error Handling and Edge Cases

- 详情拉取失败:弹窗主体显示加载失败文案(沿用 `TaskDocsModal` 的失败态思路)。
- 保存失败:`MarkdownEditor` 自身反馈(沿用现有 `onSave` 返回 boolean 的约定)。
- 删除走 `window.confirm`(沿用现有 `deleteRoleConfirm`)。
- 新建重名/失败:`window.alert` 提示(沿用现有逻辑)。
- 无角色:卡片网格仅显示空态文案 + 新建卡片。

## Compatibility and Migration

None。仅前端展示重排,数据契约与 API 不变;`AgentSummaryView.description` 已存在。

## Testing Strategy

- 静态:`pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/app` build。
- 手动(agent-browser):进注入页「子 agent」→ 新建角色 → 卡片出现并弹窗 → 编辑保存 → 重开校验内容 → 删除 → 卡片消失;校验导航宽度、描述两行截断、徽章显示、三种关闭方式。

## Risks and Rollback

- 风险:弹窗内 `MarkdownEditor`(Crepe)在弹窗容器内的高度/滚动表现需验证。缓解:弹窗主体用与 `TaskDocsModal` 一致的 `flex min-h-0 flex-1` 容器约束高度。
- 回滚:改动集中在 `InjectionManager.tsx` 与新增 `AgentDetailModal.tsx`,`git` 还原这两文件即可。
