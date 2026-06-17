// 项目级文件监听 → SSE 的服务端枢纽。仅在 route handler(node runtime)使用。
// 一个项目一个 chokidar 实例,多浏览器订阅共享;无订阅者时自动关闭,只 watch 前台项目。

import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { resolveProjectScope } from '@tuteur/core';

type Subscriber = () => void;

interface ProjectWatch {
  watcher: FSWatcher;
  subscribers: Set<Subscriber>;
  timer: ReturnType<typeof setTimeout> | null;
}

// 跨 dev 热重载复用同一注册表,避免重复监听句柄泄漏。
const registry: Map<string, ProjectWatch> =
  ((globalThis as Record<string, unknown>).__tuteurWatchers as Map<string, ProjectWatch>) ?? new Map();
(globalThis as Record<string, unknown>).__tuteurWatchers = registry;

const DEBOUNCE_MS = 200;

/**
 * 订阅某项目 .tuteur 目录的变化;返回取消订阅函数。
 * 变化经 ~200ms 去抖后回调一次(只通知「有变更」,具体 taskId 由前端整体 revalidate)。
 * @param projectPath 项目根路径(?project= 传入);无法解析为有效 scope 时不订阅,返回空操作。
 * @param onChange 去抖后的变更回调。
 */
export function subscribeProject(projectPath: string, onChange: Subscriber): () => void {
  const scope = resolveProjectScope(projectPath);
  if (!scope) return () => {};

  const key = scope.tuteurDir;
  let entry = registry.get(key);
  if (!entry) {
    const watcher = watch(key, {
      ignoreInitial: true,
      depth: 4,
      ignored: (path: string) => path.includes(`${key}/tasks/archive`),
    });
    const created: ProjectWatch = { watcher, subscribers: new Set(), timer: null };
    watcher.on('all', () => notify(created));
    registry.set(key, created);
    entry = created;
  }

  entry.subscribers.add(onChange);

  return () => {
    const current = registry.get(key);
    if (!current) return;
    current.subscribers.delete(onChange);
    if (current.subscribers.size === 0) {
      if (current.timer) clearTimeout(current.timer);
      void current.watcher.close();
      registry.delete(key);
    }
  };
}

// 去抖后通知该项目当前所有订阅者。
function notify(entry: ProjectWatch): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    for (const subscriber of entry.subscribers) subscriber();
  }, DEBOUNCE_MS);
}
