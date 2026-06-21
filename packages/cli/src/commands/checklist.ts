import { readFileSync } from 'node:fs';
import {
  removeChecklistItems,
  editChecklistItem,
  addChecklistItems,
  readChecklist,
  markChecklist,
  type ChecklistEntry,
} from '@withy/core';
import type { Command } from 'commander';
import { emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface TaskOption {
  task?: string;
}

interface AddOptions extends TaskOption {
  verify?: string;
}

// `withy checklist` — command-managed implementation plan (checklist.json). dev's
// step contract: the agent holds current items + ids in hand, `add --json` returns
// the allocated id immediately, so `list` is only for reconnect re-alignment.
export default function registerChecklistCommand(program: Command): void {
  const checklist = program.command('checklist').description('Manage the implementation plan (checklist.json)');

  checklist
    .command('add [text]')
    .description('Add a step (or pipe a JSON array of {text,verify?} on stdin for batch)')
    .option('--verify <cmd>', 'Verification command for this step')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runAdd);

  checklist
    .command('done <ids...>')
    .description('Mark step(s) done — appends a checkpoint per newly-completed id')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action((ids: string[], options: TaskOption) => runMark(ids, options, true));

  checklist
    .command('undone <ids...>')
    .description('Mark step(s) not done (no event)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action((ids: string[], options: TaskOption) => runMark(ids, options, false));

  checklist
    .command('edit <id> <text>')
    .description('Edit a step’s text (and optional --verify)')
    .option('--verify <cmd>', 'Verification command for this step')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runEdit);

  checklist
    .command('remove <ids...>')
    .description('Remove step(s) by id (ids are never reused, no event)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runRemove);

  checklist
    .command('list')
    .description('List all steps (for reconnect re-alignment)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runList);
}

function runAdd(text: string | undefined, options: AddOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);

  const entries = text === undefined ? readBatchFromStdin() : [{ text, verify: options.verify }];
  if (entries.length === 0) emit({ ok: false, error: 'no checklist entries provided' }, 1);

  try {
    const added = addChecklistItems(scope, taskId, entries);
    emit({ ok: true, task: taskId, ids: added.map(item => item.id), items: added });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}

function runMark(ids: string[], options: TaskOption, done: boolean): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    const changed = markChecklist(scope, taskId, ids, done);
    emit({ ok: true, task: taskId, done, changed: changed.map(item => item.id) });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}

function runEdit(id: string, text: string, options: AddOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    const item = editChecklistItem(scope, taskId, id, { text, verify: options.verify });
    emit({ ok: true, task: taskId, item });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}

function runRemove(ids: string[], options: TaskOption): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    removeChecklistItems(scope, taskId, ids);
    emit({ ok: true, task: taskId, removed: ids });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}

function runList(options: TaskOption): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const checklist = readChecklist(scope, taskId);
  emit({ ok: true, task: taskId, items: checklist?.items ?? [] });
}

// Batch add reads a JSON array of {text, verify?} from stdin. Refuses an interactive
// TTY (no piped input) rather than blocking; malformed JSON is a typed error.
function readBatchFromStdin(): ChecklistEntry[] {
  if (process.stdin.isTTY) emit({ ok: false, error: 'provide a step text or pipe a JSON array on stdin' }, 1);

  let raw: string;
  try {
    raw = readFileSync(0, 'utf8').trim();
  } catch {
    emit({ ok: false, error: 'failed to read stdin' }, 1);
  }
  if (!raw) emit({ ok: false, error: 'empty stdin — expected a JSON array of {text,verify?}' }, 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    emit({ ok: false, error: 'invalid JSON on stdin — expected an array of {text,verify?}' }, 1);
  }
  if (!Array.isArray(parsed)) emit({ ok: false, error: 'stdin must be a JSON array of {text,verify?}' }, 1);

  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { text?: unknown }).text !== 'string') {
      emit({ ok: false, error: `stdin item ${index} missing string "text"` }, 1);
    }
    const item = entry as { text: string; verify?: unknown };
    return { text: item.text, verify: typeof item.verify === 'string' ? item.verify : undefined };
  });
}
