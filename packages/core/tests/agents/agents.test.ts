import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverAgents, resolveAgentRef, agentExists } from '../../src/agents/agents.js';
import type { Scope } from '../../src/paths.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-agents-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

function writeAgent(root: string, rel: string, name: string, description: string): string {
  const dir = resolve(root, rel);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${name}.md`);
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`);
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
