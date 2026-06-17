// 服务端读取层:dashboard 的所有 .tuteur 读取都经此处调用 @tuteur/core,浏览器不碰 fs。
// 仅在 Server Component / route handler 中导入(模块会拉入 node:fs)。

import {
  DASHBOARD_PROJECT_ROOT_ENV,
  resolveProjectScope,
  resolveGlobalScope,
  readGitStatus,
  readChecklist,
  readDeveloper,
  readWorkflow,
  readProjects,
  readState,
  listTasks,
  nodeById,
  phaseOf,
  isStuck,
} from '@tuteur/core';
import type { Scope, Task, TaskStatus } from '@tuteur/core';
import type { BoardCard, BoardColumn, BoardData, Identity, Phase, ProjectCard } from '@/types/dashboard';

// 任务状态 → 看板列;cancelled 属归档,不上板
const COLUMN_BY_STATUS: Record<TaskStatus, BoardColumn | null> = {
  planning: 'todo',
  in_progress: 'doing',
  completed: 'done',
  cancelled: null,
};

/**
 * 解析本次请求作用的项目 scope。
 * @param project 前端传入的项目根路径(?project=);缺省时回退默认项目。
 */
export function resolveScopeForRequest(project?: string): Scope | null {
  if (project) return resolveProjectScope(project);
  return getDefaultProjectScope();
}

// 默认项目:环境变量优先,其次注册表里第一个可解析的项目
export function getDefaultProjectScope(): Scope | null {
  const fromEnv = process.env[DASHBOARD_PROJECT_ROOT_ENV];
  if (fromEnv) {
    const scope = resolveProjectScope(fromEnv);
    if (scope) return scope;
  }
  for (const project of readProjects(resolveGlobalScope()).projects) {
    const scope = resolveProjectScope(project.path);
    if (scope) return scope;
  }
  return null;
}

// 已登记项目列表(含 git 分支与任务计数),供侧栏渲染
export function getProjects(): ProjectCard[] {
  return readProjects(resolveGlobalScope()).projects.map(project => {
    const git = readGitStatus(project.path);
    const scope = resolveProjectScope(project.path);
    let taskCount = 0;
    if (scope) {
      try {
        taskCount = listTasks(scope).filter(task => task.status !== 'cancelled').length;
      } catch {
        taskCount = 0;
      }
    }

    return {
      path: project.path,
      name: project.name,
      branch: git.isRepo ? git.branch : null,
      dirty: git.dirtyCount,
      taskCount,
    };
  });
}

// 本地身份(全局优先,回退默认项目)
export function getIdentity(): Identity | null {
  const global = readDeveloper(resolveGlobalScope());
  if (global) return { name: global.name, slug: global.slug };
  const scope = getDefaultProjectScope();
  const dev = scope ? readDeveloper(scope) : null;
  return dev ? { name: dev.name, slug: dev.slug } : null;
}

// 看板视图模型:按列分组 + 每卡的阶段/节点/卡住/清单 + 是否归当前身份(mine 标记供客户端过滤)
export function getBoard(scope: Scope, identity: Identity | null): BoardData {
  const columns: Record<BoardColumn, BoardCard[]> = { todo: [], doing: [], done: [] };

  for (const task of listTasks(scope)) {
    const column = COLUMN_BY_STATUS[task.status];
    if (!column) continue;
    columns[column].push(toCard(scope, task, column, identity));
  }

  const counts: Record<BoardColumn, number> = {
    todo: columns.todo.length,
    doing: columns.doing.length,
    done: columns.done.length,
  };

  return { columns, counts, total: counts.todo + counts.doing + counts.done };
}

function isOwnedBy(task: Task, identity: Identity): boolean {
  return (
    task.creator === identity.name ||
    task.creator === identity.slug ||
    task.assignee === identity.name ||
    task.assignee === identity.slug
  );
}

// 单卡视图模型;state/workflow/checklist 读取均容错,缺失时降级而非抛出
function toCard(scope: Scope, task: Task, column: BoardColumn, identity: Identity | null): BoardCard {
  let phase: Phase | null = null;
  let node: string | null = null;
  let stuck = false;

  try {
    const state = readState(scope, task.id);
    node = state.currentNode;
    if (node) {
      try {
        const workflow = readWorkflow(scope, task.workflow);
        phase = phaseOf(workflow, node) as Phase | null;
        // 仅在节点存在时计算卡住,避免无意义的 git/事件读取
        if (nodeById(workflow, node)) stuck = isStuck(scope, task.id, node);
      } catch {
        phase = null;
      }
    }
  } catch {
    node = null;
  }

  let checklist: BoardCard['checklist'] = { done: 0, total: 0, items: [] };
  try {
    const items = readChecklist(scope, task.id).items.map(item => ({
      id: item.id,
      text: item.text,
      done: item.done,
      node: item.node,
    }));
    checklist = { done: items.filter(item => item.done).length, total: items.length, items };
  } catch {
    checklist = { done: 0, total: 0, items: [] };
  }

  return {
    id: task.id,
    title: task.title,
    owner: task.assignee || task.creator,
    mine: identity ? isOwnedBy(task, identity) : false,
    column,
    phase,
    node,
    stuck,
    checklist,
  };
}
