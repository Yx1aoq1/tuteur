import { existsSync } from 'node:fs';
import { EVENT_REASON_MAX } from '../constants.js';
import { type Scope, taskPath } from '../paths.js';
import { type TaskEvent, TaskEventSchema } from '../types.js';
import { appendJsonlLine, readTextFile } from '../utils/index.js';
import { taskReadPath } from './tasks.js';

// ── Events (append-only, single-process; no lock — core.md §4.4) ─────────────

export function appendEvent(scope: Scope, taskId: string, event: TaskEvent): void {
  appendJsonlLine(taskPath(scope, taskId, 'events.jsonl'), truncateReason(event));
}

export function readEvents(scope: Scope, taskId: string): TaskEvent[] {
  const file = taskReadPath(scope, taskId, 'events.jsonl');
  if (!existsSync(file)) return [];
  const events: TaskEvent[] = [];
  for (const line of readTextFile(file).split('\n')) {
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
