// 看板/侧栏的视图模型类型。纯类型、无 @tuteur/core 依赖,供服务端读取层与客户端组件共享
// (客户端组件不可 import @tuteur/core —— 会把 node:fs 带进浏览器包)。

export type BoardColumn = 'todo' | 'doing' | 'done';

// 主体阶段,对齐 core 的 PHASE_* 字面值
export type Phase = 'planning' | 'execute' | 'finish';

// 验收项视图模型(对齐 core ChecklistItem 的可展示字段)
export interface ChecklistItemView {
  id: string;
  text: string;
  done: boolean;
  node?: string;
}

// 看板卡:一条任务在看板上的展示所需
export interface BoardCard {
  id: string;
  title: string;
  owner: string;
  mine: boolean; // 是否归当前身份(创建者/负责人匹配),供「我的/全部」过滤
  column: BoardColumn;
  phase: Phase | null;
  node: string | null;
  stuck: boolean;
  checklist: { done: number; total: number; items: ChecklistItemView[] };
}

export interface BoardData {
  columns: Record<BoardColumn, BoardCard[]>;
  counts: Record<BoardColumn, number>;
  total: number;
}

// 侧栏项目卡
export interface ProjectCard {
  path: string;
  name: string;
  branch: string | null; // 非 git 仓库为 null,不展示分支
  dirty: number;
  taskCount: number;
}

export interface Identity {
  name: string;
  slug: string;
}

export type TaskFilter = 'mine' | 'all';
