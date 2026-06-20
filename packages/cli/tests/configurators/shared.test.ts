import { writeFileSync, readFileSync, symlinkSync, mkdtempSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeSkills } from '../../src/configurators/shared.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('writeSkills', () => {
  it('promotes a legacy canonical symlink into an original skill directory', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-canonical-migration-'));
    const legacySkill = resolve(root, '.agent/skill/withy-test');
    const canonicalRoot = resolve(root, '.agents/skills');
    const canonicalSkill = resolve(canonicalRoot, 'withy-test');
    temporaryRoots.push(root);
    mkdirSync(legacySkill, { recursive: true });
    mkdirSync(canonicalRoot, { recursive: true });
    writeFileSync(resolve(legacySkill, 'SKILL.md'), 'legacy');
    symlinkSync('../../.agent/skill/withy-test', canonicalSkill, 'dir');

    writeSkills({
      skillsRoot: canonicalRoot,
      skills: [{ name: 'withy-test', content: 'canonical' }],
      createdPaths: [],
    });

    expect(lstatSync(canonicalSkill).isDirectory()).toBe(true);
    expect(lstatSync(canonicalSkill).isSymbolicLink()).toBe(false);
    expect(readFileSync(resolve(canonicalSkill, 'SKILL.md'), 'utf8')).toBe('canonical');
  });
});
