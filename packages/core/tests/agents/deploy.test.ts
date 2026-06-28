import { mkdirSync, writeFileSync, lstatSync, readlinkSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAgentDeliveryStatus, removeAgentDelivery, deployAgents } from '../../src/agents/deploy.js';
import type { Scope } from '../../src/paths.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-deploy-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

function writeCanonical(root: string, name: string, description: string, body: string): void {
  const dir = resolve(root, '.agents/agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${name}.md`), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
}

// Mark a tool as "set up" so deploy targets it (it gates on configDir existence).
function setupTool(root: string, configDir: string): void {
  mkdirSync(resolve(root, configDir), { recursive: true });
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('deployAgents', () => {
  it('symlinks markdown (Claude) and generates toml (Codex) from the canonical', () => {
    const scope = createScope();
    writeCanonical(scope.root, 'review', 'review role', 'Review the change.');
    setupTool(scope.root, '.claude');
    setupTool(scope.root, '.codex');

    const written = deployAgents(scope);
    expect(written).toEqual(expect.arrayContaining(['.claude/agents/review.md', '.codex/agents/review.toml']));

    const claudeLink = resolve(scope.root, '.claude/agents/review.md');
    expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claudeLink)).toBe('../../.agents/agents/review.md');

    const toml = readFileSync(resolve(scope.root, '.codex/agents/review.toml'), 'utf8');
    expect(toml).toContain('name = "review"');
    expect(toml).toContain('description = "review role"');
    expect(toml).toContain('developer_instructions = """');
    expect(toml).toContain('Review the change.');
  });

  it('skips a tool whose config dir is absent', () => {
    const scope = createScope();
    writeCanonical(scope.root, 'review', 'r', 'b');
    setupTool(scope.root, '.claude'); // codex not set up

    const written = deployAgents(scope);
    expect(written).toEqual(['.claude/agents/review.md']);
  });

  it('is idempotent — a second deploy writes nothing', () => {
    const scope = createScope();
    writeCanonical(scope.root, 'review', 'r', 'b');
    setupTool(scope.root, '.claude');
    setupTool(scope.root, '.codex');

    deployAgents(scope);
    expect(deployAgents(scope)).toEqual([]);
  });

  it('regenerates toml when the canonical changes (stale → fresh)', () => {
    const scope = createScope();
    writeCanonical(scope.root, 'review', 'r', 'old body');
    setupTool(scope.root, '.codex');
    deployAgents(scope);

    writeCanonical(scope.root, 'review', 'r', 'new body');
    expect(deployAgents(scope)).toEqual(['.codex/agents/review.toml']);
    expect(readFileSync(resolve(scope.root, '.codex/agents/review.toml'), 'utf8')).toContain('new body');
  });
});

describe('getAgentDeliveryStatus / removeAgentDelivery', () => {
  it('reports linked/generated when current and missing when absent', () => {
    const scope = createScope();
    writeCanonical(scope.root, 'review', 'r', 'b');
    setupTool(scope.root, '.claude');
    setupTool(scope.root, '.codex');
    deployAgents(scope);

    const status = getAgentDeliveryStatus(scope, 'review');
    expect(status.find(s => s.platform === 'claude')?.state).toBe('linked');
    expect(status.find(s => s.platform === 'codex')?.state).toBe('generated');

    removeAgentDelivery(scope, 'review');
    const after = getAgentDeliveryStatus(scope, 'review');
    expect(after.every(s => s.state === 'missing')).toBe(true);
  });
});
