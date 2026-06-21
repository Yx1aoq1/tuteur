# Knowledge log

## [2026-06-19] ingest | 迁移 docs/ + .claude/references/ 进 wiki(分级归档) (wiki: product/prd; design/{core,cli,harness,harness-flow,knowledge-base,web,visual-design,decisions}; guides/frontend/{nextjs-architecture,react-patterns}; 去重: 旧 INDEX 的导航地图与概念速查未迁,独有的决策/状态/优先级提炼为 design/decisions; index 重算 5 级, lint 0/0)

## [2026-06-19] update | 据 packages/cli 代码核对并更新已落地状态 (cli: C2 task start建/聚焦合一+assign删→✅、C11 workflow validate命令删→✅; decisions 状态矩阵: withy task行去 create/assign、withy next ❌→✅、complete🗑️已删、nextNode门禁✅; harness: 落地状态/§9评价/H3/H3a/H8/H11 complete→next 迁移与 approve 当前节点均标✅)

## [2026-06-20] ingest | Milkdown/Crepe 双链序列化陷阱与自研插件 (wiki: guides/frontend/milkdown-wikilink; 反链自 react-patterns; index 重算, lint 0/0)

## [2026-06-20] ingest | 测试组织与构建配置约定 (wiki: guides/testing-build-conventions; 反链自 core; tests/ 镜像 src + vitest include + tsconfig rootDir 仅 build 两坑; index 重算, lint 0/0)

## [2026-06-20] update | 推进引导与进度可见性轮 (decisions: 加 2026-06-20 评审轮 + 状态矩阵 hook 行标 UserPromptSubmit 无任务提醒落地; harness: §6.4 skill 节点 Next-Action 改「先 task status 再跑 skill」、§6.5 UserPromptSubmit 落地注记、H12 P2→🟡; testing-build-conventions: §5 Prettier 忽略 .withy/ 与 *.md; index 重算, lint 0/0)

## [2026-06-21] ingest | 任务时间线/门禁扩展/进度源 (wiki: design/task-event-timeline + design/node-gate-checkers; 反链自 harness §2; 含事件 safeParse 前向兼容、会话回填两侧 session-id 契约、时间线本地tz+严格升序+prompt就地折叠、note 新鲜度 floor、progress 独立 checker、checklist 唯一进度源、浅拷贝共享数组坑; index 重算, lint 0/0)

## [2026-06-21] update | 把 cli/core 参考页对齐新命令与门禁(漂移修复) (cli: §2 总览加 note/checklist 行、hook 改 session-start/user-prompt-submit、退出码加 note/progress;§3.1 加 note/checklist/hook 行、task status 富返回、删 implement.md 兜底注;§3.3 implement.md→checklist.json 命令托管。core: §4.3.1 gate 加 note/progress、§4.4 events 加 task_created/note/prompt/checkpoint/snapshot+safeParse 前向兼容、§4.7 implement.md→checklist.json 唯一进度源、§5 Store API 换 readProgress+checklist 变更族+sessions 回填+recordNote、§6 gate 五 checker、§9.2 归档校验改 readProgress、§4.3 示例 gate 与 K14 同步。两设计页补 [[cli]] 反链; index 重算, lint 0/0)
