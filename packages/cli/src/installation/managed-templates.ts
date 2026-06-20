import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ensureDir } from '@withy/core';
import { resolveWorkflowSkills } from '../configurators/shared.js';
import { PROJECT_DIR_NAME } from '../constants/product.js';
import { DEFAULT_WORKFLOW_CONTENT, GUIDE_TEMPLATE } from './templates.js';

export interface ManagedTemplate {
  relativePath: string;
  absolutePath: string;
  content: string;
}

export type TemplateHashes = Record<string, string>;

const hashManifestRelativePath = join(PROJECT_DIR_NAME, 'template-hashes.json');
const canonicalSkillsRelativeRoot = '.agents/skills';
const legacyCanonicalSkillsRelativeRoot = '.agent/skill';
const claudeSkillsRelativeRoot = '.claude/skills';

export function getHashManifestPath(projectRoot: string): string {
  return resolve(projectRoot, hashManifestRelativePath);
}

export function getBundledSkillNames(): string[] {
  return resolveWorkflowSkills({
    cmdRefPrefix: '$',
    userActionLabel: 'Skills',
    cliFlag: 'codex',
  }).map(skill => skill.name);
}

export function getManagedWorkflowSkillTemplates(projectRoot: string): ManagedTemplate[] {
  return resolveWorkflowSkills({
    cmdRefPrefix: '$',
    userActionLabel: 'Skills',
    cliFlag: 'codex',
  }).map(skill => {
    const relativePath = toPosixPath(join(canonicalSkillsRelativeRoot, skill.name, 'SKILL.md'));
    return {
      relativePath,
      absolutePath: resolve(projectRoot, relativePath),
      content: skill.content,
    };
  });
}

/**
 * Resolve project-level workflow files managed by the CLI.
 *
 * @param projectRoot project root containing the `.withy` directory
 *
 * @example
 * getManagedProjectTemplates('/path/to/project');
 */
export function getManagedProjectTemplates(projectRoot: string): ManagedTemplate[] {
  return [
    {
      relativePath: `${PROJECT_DIR_NAME}/guide.md`,
      absolutePath: resolve(projectRoot, PROJECT_DIR_NAME, 'guide.md'),
      content: GUIDE_TEMPLATE,
    },
    {
      relativePath: `${PROJECT_DIR_NAME}/workflows/default.workflow.json`,
      absolutePath: resolve(projectRoot, PROJECT_DIR_NAME, 'workflows/default.workflow.json'),
      content: DEFAULT_WORKFLOW_CONTENT,
    },
  ];
}

/**
 * Resolve every managed template installed in a project.
 *
 * @param projectRoot project root containing Withy-managed files
 *
 * @example
 * getInstalledManagedTemplates('/path/to/project');
 */
export function getInstalledManagedTemplates(projectRoot: string): ManagedTemplate[] {
  const skillTemplates = getManagedWorkflowSkillTemplates(projectRoot);
  const templates = [...getManagedProjectTemplates(projectRoot), ...skillTemplates];

  for (const template of skillTemplates) {
    const skillName = template.relativePath.split('/').at(-2);
    if (!skillName) {
      continue;
    }

    const claudeSkillDir = resolve(projectRoot, claudeSkillsRelativeRoot, skillName);
    const claudeSkillFile = resolve(claudeSkillDir, 'SKILL.md');
    if (!existsSync(claudeSkillDir) || isSymlink(claudeSkillDir) || !existsSync(claudeSkillFile)) {
      continue;
    }

    templates.push({
      relativePath: toPosixPath(relative(projectRoot, claudeSkillFile)),
      absolutePath: claudeSkillFile,
      content: template.content,
    });
  }

  return templates;
}

export function loadTemplateHashes(projectRoot: string): TemplateHashes {
  const manifestPath = getHashManifestPath(projectRoot);
  if (!existsSync(manifestPath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${hashManifestRelativePath} must contain a JSON object.`);
  }

  const hashes: TemplateHashes = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      hashes[key] = value;
    }
  }

  return hashes;
}

export function saveTemplateHashes(projectRoot: string, hashes: TemplateHashes, createdPaths?: string[]): void {
  const manifestPath = getHashManifestPath(projectRoot);
  const created: string[] = createdPaths ?? [];
  const existed = existsSync(manifestPath);
  ensureDir(dirname(manifestPath), created);
  writeFileSync(manifestPath, `${JSON.stringify(sortHashes(hashes), null, 2)}\n`, 'utf8');
  if (!existed && createdPaths) {
    createdPaths.push(manifestPath);
  }
}

export function recordCurrentTemplateHashes(
  projectRoot: string,
  templates: ManagedTemplate[],
  createdPaths?: string[],
): TemplateHashes {
  const hashes = loadTemplateHashes(projectRoot);

  for (const relativePath of Object.keys(hashes)) {
    if (relativePath.startsWith(`${legacyCanonicalSkillsRelativeRoot}/`)) {
      delete hashes[relativePath];
    }
  }

  for (const template of templates) {
    if (!existsSync(template.absolutePath) || isSymlink(template.absolutePath)) {
      continue;
    }

    const currentContent = readFileSync(template.absolutePath, 'utf8');
    if (currentContent === template.content) {
      hashes[template.relativePath] = hashContent(currentContent);
    }
  }

  saveTemplateHashes(projectRoot, hashes, createdPaths);
  return hashes;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function removeKnownWorkflowSkillPaths(projectRoot: string): number {
  let removed = 0;
  const relativeRoots = [claudeSkillsRelativeRoot, canonicalSkillsRelativeRoot, legacyCanonicalSkillsRelativeRoot];

  for (const skillName of getBundledSkillNames()) {
    for (const relativeRoot of relativeRoots) {
      const skillPath = resolve(projectRoot, relativeRoot, skillName);
      if (!pathExists(skillPath)) {
        continue;
      }

      rmSync(skillPath, { recursive: true, force: true });
      removed += 1;
    }
  }

  return removed;
}

export function copyTemplateBackup(backupDir: string, template: ManagedTemplate): void {
  const targetPath = resolve(backupDir, template.relativePath);
  ensureDir(dirname(targetPath), []);
  copyFileSync(template.absolutePath, targetPath);
}

export function cleanupEmptyManagedDirs(projectRoot: string): number {
  let removed = 0;
  const candidates = [
    resolve(projectRoot, claudeSkillsRelativeRoot),
    resolve(projectRoot, '.claude'),
    resolve(projectRoot, canonicalSkillsRelativeRoot),
    resolve(projectRoot, legacyCanonicalSkillsRelativeRoot),
    resolve(projectRoot, '.agent'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate) || !lstatSync(candidate).isDirectory()) {
      continue;
    }

    if (readdirSync(candidate).length === 0) {
      rmdirSync(candidate);
      removed += 1;
    }
  }

  return removed;
}

export function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function isSymlink(path: string): boolean {
  return lstatSync(path).isSymbolicLink();
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function sortHashes(hashes: TemplateHashes): TemplateHashes {
  return Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)));
}
