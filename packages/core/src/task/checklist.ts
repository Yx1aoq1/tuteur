import { type Scope } from '../paths.js';
import { type ChecklistItem } from '../types.js';
import { readChecklistOrEmpty, writeChecklist, appendEvent } from '../store/index.js';
import { nowIso } from '../utils/index.js';

// ── Checklist mutations (command-managed implementation plan — §4) ────────────
// Domain logic over checklist.json: monotonic id allocation, done/undone with a
// `checkpoint` milestone event on each fresh completion (idempotent), edit/remove.
// Carry-disk stays in store/checklist.ts; this module never touches fs directly.

export interface ChecklistEntry {
  text: string;
  verify?: string;
}

/** Append items, allocating a stable monotonic id per item. Returns the added items. */
export function addChecklistItems(scope: Scope, taskId: string, entries: ChecklistEntry[]): ChecklistItem[] {
  const checklist = readChecklistOrEmpty(scope, taskId);
  const added: ChecklistItem[] = entries.map(entry => {
    const id = String(checklist.nextId);
    checklist.nextId += 1;
    return { id, text: entry.text, verify: entry.verify, done: false };
  });

  checklist.items.push(...added);
  writeChecklist(scope, taskId, checklist);
  return added;
}

/**
 * Flip the `done` flag for the given ids. When `done` is true, each id that
 * transitions false→true appends a `checkpoint` event (idempotent: an already-done
 * id changes nothing). Throws listing any unknown ids.
 * @return The items whose `done` flag actually changed.
 */
export function markChecklist(scope: Scope, taskId: string, ids: string[], done: boolean): ChecklistItem[] {
  const checklist = readChecklistOrEmpty(scope, taskId);
  assertKnown(checklist.items, ids);

  const changed: ChecklistItem[] = [];
  for (const id of ids) {
    const item = checklist.items.find(i => i.id === id);
    if (item && item.done !== done) {
      item.done = done;
      changed.push(item);
    }
  }

  writeChecklist(scope, taskId, checklist);
  if (done) {
    for (const item of changed) {
      appendEvent(scope, taskId, { ts: nowIso(), type: 'checkpoint', id: item.id, text: item.text });
    }
  }
  return changed;
}

/** Edit an item's text (and optional verify). Throws when the id is unknown. */
export function editChecklistItem(scope: Scope, taskId: string, id: string, patch: ChecklistEntry): ChecklistItem {
  const checklist = readChecklistOrEmpty(scope, taskId);
  const item = checklist.items.find(i => i.id === id);
  if (!item) throw new Error(`unknown checklist id: ${id}`);

  item.text = patch.text;
  item.verify = patch.verify;
  writeChecklist(scope, taskId, checklist);
  return item;
}

/** Remove items by id (ids are never reused). Throws listing any unknown ids. */
export function removeChecklistItems(scope: Scope, taskId: string, ids: string[]): void {
  const checklist = readChecklistOrEmpty(scope, taskId);
  assertKnown(checklist.items, ids);

  const drop = new Set(ids);
  checklist.items = checklist.items.filter(item => !drop.has(item.id));
  writeChecklist(scope, taskId, checklist);
}

// Reject unknown ids up front — bad ids must surface, never silently no-op (§4).
function assertKnown(items: ChecklistItem[], ids: string[]): void {
  const known = new Set(items.map(item => item.id));
  const missing = ids.filter(id => !known.has(id));
  if (missing.length > 0) throw new Error(`unknown checklist id(s): ${missing.join(', ')}`);
}
