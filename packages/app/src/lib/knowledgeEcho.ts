// 本地知识库写入的回声抑制共享信号(模块级单例)。
// 保存/CRUD 成功后打戳;RealtimeRefresher 收到 task-updated 时,若在抑制窗口内则跳过 router.refresh(),
// 避免本地写盘触发的 SSE 把正在编辑的编辑器重挂、丢字(design 横切 + R3)。

// 抑制窗口:覆盖 watcher ~200ms 去抖 + 结构操作的多次 index 写入串。
export const ECHO_SUPPRESS_MS = 2000;

let lastLocalWriteAt = 0;

/** 本地写盘成功后打戳。 */
export function markLocalWrite(): void {
  lastLocalWriteAt = Date.now();
}

/** 距上次本地写盘是否仍在抑制窗口内(true = 应跳过此次外部刷新)。 */
export function withinEchoWindow(): boolean {
  return Date.now() - lastLocalWriteAt < ECHO_SUPPRESS_MS;
}
