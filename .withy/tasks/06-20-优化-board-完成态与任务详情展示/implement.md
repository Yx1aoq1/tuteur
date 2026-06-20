# Implementation Plan

- [x] 调整已完成卡片的边框、色条和选中 ring 配色 — Verify: 浏览器计算样式为 teal
- [x] 将实施步骤收入默认关闭的原生折叠面板，进度条保持外置 — Verify: 折叠状态和进度均正确
- [x] 保留详情栏纵向滚动，禁止横向溢出且不在折叠面板内建立滚动区 — Verify: 外层宽度无溢出，折叠面板 `overflow-y` 为 visible
- [x] 将旧 `implement.md` 中两条说明性普通列表改为段落 — Verify: `unparsed` 为 0
- [x] 运行定向格式化、typecheck、lint、app test/build 与 agent-browser 验收 — Verify: 全部通过
