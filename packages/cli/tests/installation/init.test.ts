import { readlinkSync, readdirSync, existsSync, mkdtempSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject } from '../../src/installation/init.js';

const temporaryRoots: string[] = [];

process.env.WITHY_QUIET = '1';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('initProject agent skills', () => {
  it('creates canonical copies and Claude links without creating legacy agent directories', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-init-'));
    temporaryRoots.push(root);

    const result = await initProject({
      projectRoot: root,
      agents: ['codex', 'claude'],
      skillAdapterMode: 'symlink',
      user: 'tester',
    });

    const canonicalRoot = resolve(root, '.agents/skills');
    const claudeRoot = resolve(root, '.claude/skills');
    const skillNames = readdirSync(canonicalRoot).filter(name => name.startsWith('withy-'));

    expect(result.installedAgents).toEqual(['codex', 'claude']);
    expect(existsSync(resolve(root, '.agent'))).toBe(false);
    expect(existsSync(resolve(root, '.gemini'))).toBe(false);
    expect(skillNames.length).toBe(6);

    for (const skillName of skillNames) {
      const canonicalSkill = resolve(canonicalRoot, skillName);
      const claudeSkill = resolve(claudeRoot, skillName);
      expect(lstatSync(canonicalSkill).isDirectory()).toBe(true);
      expect(lstatSync(canonicalSkill).isSymbolicLink()).toBe(false);
      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      expect(readlinkSync(claudeSkill)).toBe(`../../.agents/skills/${skillName}`);
    }
  });
});
