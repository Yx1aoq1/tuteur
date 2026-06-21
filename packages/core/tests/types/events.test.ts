import { describe, expect, it } from 'vitest';
import { TaskEventSchema } from '../../src/types.js';

// New event variants must parse, and session_start must stay back-compatible
// (snapshot optional → old rows with no snapshot still parse).
describe('TaskEvent schema — new variants', () => {
  it('parses task_created / note / prompt / checkpoint', () => {
    const events = [
      { ts: '2026-06-21T00:00:00.000Z', type: 'task_created', by: 'y' },
      { ts: '2026-06-21T00:01:00.000Z', type: 'note', node: 'dev', summary: 'did the thing', by: 'y' },
      { ts: '2026-06-21T00:02:00.000Z', type: 'prompt', text: 'do x' },
      { ts: '2026-06-21T00:03:00.000Z', type: 'checkpoint', id: '3', text: 'step three' },
    ];
    for (const event of events) {
      expect(TaskEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it('parses session_start with and without snapshot', () => {
    const withSnapshot = { ts: '2026-06-21T00:00:00.000Z', type: 'session_start', injected: ['a'], snapshot: 'text' };
    const legacy = { ts: '2026-06-21T00:00:00.000Z', type: 'session_start', injected: ['a'] };
    expect(TaskEventSchema.safeParse(withSnapshot).success).toBe(true);
    expect(TaskEventSchema.safeParse(legacy).success).toBe(true);
  });

  it('rejects a note missing its summary', () => {
    const bad = { ts: '2026-06-21T00:00:00.000Z', type: 'note', node: 'dev' };
    expect(TaskEventSchema.safeParse(bad).success).toBe(false);
  });
});
