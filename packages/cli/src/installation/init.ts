import { resolve } from 'node:path';
import {
  configureAgentPlatform,
  installCanonicalWorkflowSkills,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import { ensureDir, writeJsonIfMissing, writeText, writeTextIfMissing } from '../utils/fs.js';
import { getInstalledWorkflowSkillTemplates, recordCurrentTemplateHashes } from './managed-templates.js';

export interface InitProjectOptions {
  projectRoot: string;
  agents?: AgentTool[];
  skillAdapterMode?: SkillAdapterMode;
  user?: string;
}

export interface InitProjectResult {
  projectRoot: string;
  createdPaths: string[];
  installedAgents: AgentTool[];
  currentUser: ProjectUser | null;
}

export interface ProjectUser {
  name: string;
  slug: string;
}

export async function initProject(options: InitProjectOptions): Promise<InitProjectResult> {
  const createdPaths: string[] = [];
  const projectDir = resolve(options.projectRoot, PROJECT_DIR_NAME);

  ensureDir(projectDir, createdPaths);
  ensureDir(resolve(projectDir, 'spec'), createdPaths);
  ensureDir(resolve(projectDir, 'workflows'), createdPaths);
  ensureDir(resolve(projectDir, 'tasks'), createdPaths);
  ensureDir(resolve(projectDir, 'runtime'), createdPaths);
  ensureDir(resolve(projectDir, 'workspace'), createdPaths);

  writeTextIfMissing(
    resolve(projectDir, '.gitignore'),
    [
      '# Developer identity and local runtime state',
      '# (workspace/ is committed — its subdirs are the project member roster)',
      '.developer',
      'runtime/',
      '',
      '# Temporary files',
      '*.tmp',
      '*.new',
      '',
    ].join('\n'),
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(projectDir, 'config.json'),
    {
      version: '0.1.0',
      defaultWorkflow: 'default',
      defaultAgent: options.agents?.[0] ?? null,
      tasks: {
        defaultFilter: 'mine',
        ownerFields: ['creator', 'assignee'],
      },
      dashboard: {
        host: '127.0.0.1',
        port: 47321,
        defaultTaskFilter: 'mine',
      },
    },
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(projectDir, 'context.json'),
    {
      default: {
        required: [],
        optional: [],
        disabled: [],
      },
      agents: {},
    },
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(projectDir, 'workflows/default.workflow.json'),
    {
      id: 'default',
      name: 'Default Coding Workflow',
      version: '0.1.0',
      phases: [
        {
          id: 'planning',
          name: 'Planning',
          steps: [
            { id: 'brainstorm', skillRef: 'brainstorm', required: true },
            { id: 'grill-me', skillRef: 'grill-me', required: true },
          ],
        },
        {
          id: 'execute',
          name: 'Execute',
          steps: [
            { id: 'dev', skillRef: 'dev', required: true },
            { id: 'check', skillRef: 'check', required: true },
          ],
        },
        {
          id: 'finish',
          name: 'Finish',
          steps: [{ id: 'finish', skillRef: 'finish', required: true }],
        },
      ],
    },
    createdPaths,
  );

  installCanonicalWorkflowSkills({
    projectRoot: options.projectRoot,
    createdPaths,
  });

  const currentUser = options.user ? writeProjectUser(projectDir, options.user, createdPaths) : null;

  const installedAgents: AgentTool[] = [];
  for (const agent of options.agents ?? []) {
    const result = await configureAgentPlatform(agent, {
      projectRoot: options.projectRoot,
      createdPaths,
      skillAdapterMode: options.skillAdapterMode ?? 'symlink',
    });

    if (result.configured) {
      installedAgents.push(agent);
    }
  }

  recordCurrentTemplateHashes(options.projectRoot, getInstalledWorkflowSkillTemplates(options.projectRoot), createdPaths);

  return {
    projectRoot: options.projectRoot,
    createdPaths,
    installedAgents,
    currentUser,
  };
}

function writeProjectUser(projectDir: string, name: string, createdPaths: string[]): ProjectUser {
  const currentUser = {
    name: name.trim(),
    slug: slugifyUserName(name),
  };
  const now = new Date().toISOString();

  // Local developer identity (gitignored; mirrors Trellis `.developer`).
  writeText(
    resolve(projectDir, '.developer'),
    `${JSON.stringify(
      {
        ...currentUser,
        initializedAt: now,
      },
      null,
      2,
    )}\n`,
    createdPaths,
  );

  // Committed workspace dir — its presence registers this developer in the
  // project roster (the set of workspace/<slug>/ dirs is the member list).
  const userWorkspace = resolve(projectDir, 'workspace', currentUser.slug);
  ensureDir(userWorkspace, createdPaths);
  writeTextIfMissing(
    resolve(userWorkspace, 'index.md'),
    `# ${currentUser.name}\n\nLocal ${PRODUCT_DISPLAY_NAME} workspace.\n`,
    createdPaths,
  );

  return currentUser;
}

function slugifyUserName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'user';
}
