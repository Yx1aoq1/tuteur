import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { taskPath, type Scope } from './paths.js';
import { listTaskArtifacts, readImplementation } from './store.js';
import { implementationProgress } from './task.js';
import { writeTextFile, writeJsonFile } from './utils/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-task-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('markdown implementation plan', () => {
  it('returns empty progress when implement.md is absent', () => {
    expect(implementationProgress(createScope(), 'task-1')).toEqual({ done: 0, total: 0, unparsed: 0 });
  });

  it('parses checkbox bullets and reports other bullet lines', () => {
    const scope = createScope();
    writeTextFile(
      taskPath(scope, 'task-1', 'implement.md'),
      [
        '# Implementation Plan',
        '- [ ] first',
        '  * [X] nested done',
        '- plain bullet',
        '+ [x] final',
        'paragraph',
      ].join('\n'),
    );

    expect(readImplementation(scope, 'task-1')).toEqual({
      items: [
        { id: 'line-2', text: 'first', done: false },
        { id: 'line-3', text: 'nested done', done: true },
        { id: 'line-5', text: 'final', done: true },
      ],
      unparsed: 1,
    });
    expect(implementationProgress(scope, 'task-1')).toEqual({ done: 2, total: 3, unparsed: 1 });
  });

  it('counts malformed checkbox bullets as unparsed instead of silently dropping them', () => {
    const scope = createScope();
    writeTextFile(taskPath(scope, 'task-1', 'implement.md'), '- [maybe] unclear\n- [ ]\n');

    expect(implementationProgress(scope, 'task-1')).toEqual({ done: 0, total: 0, unparsed: 2 });
  });
});

describe('listTaskArtifacts', () => {
  it('returns an empty list when the task directory has no documents', () => {
    expect(listTaskArtifacts(createScope(), 'task-1')).toEqual([]);
  });

  it('lists non-empty markdown documents, sorted, excluding runtime state and empty files', () => {
    const scope = createScope();
    writeTextFile(taskPath(scope, 'task-1', 'design.md'), '# Design\n');
    writeTextFile(taskPath(scope, 'task-1', 'prd.md'), '# PRD\n');
    writeTextFile(taskPath(scope, 'task-1', 'empty.md'), '');
    writeJsonFile(taskPath(scope, 'task-1', 'task.json'), { id: 'task-1' });
    writeTextFile(taskPath(scope, 'task-1', 'events.jsonl'), '{}\n');

    expect(listTaskArtifacts(scope, 'task-1')).toEqual(['design.md', 'prd.md']);
  });
});
