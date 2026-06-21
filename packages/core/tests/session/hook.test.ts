import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { renderSessionStart } from '../../src/session/hook.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-session-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('renderSessionStart snapshot', () => {
  it('returns a snapshot equal to the (short) injection text and a null task', () => {
    const result = renderSessionStart(createScope());
    expect(result.taskId).toBeNull();
    expect(result.snapshot.length).toBeGreaterThan(0);
    expect(result.snapshot).toBe(result.text); // short text is not truncated
  });
});
