// 服务端读取层:任务产物(planning md)的只读读取,经 @withy/core,浏览器不碰 fs。
// 仅在 Server Component / route handler 中导入(模块会拉入 node:fs)。

import { listTaskArtifacts, readTaskArtifact } from '@withy/core';
import type { Scope } from '@withy/core';
import type { TaskDocView } from '@/types/dashboard';

/**
 * 任务产物清单:任务目录下非空的 .md 文件名(prd/design/implement 等;含归档回退)。
 * 详情面板选中任务时按需调用,避免每张卡 readdir。
 * @param scope 项目 scope
 * @param id 任务 id
 */
export function getTaskDocs(scope: Scope, id: string): string[] {
  return listTaskArtifacts(scope, id);
}

/**
 * 单个任务产物的只读视图:文件名 + 正文。name 非法由 core 抛错(API 兜 400);
 * 文件不存在返回 null(API 回 doc:null)。
 * @param scope 项目 scope
 * @param id 任务 id
 * @param name 产物文件名(安全 .md basename)
 * @return 产物视图,或文件不存在时 null
 */
export function getTaskDoc(scope: Scope, id: string, name: string): TaskDocView | null {
  const body = readTaskArtifact(scope, id, name);
  return body === null ? null : { name, body };
}
