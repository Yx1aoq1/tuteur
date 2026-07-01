import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  enginePlatformAvailable,
  resolveAgentEngine,
  resolveAgentRef,
  discoverAgents,
  agentExists,
} from '../../src/agents/agents.js';
import type { Scope } from '../../src/paths.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-agents-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

function writeAgent(root: string, rel: string, name: string, description: string, engine?: string): string {
  const dir = resolve(root, rel);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${name}.md`);
  const engineLine = engine !== undefined ? `engine: ${engine}\n` : '';
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n${engineLine}---\n\nbody\n`);
  return file;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('discoverAgents', () => {
  it('scans canonical .agents/agents/*.md and dedupes the Claude symlink by role name', () => {
    const scope = createScope();
    const canonical = writeAgent(scope.root, '.agents/agents', 'review', 'review role');
    writeAgent(scope.root, '.agents/agents', 'implement', 'implement role');

    // Claude delivery: file-level symlink to the canonical — must dedupe by name.
    mkdirSync(resolve(scope.root, '.claude/agents'), { recursive: true });
    symlinkSync(canonical, resolve(scope.root, '.claude/agents/review.md'));

    const found = discoverAgents(scope);
    expect(found.map(a => a.name)).toEqual(['implement', 'review']);
    const review = found.find(a => a.name === 'review')!;
    expect(review.description).toBe('review role');
    expect(review.paths.length).toBe(2); // canonical + claude symlink, deduped to one role
  });

  it('returns nothing when no agent dirs exist', () => {
    expect(discoverAgents(createScope())).toEqual([]);
  });

  it('parses an optional engine field, leaving it undefined when absent', () => {
    const scope = createScope();
    writeAgent(scope.root, '.agents/agents', 'review', 'review role', 'codex');
    writeAgent(scope.root, '.agents/agents', 'implement', 'implement role');

    const found = discoverAgents(scope);
    expect(found.find(a => a.name === 'review')?.engine).toBe('codex');
    expect(found.find(a => a.name === 'implement')?.engine).toBeUndefined();
  });

  it('does not reject an illegal engine value at scan time (validate handles it)', () => {
    const scope = createScope();
    writeAgent(scope.root, '.agents/agents', 'ghost-engine', 'role', 'foo');
    expect(discoverAgents(scope).find(a => a.name === 'ghost-engine')?.engine).toBe('foo');
  });
});

describe('resolveAgentEngine', () => {
  it('returns the declared engine for a resolvable role', () => {
    const scope = createScope();
    writeAgent(scope.root, '.agents/agents', 'review', 'review role', 'codex');
    expect(resolveAgentEngine(scope, 'review')).toBe('codex');
  });

  it('returns undefined when the role declares no engine', () => {
    const scope = createScope();
    writeAgent(scope.root, '.agents/agents', 'implement', 'implement role');
    expect(resolveAgentEngine(scope, 'implement')).toBeUndefined();
  });

  it('returns undefined for a role that does not resolve', () => {
    expect(resolveAgentEngine(createScope(), 'ghost')).toBeUndefined();
  });

  it('normalizes a whitespace-only engine value to undefined', () => {
    const scope = createScope();
    const dir = resolve(scope.root, '.agents/agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'blank-engine.md'), '---\nname: blank-engine\nengine:   \n---\n\nbody\n');
    expect(resolveAgentEngine(scope, 'blank-engine')).toBeUndefined();
  });
});

describe('resolveAgentRef / agentExists', () => {
  it('resolves a canonical role and reports existence', () => {
    const scope = createScope();
    writeAgent(scope.root, '.agents/agents', 'research', 'research role');
    expect(resolveAgentRef(scope, 'research').name).toBe('research');
    expect(agentExists(scope, 'research')).toBe(true);
  });

  it('throws / returns false for a dangling role', () => {
    const scope = createScope();
    expect(() => resolveAgentRef(scope, 'ghost')).toThrow(/not found/);
    expect(agentExists(scope, 'ghost')).toBe(false);
  });
});

describe('enginePlatformAvailable', () => {
  it('is false for an unregistered platform id', () => {
    expect(enginePlatformAvailable(createScope(), 'foo')).toBe(false);
  });

  it('is false for a registered platform whose configDir is absent (not set up)', () => {
    expect(enginePlatformAvailable(createScope(), 'claude')).toBe(false);
  });

  it('is true for a registered platform whose configDir is present (set up)', () => {
    const scope = createScope();
    mkdirSync(resolve(scope.root, '.claude'), { recursive: true });
    expect(enginePlatformAvailable(scope, 'claude')).toBe(true);
  });
});
