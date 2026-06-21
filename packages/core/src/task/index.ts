// Task module barrel — lifecycle + derived metrics around the workflow state
// machine. Explicit named re-exports only (no `export *`, CLAUDE.md).

export {
  countConsecutiveFailures,
  resolveCurrentTask,
  implementationProgress,
  archiveTask,
  isStuck,
} from './service.js';
export type { ArchiveOptions, CurrentTask } from './service.js';

export { removeChecklistItems, editChecklistItem, addChecklistItems, markChecklist } from './checklist.js';
export type { ChecklistEntry } from './checklist.js';
