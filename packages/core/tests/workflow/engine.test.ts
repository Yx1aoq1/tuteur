import { describe, expect, it } from 'vitest';
import { initialCursor, nodeOf, rewind, send } from '../../src/workflow/engine.js';
import type { Cursor, MachineDef } from '../../src/workflow/engine.js';

// A synthetic, non-Withy machine: a(guarded) → b(branch) → c → end.
//   a: single guarded `go` edge (also default).
//   b: branch point — `left` (default) → c, `right` → terminal.
//   c: single `go` edge → terminal.
const DEF: MachineDef = {
  initial: 'a',
  nodes: [
    { id: 'a', transitions: [{ on: 'go', target: 'b', guard: 'ga', default: true }] },
    {
      id: 'b',
      transitions: [
        { on: 'left', target: 'c', default: true },
        { on: 'right', target: null },
      ],
    },
    { id: 'c', transitions: [{ on: 'go', target: null, default: true }] },
  ],
};

const at = (current: string | null, visited: string[] = []): Cursor => ({ current, visited });

describe('engine.send', () => {
  it('returns done when the cursor is terminal', () => {
    expect(send(DEF, at(null), 'go')).toEqual({ status: 'done' });
  });

  it('moves and records the left-behind state when the guard passes', () => {
    const r = send(DEF, at('a'), 'go', { ga: { ok: true } });
    expect(r).toMatchObject({ status: 'moved', from: 'a', target: 'b' });
    if (r.status === 'moved') expect(r.cursor).toEqual({ current: 'b', visited: ['a'] });
  });

  it('blocks (cursor unchanged) when the guard fails', () => {
    const r = send(DEF, at('a'), 'go', { ga: { ok: false, reasons: ['nope'] } });
    expect(r).toEqual({ status: 'blocked', from: 'a', reasons: ['nope'] });
  });

  it('treats a guard absent from the report as a pass', () => {
    expect(send(DEF, at('a'), 'go', {}).status).toBe('moved');
  });

  it('is unhandled when no transition matches the event', () => {
    const r = send(DEF, at('b'), 'nope');
    expect(r.status).toBe('unhandled');
    if (r.status === 'unhandled') expect(r.transitions.map(t => t.on)).toEqual(['left', 'right']);
  });

  it('follows a chosen branch to a terminal target', () => {
    const r = send(DEF, at('b'), 'right');
    expect(r).toMatchObject({ status: 'moved', target: null });
  });

  it('forced send takes the default edge and ignores guards', () => {
    const r = send(DEF, at('a'), 'irrelevant', { ga: { ok: false, reasons: ['x'] } }, { forced: true });
    expect(r).toMatchObject({ status: 'moved', target: 'b' }); // guard bypassed
  });

  it('does not duplicate an already-visited state', () => {
    const r = send(DEF, at('a', ['a']), 'go', { ga: { ok: true } });
    if (r.status === 'moved') expect(r.cursor.visited).toEqual(['a']);
  });
});

describe('engine.rewind', () => {
  it('drops the target and everything visited after it', () => {
    expect(rewind(DEF, at('c', ['a', 'b']), 'a')).toEqual({ current: 'a', visited: [] });
    expect(rewind(DEF, at('c', ['a', 'b']), 'b')).toEqual({ current: 'b', visited: ['a'] });
  });

  it('throws on an unknown target state', () => {
    expect(() => rewind(DEF, at('c', ['a', 'b']), 'ghost')).toThrow(/unknown state/);
  });
});

describe('engine helpers', () => {
  it('initialCursor starts at the initial state', () => {
    expect(initialCursor(DEF)).toEqual({ current: 'a', visited: [] });
  });

  it('nodeOf resolves ids and tolerates null', () => {
    expect(nodeOf(DEF, 'b')?.id).toBe('b');
    expect(nodeOf(DEF, null)).toBeUndefined();
  });
});
