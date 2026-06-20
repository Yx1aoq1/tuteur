import { writeFileSync, readlinkSync, symlinkSync, mkdtempSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type SkillAdapterMode, AGENT_PLATFORMS } from '@withy/core';
import { configureClaude } from '../../src/configurators/claude.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('configureClaude', () => {
  it('links Claude skills to the canonical repository skill directory', async () => {
    const { root, skillPath } = await configure('symlink');

    expect(lstatSync(skillPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(skillPath)).toBe('../../.agents/skills/withy-test');
    expect(skillPath).toBe(resolve(root, '.claude/skills/withy-test'));
  });

  it('copies canonical skills into the Claude skill directory when requested', async () => {
    const { root, skillPath } = await configure('copy');

    expect(lstatSync(skillPath).isDirectory()).toBe(true);
    expect(lstatSync(skillPath).isSymbolicLink()).toBe(false);
    expect(skillPath).toBe(resolve(root, '.claude/skills/withy-test'));
  });

  it('repairs a Claude symlink that still targets the legacy canonical directory', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-claude-migration-'));
    const canonicalSkill = resolve(root, '.agents/skills/withy-test');
    const legacySkill = resolve(root, '.agent/skill/withy-test');
    const claudeSkills = resolve(root, '.claude/skills');
    const skillPath = resolve(claudeSkills, 'withy-test');
    temporaryRoots.push(root);
    mkdirSync(canonicalSkill, { recursive: true });
    mkdirSync(legacySkill, { recursive: true });
    mkdirSync(claudeSkills, { recursive: true });
    writeFileSync(resolve(canonicalSkill, 'SKILL.md'), 'canonical');
    writeFileSync(resolve(legacySkill, 'SKILL.md'), 'legacy');
    symlinkSync('../../.agent/skill/withy-test', skillPath, 'dir');

    await configureClaude({ projectRoot: root, createdPaths: [], skillAdapterMode: 'symlink' }, AGENT_PLATFORMS.claude);

    expect(readlinkSync(skillPath)).toBe('../../.agents/skills/withy-test');
  });
});

async function configure(skillAdapterMode: SkillAdapterMode): Promise<{ root: string; skillPath: string }> {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-claude-config-'));
  const canonicalSkill = resolve(root, '.agents/skills/withy-test');
  const createdPaths: string[] = [];
  temporaryRoots.push(root);
  mkdirSync(canonicalSkill, { recursive: true });
  writeFileSync(resolve(canonicalSkill, 'SKILL.md'), '---\nname: withy-test\ndescription: test\n---\n');

  await configureClaude({ projectRoot: root, createdPaths, skillAdapterMode }, AGENT_PLATFORMS.claude);

  return { root, skillPath: resolve(root, '.claude/skills/withy-test') };
}
