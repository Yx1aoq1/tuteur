import { describe, expect, it } from 'vitest';
import { hasFreshNote } from '../../src/workflow/runtime.js';
import type { TaskEvent } from '../../src/types.js';

// Crafted event streams with explicit timestamps — the freshness floor is the latest
// of (last rewind to the node, last successful completion of the node).
describe('hasFreshNote', () => {
  it('first entry: any note for the node counts (no floor)', () => {
    const events: TaskEvent[] = [{ ts: '01', type: 'note', node: 'dev', summary: 's' }];
    expect(hasFreshNote(events, 'dev')).toBe(true);
  });

  it('no note for the node → false', () => {
    const events: TaskEvent[] = [{ ts: '01', type: 'note', node: 'check', summary: 's' }];
    expect(hasFreshNote(events, 'dev')).toBe(false);
  });

  it('a note older than the last completion is stale (re-traversal)', () => {
    const events: TaskEvent[] = [
      { ts: '01', type: 'note', node: 'dev', summary: 'round 1' },
      { ts: '02', type: 'complete_attempt', node: 'dev', ok: true },
    ];
    // back on dev (e.g. via a rewind-to-ancestor) with only the round-1 note → stale
    expect(hasFreshNote(events, 'dev')).toBe(false);
  });

  it('a note after the last completion is fresh again', () => {
    const events: TaskEvent[] = [
      { ts: '01', type: 'note', node: 'dev', summary: 'round 1' },
      { ts: '02', type: 'complete_attempt', node: 'dev', ok: true },
      { ts: '03', type: 'note', node: 'dev', summary: 'round 2' },
    ];
    expect(hasFreshNote(events, 'dev')).toBe(true);
  });

  it('rewind to the node invalidates a pre-rewind note', () => {
    const events: TaskEvent[] = [
      { ts: '01', type: 'note', node: 'dev', summary: 's' },
      { ts: '02', type: 'rewind', node: 'dev' },
    ];
    expect(hasFreshNote(events, 'dev')).toBe(false);
  });

  it('a failed completion does not raise the floor', () => {
    const events: TaskEvent[] = [
      { ts: '01', type: 'complete_attempt', node: 'dev', ok: false },
      { ts: '02', type: 'note', node: 'dev', summary: 's' },
      { ts: '03', type: 'complete_attempt', node: 'dev', ok: false },
    ];
    expect(hasFreshNote(events, 'dev')).toBe(true);
  });
});
