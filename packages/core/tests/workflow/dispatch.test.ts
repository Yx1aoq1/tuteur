import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { seedDispatchShell, isDispatchCurated, dispatchBlock, hasAgentNode } from '../../src/workflow/dispatch.js';
import { readDispatch, writeDispatch } from '../../src/store/dispatch.js';
import type { Scope } from '../../src/paths.js';
import type { SkillNode, Workflow } from '../../src/types.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-dispatch-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const withAgent: Workflow = {
  id: 'wf',
  entry: 'dev',
  phases: [{ id: 'execute' }],
  nodes: [{ id: 'dev', type: 'skill', skill: 'withy-dev', agent: 'implement', phase: 'execute', next: null }],
};

const noAgent: Workflow = {
  id: 'wf',
  entry: 'dev',
  phases: [{ id: 'execute' }],
  nodes: [{ id: 'dev', type: 'skill', skill: 'withy-dev', phase: 'execute', next: null }],
};

describe('hasAgentNode', () => {
  it('detects whether any skill node declares an agent', () => {
    expect(hasAgentNode(withAgent)).toBe(true);
    expect(hasAgentNode(noAgent)).toBe(false);
  });
});

describe('seedDispatchShell', () => {
  it('seeds a `_help`-only shell when the workflow has an agent node', () => {
    const scope = createScope();
    expect(seedDispatchShell(scope, 't', withAgent)).toBe(true);
    const cfg = readDispatch(scope, 't');
    expect(cfg?.read).toEqual([]);
    expect(cfg?._help).toBeTruthy();
  });

  it('does not seed when no node declares an agent', () => {
    const scope = createScope();
    expect(seedDispatchShell(scope, 't', noAgent)).toBe(false);
    expect(readDispatch(scope, 't')).toBeNull();
  });

  it('is idempotent — a second seed is a no-op', () => {
    const scope = createScope();
    seedDispatchShell(scope, 't', withAgent);
    writeDispatch(scope, 't', { read: [{ id: 'core', description: 'core design' }], _help: 'h' });
    expect(seedDispatchShell(scope, 't', withAgent)).toBe(false); // file exists → skip
    expect(readDispatch(scope, 't')?.read.length).toBe(1); // curated entry preserved
  });
});

describe('isDispatchCurated', () => {
  it('is false for a shell and true once a real entry exists', () => {
    const scope = createScope();
    seedDispatchShell(scope, 't', withAgent);
    expect(isDispatchCurated(scope, 't')).toBe(false);
    writeDispatch(scope, 't', { read: [{ artifact: 'design.md', description: 'design gist' }] });
    expect(isDispatchCurated(scope, 't')).toBe(true);
  });
});

describe('dispatchBlock', () => {
  it('builds a block for a node with an agent and lazily seeds the shell', () => {
    const scope = createScope();
    const node = withAgent.nodes[0] as SkillNode;
    const block = dispatchBlock(scope, 't', withAgent, node);
    expect(block).toMatchObject({ role: 'implement', curated: false });
    expect(block?.activeTask).toContain('tasks/t/');
    expect(block?.action).toContain('implement');
    expect(readDispatch(scope, 't')).not.toBeNull(); // shell was lazily seeded
  });

  it('returns undefined when the node has no agent', () => {
    const scope = createScope();
    const node = noAgent.nodes[0] as SkillNode;
    expect(dispatchBlock(scope, 't', noAgent, node)).toBeUndefined();
  });
});
