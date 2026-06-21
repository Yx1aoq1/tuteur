import { existsSync } from 'node:fs';
import { type Scope, taskPath } from '../paths.js';
import { type Checklist, type ProgressView, ChecklistSchema } from '../types.js';
import { writeJsonFile } from '../utils/index.js';
import { taskReadPath } from './tasks.js';
import { readValidated } from './errors.js';

// ── Checklist (tasks/<id>/checklist.json) — command-managed implementation plan ──
// The sole implementation-progress source: it replaced implement.md (existing tasks
// were migrated). `readProgress` feeds the archive gate, the dashboard, and the
// planning progress gate. core.md §4.7.

const EMPTY_CHECKLIST = (): Checklist => ({ nextId: 1, items: [] });

/** Read a task's checklist.json (archive fallback). Returns null when the file is absent. */
export function readChecklist(scope: Scope, taskId: string): Checklist | null {
  const file = taskReadPath(scope, taskId, 'checklist.json');
  if (!existsSync(file)) return null;
  return readValidated(file, ChecklistSchema, 'checklist.json');
}

/** Write a task's checklist.json (live dir only — never writes into the archive). */
export function writeChecklist(scope: Scope, taskId: string, checklist: Checklist): void {
  writeJsonFile(taskPath(scope, taskId, 'checklist.json'), checklist);
}

/** Read-or-init a checklist for command mutation; missing file yields a fresh empty plan. */
export function readChecklistOrEmpty(scope: Scope, taskId: string): Checklist {
  return readChecklist(scope, taskId) ?? EMPTY_CHECKLIST();
}

/**
 * Unified implementation progress from checklist.json. A present file is authoritative
 * (even with zero items → 0/0); a missing file yields source 'none'. Feeds the archive
 * gate, dashboard counts, and the detail item list.
 */
export function readProgress(scope: Scope, taskId: string): ProgressView {
  const checklist = readChecklist(scope, taskId);
  if (!checklist) return { source: 'none', items: [], done: 0, total: 0 };

  const items = checklist.items.map(item => ({ id: item.id, text: item.text, done: item.done }));
  return { source: 'checklist', items, done: items.filter(item => item.done).length, total: items.length };
}
