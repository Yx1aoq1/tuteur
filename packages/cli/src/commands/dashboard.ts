import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveGlobalScope, runtimeDir, detectWithy } from '@withy/core';
import type { Command } from 'commander';
import { DASHBOARD_PACKAGE_NAME, DASHBOARD_PROJECT_ROOT_ENV } from '../constants/product.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 47321;

interface DashboardState {
  pid?: number;
  host?: string;
  port?: number;
  url?: string;
  // cwd 若本身是已初始化项目,记为「无选择时的默认项目」兜底(web.md §2.3);否则不绑任何项目。
  defaultProject?: string;
  startedAt?: string;
}

export default function registerDashboardCommand(program: Command): void {
  const dashboard = program
    .command('dashboard')
    .alias('dashbord')
    .description('Manage the local dashboard background process');

  dashboard.command('start').description('Start the dashboard in the background').action(startDashboard);

  dashboard.command('stop').description('Stop the dashboard background process').action(stopDashboard);
}

// dashboard 是多项目管理器:启动按需自建全局根 ~/.withy(下方 runtime 目录递归创建即带出根),
// 不要求先 init,也不要求 cwd 是已初始化项目。具体项目由 web 端经 ?project= 选择(web.md §2.3)。
function startDashboard(): void {
  const global = resolveGlobalScope();

  const stateDir = runtimeDir(global);
  const statePath = resolve(stateDir, 'dashboard.json');
  mkdirSync(stateDir, { recursive: true });

  const currentState = readDashboardState(statePath);
  if (currentState?.pid && isProcessAlive(currentState.pid)) {
    console.log(`Dashboard already running: ${currentState.url ?? defaultDashboardUrl()}`);
    return;
  }

  // cwd 是已初始化项目时,作为默认项目兜底;否则不强加默认,前端从空列表开始添加。
  const cwd = process.cwd();
  const defaultProject = detectWithy(cwd) ? cwd : undefined;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (defaultProject) env[DASHBOARD_PROJECT_ROOT_ENV] = defaultProject;
  else delete env[DASHBOARD_PROJECT_ROOT_ENV];

  const child = spawn(
    'pnpm',
    [
      '--filter',
      DASHBOARD_PACKAGE_NAME,
      'exec',
      'next',
      'dev',
      '--hostname',
      DEFAULT_HOST,
      '--port',
      String(DEFAULT_PORT),
    ],
    {
      cwd,
      detached: true,
      env,
      stdio: 'ignore',
    },
  );
  child.unref();

  const url = defaultDashboardUrl();
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        pid: child.pid,
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        url,
        defaultProject,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`Dashboard started: ${url}`);
}

function stopDashboard(): void {
  const statePath = resolve(runtimeDir(resolveGlobalScope()), 'dashboard.json');
  const currentState = readDashboardState(statePath);

  if (!currentState) {
    console.log('Dashboard is not running.');
    return;
  }

  if (currentState.pid && isProcessAlive(currentState.pid)) {
    process.kill(currentState.pid, 'SIGTERM');
  }
  rmSync(statePath, { force: true });
  console.log('Dashboard stopped.');
}

function readDashboardState(statePath: string): DashboardState | null {
  if (!existsSync(statePath)) {
    return null;
  }

  return JSON.parse(readFileSync(statePath, 'utf8')) as DashboardState;
}

function defaultDashboardUrl(): string {
  return `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
