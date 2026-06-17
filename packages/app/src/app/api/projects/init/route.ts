import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import {
  getInitAgentChoices,
  serializeToCommand,
  resolveGlobalScope,
  getAgentPlatform,
  upsertProject,
  detectTuteur,
  isDirectory,
} from '@tuteur/core';
import type { AgentTool, InitConfig, SkillInstallMode } from '@tuteur/core';

export const runtime = 'nodejs';

// 启动 dashboard 的 CLI 可执行;默认 PATH 上的 `ttur`,可由启动器经 TUTEUR_CLI_BIN 覆盖为绝对路径。
const CLI_BIN = process.env.TUTEUR_CLI_BIN ?? 'ttur';

// 返回 web init 表单所需的 agent 选项(单一事实源 = core 注册表)与 skill 模式。
export function GET(): Response {
  const agents = getInitAgentChoices().map(platform => ({
    id: platform.id,
    name: platform.name,
    defaultChecked: platform.defaultChecked,
  }));
  return Response.json({ agents, skills: ['link', 'copy'] satisfies SkillInstallMode[] });
}

// web 触发 init(设计 §2.4):校验路径(存在/目录/无 .tuteur)→ spawn ttur init(非交互 per-agent flag)
// → 回传 exitCode/stdout/stderr;成功则 upsert 进项目列表。
export async function POST(req: Request): Promise<Response> {
  let body: { path?: unknown; agents?: unknown; skills?: unknown; user?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!path || !isDirectory(path)) {
    return Response.json({ ok: false, error: 'invalidPath' }, { status: 400 });
  }
  if (detectTuteur(path)) {
    return Response.json({ ok: false, error: 'alreadyInitialized' }, { status: 409 });
  }

  const agents = sanitizeAgents(body.agents);
  if (agents.length === 0) {
    return Response.json({ ok: false, error: 'selectAgent' }, { status: 400 });
  }

  const config: InitConfig = {
    scope: 'project',
    agents,
    skills: body.skills === 'copy' ? 'copy' : 'link',
    user: typeof body.user === 'string' && body.user.trim() ? body.user.trim() : undefined,
  };

  const args = buildInitArgs(config);
  const command = serializeToCommand(config);
  const run = await spawnInit(args, path);

  if (run.error) {
    return Response.json({ ok: false, error: run.error, command }, { status: 500 });
  }
  if (run.code !== 0) {
    return Response.json(
      { ok: false, code: run.code, stdout: run.stdout, stderr: run.stderr, command },
      { status: 422 },
    );
  }

  upsertProject(resolveGlobalScope(), { path, name: basename(path) });
  return Response.json({ ok: true, code: 0, stdout: run.stdout, stderr: run.stderr, command });
}

// 收窄入参 agent 到注册表中的合法 AgentTool,丢弃未知值。
function sanitizeAgents(value: unknown): AgentTool[] {
  if (!Array.isArray(value)) return [];
  const valid = getInitAgentChoices().map(platform => platform.id);
  return value.filter((item): item is AgentTool => valid.includes(item));
}

// 从 InitConfig 构造 `ttur init` 参数数组(per-agent flag,与 serializeToCommand 同源)。
function buildInitArgs(config: InitConfig): string[] {
  const args = ['init'];
  for (const agent of config.agents) args.push(`--${getAgentPlatform(agent).cliFlag}`);
  if (config.skills === 'copy') args.push('--copy');
  if (config.user) args.push('-u', config.user);
  return args;
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

// 在目标目录运行 init;捕获输出与退出码,ENOENT 等 spawn 失败归入 error。
function spawnInit(args: string[], cwd: string): Promise<SpawnResult> {
  return new Promise(resolve => {
    const child = spawn(CLI_BIN, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', err => resolve({ code: null, stdout, stderr, error: err.message }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
