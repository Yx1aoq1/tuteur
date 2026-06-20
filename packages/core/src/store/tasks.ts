import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Scope, archiveDir, taskPath, tasksDir } from '../paths.js';
import { type Task, TaskSchema } from '../types.js';
import { writeJsonFile } from '../utils/index.js';
import { readValidated } from './errors.js';

// 归档后任务目录会移入 archive/YYYY-MM/<id>/(task/service.ts archiveTask)。按 id 读取时优先 live
// 路径,缺失则回退遍历归档桶,让 web 等只读消费方能按 id 读到已归档任务的 task/state/implement/events。
// 写入始终用 live taskPath —— 不回退,杜绝往归档任务写盘。其它 store 文件(state/events/meta)共用此解析。
export function taskReadPath(scope: Scope, id: string, rel: string): string {
  const live = taskPath(scope, id, rel);
  if (existsSync(live)) return live;

  const archive = archiveDir(scope);
  if (existsSync(archive)) {
    for (const bucket of readdirSync(archive, { withFileTypes: true })) {
      if (!bucket.isDirectory()) continue;
      const candidate = resolve(archive, bucket.name, id, rel);
      if (existsSync(candidate)) return candidate;
    }
  }

  return live; // 都不存在:返回 live 路径,交由调用方按缺失处理(校验读抛错、可选读返回默认)
}

export function readTask(scope: Scope, id: string): Task {
  return readValidated(taskReadPath(scope, id, 'task.json'), TaskSchema, 'task.json');
}

export function writeTask(scope: Scope, task: Task): void {
  writeJsonFile(taskPath(scope, task.id, 'task.json'), task);
}

export function taskExists(scope: Scope, id: string): boolean {
  return existsSync(taskPath(scope, id, 'task.json'));
}

export interface ListTasksOptions {
  includeArchived?: boolean;
}

export function listTasks(scope: Scope, options: ListTasksOptions = {}): Task[] {
  const tasks: Task[] = [];
  const root = tasksDir(scope);
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      if (existsSync(resolve(root, entry.name, 'task.json'))) tasks.push(readTask(scope, entry.name));
    }
  }
  if (options.includeArchived) {
    const archive = archiveDir(scope);
    if (existsSync(archive)) {
      for (const bucket of readdirSync(archive, { withFileTypes: true })) {
        if (!bucket.isDirectory()) continue;
        const bucketDir = resolve(archive, bucket.name);
        for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const file = resolve(bucketDir, entry.name, 'task.json');
          if (existsSync(file)) tasks.push(readValidated(file, TaskSchema, 'task.json'));
        }
      }
    }
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}
