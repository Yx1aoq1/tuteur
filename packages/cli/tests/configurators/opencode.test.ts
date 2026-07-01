import { writeFileSync, readlinkSync, mkdtempSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type SkillAdapterMode, AGENT_PLATFORMS } from '@withy/core';
import { configureOpencode } from '../../src/configurators/opencode.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('configureOpencode', () => {
  it('links opencode skills to the canonical repository skill directory', async () => {
    const { root, skillPath } = await configure('symlink');

    expect(lstatSync(skillPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(skillPath)).toBe('../../.agents/skills/withy-test');
    expect(skillPath).toBe(resolve(root, '.opencode/skills/withy-test'));
  });

  it('copies canonical skills into the opencode skill directory when requested', async () => {
    const { root, skillPath } = await configure('copy');

    expect(lstatSync(skillPath).isDirectory()).toBe(true);
    expect(lstatSync(skillPath).isSymbolicLink()).toBe(false);
    expect(skillPath).toBe(resolve(root, '.opencode/skills/withy-test'));
  });
});

async function configure(skillAdapterMode: SkillAdapterMode): Promise<{ root: string; skillPath: string }> {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-opencode-config-'));
  const canonicalSkill = resolve(root, '.agents/skills/withy-test');
  const createdPaths: string[] = [];
  temporaryRoots.push(root);
  mkdirSync(canonicalSkill, { recursive: true });
  writeFileSync(resolve(canonicalSkill, 'SKILL.md'), '---\nname: withy-test\ndescription: test\n---\n');

  await configureOpencode({ projectRoot: root, createdPaths, skillAdapterMode }, AGENT_PLATFORMS.opencode);

  return { root, skillPath: resolve(root, '.opencode/skills/withy-test') };
}
