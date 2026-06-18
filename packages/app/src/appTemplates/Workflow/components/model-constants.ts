// 画布与右侧面板共享的常量(单独成文件,避免 'use client' 组件互相牵连)。

// 从右侧列表拖拽到画布的载荷 MIME(payload 为 JSON,见 model.ts 的 DragPayload)
export const DRAG_MIME = 'application/withy-drag';

// switch 节点每条分支的出口连接点 id 前缀:`b:<branchIndex>`(连线由此回写 branch.next)
export const BRANCH_HANDLE_PREFIX = 'b:';
