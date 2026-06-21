import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { readChecklist, readEvents } from '../../src/store/index.js';
import { removeChecklistItems, editChecklistItem, addChecklistItems, markChecklist } from '../../src/task/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-cl-svc-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function checkpoints(scope: Scope, id: string): string[] {
  return readEvents(scope, id)
    .filter(event => event.type === 'checkpoint')
    .map(event => (event as { id: string }).id);
}

describe('checklist service', () => {
  it('allocates stable monotonic ids that never repeat after removal', () => {
    const scope = createScope();
    const first = addChecklistItems(scope, 't', [{ text: 'a' }, { text: 'b' }]);
    expect(first.map(i => i.id)).toEqual(['1', '2']);

    removeChecklistItems(scope, 't', ['1']);
    const next = addChecklistItems(scope, 't', [{ text: 'c' }]);
    expect(next[0].id).toBe('3'); // nextId kept advancing; '1' is never reused
  });

  it('done appends a checkpoint per freshly-completed id and is idempotent', () => {
    const scope = createScope();
    addChecklistItems(scope, 't', [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);

    markChecklist(scope, 't', ['1', '3'], true);
    expect(checkpoints(scope, 't')).toEqual(['1', '3']);

    // re-doing already-done ids changes nothing and appends no duplicate checkpoint
    const changed = markChecklist(scope, 't', ['1', '3'], true);
    expect(changed).toEqual([]);
    expect(checkpoints(scope, 't')).toEqual(['1', '3']);
  });

  it('undone records no event; re-doing logs a fresh checkpoint', () => {
    const scope = createScope();
    addChecklistItems(scope, 't', [{ text: 'a' }]);
    markChecklist(scope, 't', ['1'], true);
    markChecklist(scope, 't', ['1'], false); // undone — no event
    expect(checkpoints(scope, 't')).toEqual(['1']);

    markChecklist(scope, 't', ['1'], true); // re-completion logs again
    expect(checkpoints(scope, 't')).toEqual(['1', '1']);
  });

  it('edit updates text/verify; remove deletes', () => {
    const scope = createScope();
    addChecklistItems(scope, 't', [{ text: 'a' }, { text: 'b' }]);
    editChecklistItem(scope, 't', '1', { text: 'a2', verify: 'pnpm test' });
    expect(readChecklist(scope, 't')?.items.find(i => i.id === '1')).toMatchObject({ text: 'a2', verify: 'pnpm test' });

    removeChecklistItems(scope, 't', ['2']);
    expect(readChecklist(scope, 't')?.items.map(i => i.id)).toEqual(['1']);
  });

  it('throws on unknown ids for mark/edit/remove', () => {
    const scope = createScope();
    addChecklistItems(scope, 't', [{ text: 'a' }]);
    expect(() => markChecklist(scope, 't', ['9'], true)).toThrow(/unknown checklist id/);
    expect(() => editChecklistItem(scope, 't', '9', { text: 'x' })).toThrow(/unknown checklist id/);
    expect(() => removeChecklistItems(scope, 't', ['9'])).toThrow(/unknown checklist id/);
  });
});
