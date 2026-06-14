import { appendFileSync, readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';
import { EVENT_REASON_MAX } from './constants.js';
import {
  type Scope,
  currentTaskPointerPath,
  workflowPath,
  archiveDir,
  runtimeDir,
  taskPath,
  tasksDir,
} from './paths.js';
import {
  type ContextConfig,
  type Developer,
  type TaskEvent,
  type Workflow,
  type State,
  type Task,
  ContextConfigSchema,
  DeveloperSchema,
  TaskEventSchema,
  WorkflowSchema,
  StateSchema,
  TaskSchema,
} from './types.js';
import { nowIso, readJsonFile, writeJsonFile } from './utils/index.js';

/** Raised when a `.tuteur/` file is missing or fails schema validation. */
export class StoreError extends Error {}

function readValidated<S extends z.ZodTypeAny>(path: string, schema: S, label: string): z.output<S> {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    throw new StoreError(`${label}: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StoreError(
      `${label} failed validation: ${path}\n  ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  }
  return parsed.data;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export function readTask(scope: Scope, id: string): Task {
  return readValidated(taskPath(scope, id, 'task.json'), TaskSchema, 'task.json');
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

// ── State ──────────────────────────────────────────────────────────────────

export function readState(scope: Scope, id: string): State {
  return readValidated(taskPath(scope, id, 'state.json'), StateSchema, 'state.json');
}

export function writeState(scope: Scope, state: State): void {
  writeJsonFile(taskPath(scope, state.taskId, 'state.json'), state);
}

// ── Workflow ─────────────────────────────────────────────────────────────────

export function readWorkflow(scope: Scope, id: string): Workflow {
  return readValidated(workflowPath(scope, id), WorkflowSchema, `workflow ${id}`);
}

// ── Events (append-only, single-process; no lock — core.md §4.4) ─────────────

export function appendEvent(scope: Scope, taskId: string, event: TaskEvent): void {
  const file = taskPath(scope, taskId, 'events.jsonl');
  mkdirSync(resolve(file, '..'), { recursive: true });
  appendFileSync(file, `${JSON.stringify(truncateReason(event))}\n`, 'utf8');
}

export function readEvents(scope: Scope, taskId: string): TaskEvent[] {
  const file = taskPath(scope, taskId, 'events.jsonl');
  if (!existsSync(file)) return [];
  const events: TaskEvent[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = TaskEventSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) events.push(parsed.data); // tolerate stray lines in the log
    } catch {
      // skip malformed event line — the timeline should survive one bad row
    }
  }
  return events;
}

function truncateReason(event: TaskEvent): TaskEvent {
  if ('reason' in event && typeof event.reason === 'string' && event.reason.length > EVENT_REASON_MAX) {
    return { ...event, reason: `${event.reason.slice(0, EVENT_REASON_MAX)}…` };
  }
  return event;
}

// ── Approvals (stored inside state.json — gate input) ────────────────────────

export function isApproved(scope: Scope, taskId: string, node: string): boolean {
  return Boolean(readState(scope, taskId).approvals[node]);
}

// ── Context config ───────────────────────────────────────────────────────────

export function readContextConfig(scope: Scope): ContextConfig {
  const file = resolve(scope.tuteurDir, 'context.json');
  if (!existsSync(file)) return ContextConfigSchema.parse({});
  return readValidated(file, ContextConfigSchema, 'context.json');
}

// ── Developer identity ───────────────────────────────────────────────────────

export function readDeveloper(scope: Scope): Developer | null {
  const file = resolve(scope.tuteurDir, '.developer');
  if (!existsSync(file)) return null;
  return readValidated(file, DeveloperSchema, '.developer');
}

// ── Current-task pointer (runtime/current-task.json) ─────────────────────────

export function readCurrentTaskPointer(scope: Scope): string | null {
  const file = currentTaskPointerPath(scope);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { taskId?: unknown };
    return typeof raw.taskId === 'string' ? raw.taskId : null;
  } catch {
    return null;
  }
}

export function writeCurrentTaskPointer(scope: Scope, taskId: string): void {
  mkdirSync(runtimeDir(scope), { recursive: true });
  writeJsonFile(currentTaskPointerPath(scope), { taskId, updatedAt: nowIso() });
}

export function clearCurrentTaskPointer(scope: Scope): void {
  const file = currentTaskPointerPath(scope);
  if (existsSync(file)) rmSync(file);
}
