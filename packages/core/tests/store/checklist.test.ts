import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writeChecklist, readChecklist, readProgress } from '../../src/store/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-checklist-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('checklist store + readProgress', () => {
  it('round-trips checklist.json', () => {
    const scope = createScope();
    writeChecklist(scope, 't', {
      nextId: 3,
      items: [
        { id: '1', text: 'a', done: true },
        { id: '2', text: 'b', done: false },
      ],
    });
    expect(readChecklist(scope, 't')?.items.length).toBe(2);
  });

  it('returns null when checklist.json is absent', () => {
    expect(readChecklist(createScope(), 't')).toBeNull();
  });

  it('reads progress from checklist.json', () => {
    const scope = createScope();
    writeChecklist(scope, 't', {
      nextId: 3,
      items: [
        { id: '1', text: 'one', done: true },
        { id: '2', text: 'two', done: false },
      ],
    });
    const progress = readProgress(scope, 't');
    expect(progress.source).toBe('checklist');
    expect(progress).toMatchObject({ done: 1, total: 2 });
    expect(progress.items.map(i => i.id)).toEqual(['1', '2']);
  });

  it('an empty-items checklist is authoritative (0/0, source=checklist)', () => {
    const scope = createScope();
    writeChecklist(scope, 't', { nextId: 1, items: [] });
    expect(readProgress(scope, 't')).toMatchObject({ source: 'checklist', done: 0, total: 0 });
  });

  it('reports source=none when no checklist.json exists', () => {
    expect(readProgress(createScope(), 't')).toMatchObject({ source: 'none', done: 0, total: 0 });
  });
});
