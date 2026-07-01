import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  seedDispatchShell,
  isDispatchCurated,
  dispatchBlock,
  hasAgentNode,
  routeAgent,
} from '../../src/workflow/dispatch.js';
import { readDispatch, writeDispatch } from '../../src/store/dispatch.js';
import type { Scope } from '../../src/paths.js';
import type { SkillNode, Workflow } from '../../src/types.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-dispatch-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

function writeAgentRole(scope: Scope, name: string, engine?: string): void {
  const dir = resolve(scope.root, '.agents/agents');
  mkdirSync(dir, { recursive: true });
  const engineLine = engine !== undefined ? `engine: ${engine}\n` : '';
  writeFileSync(resolve(dir, `${name}.md`), `---\nname: ${name}\n${engineLine}---\n\nbody\n`);
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

describe('routeAgent', () => {
  it('is native when engine is omitted, regardless of currentPlatform', () => {
    expect(routeAgent({}, 'claude')).toEqual({ mode: 'native' });
    expect(routeAgent({}, 'codex')).toEqual({ mode: 'native' });
    expect(routeAgent({}, 'opencode')).toEqual({ mode: 'native' });
    expect(routeAgent({}, null)).toEqual({ mode: 'native' });
  });

  it('is native when engine matches the current platform', () => {
    expect(routeAgent({ engine: 'claude' }, 'claude')).toEqual({ mode: 'native' });
    expect(routeAgent({ engine: 'codex' }, 'codex')).toEqual({ mode: 'native' });
    expect(routeAgent({ engine: 'opencode' }, 'opencode')).toEqual({ mode: 'native' });
  });

  it('is cross when engine differs from a known current platform, naming the target', () => {
    expect(routeAgent({ engine: 'codex' }, 'claude')).toEqual({ mode: 'cross', engine: 'codex' });
    expect(routeAgent({ engine: 'opencode' }, 'codex')).toEqual({ mode: 'cross', engine: 'opencode' });
    expect(routeAgent({ engine: 'claude' }, 'opencode')).toEqual({ mode: 'cross', engine: 'claude' });
  });

  it('is cross when currentPlatform is unknown (null) and engine is set', () => {
    expect(routeAgent({ engine: 'codex' }, null)).toEqual({ mode: 'cross', engine: 'codex' });
  });

  it('does not validate engine against known platforms — an unrecognized value still routes cross', () => {
    expect(routeAgent({ engine: 'foo' }, 'claude')).toEqual({ mode: 'cross', engine: 'foo' });
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
    expect(block).toMatchObject({ role: 'implement', curated: false, mode: 'native' });
    expect(block?.engine).toBeUndefined();
    expect(block?.activeTask).toContain('tasks/t/');
    expect(block?.action).toContain('implement');
    expect(readDispatch(scope, 't')).not.toBeNull(); // shell was lazily seeded
  });

  it('returns undefined when the node has no agent', () => {
    const scope = createScope();
    const node = noAgent.nodes[0] as SkillNode;
    expect(dispatchBlock(scope, 't', noAgent, node)).toBeUndefined();
  });

  it('is native, unchanged action text, when the role matches the current platform', () => {
    const scope = createScope();
    writeAgentRole(scope, 'implement', 'claude');
    const node = withAgent.nodes[0] as SkillNode;
    const block = dispatchBlock(scope, 't', withAgent, node, { CLAUDE_CODE_SESSION_ID: 'sid' });
    expect(block).toMatchObject({ mode: 'native' });
    expect(block?.engine).toBeUndefined();
    expect(block?.action).toContain('Dispatch the `implement` subagent');
  });

  it('is cross, with an honest action, when the role names a different engine', () => {
    const scope = createScope();
    writeAgentRole(scope, 'implement', 'codex');
    const node = withAgent.nodes[0] as SkillNode;
    const block = dispatchBlock(scope, 't', withAgent, node, { CLAUDE_CODE_SESSION_ID: 'sid' });
    expect(block).toMatchObject({ mode: 'cross', engine: 'codex' });
    expect(block?.action).toContain('`codex`');
    expect(block?.action).toContain("isn't implemented yet");
  });

  it('is cross when the current platform can’t be detected and the role names an engine', () => {
    const scope = createScope();
    writeAgentRole(scope, 'implement', 'codex');
    const node = withAgent.nodes[0] as SkillNode;
    const block = dispatchBlock(scope, 't', withAgent, node, {});
    expect(block).toMatchObject({ mode: 'cross', engine: 'codex' });
  });
});
