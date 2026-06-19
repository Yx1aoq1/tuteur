import { spawn } from 'node:child_process';
import { resolveGlobalScope, findProjectByName, removeProject } from '@withy/core';

export const runtime = 'nodejs';

// 启动 dashboard 的 CLI 可执行;默认 PATH 上的 `withy`,可由启动器经 WITHY_CLI_BIN 覆盖为绝对路径。
const CLI_BIN = process.env.WITHY_CLI_BIN ?? 'withy';

// 删项目:按 name(唯一 URL 身份)定位 path。
// - uninstall=false:仅从全局注册表摘除,磁盘文件不动。
// - uninstall=true:先 spawn `withy uninstall --yes`(同 CLI:删 .withy/ 与托管 skill),
//   成功后再摘表;卸载失败则保留注册项并回传输出,避免摘表后留下孤儿文件。
export async function POST(req: Request): Promise<Response> {
  let body: { name?: unknown; uninstall?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ ok: false, error: 'nameRequired' }, { status: 400 });
  }

  const global = resolveGlobalScope();
  const project = findProjectByName(global, name);
  if (!project) {
    return Response.json({ ok: false, error: 'notFound' }, { status: 404 });
  }

  if (body.uninstall === true) {
    const run = await spawnUninstall(project.path);
    if (run.error) {
      return Response.json({ ok: false, error: run.error }, { status: 500 });
    }
    if (run.code !== 0) {
      return Response.json({ ok: false, code: run.code, stdout: run.stdout, stderr: run.stderr }, { status: 422 });
    }
    removeProject(global, project.path);
    return Response.json({ ok: true, uninstalled: true, stdout: run.stdout, stderr: run.stderr });
  }

  removeProject(global, project.path);
  return Response.json({ ok: true, uninstalled: false });
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

// 在项目目录非交互运行 `withy uninstall --yes`;捕获输出与退出码,ENOENT 等 spawn 失败归入 error。
function spawnUninstall(cwd: string): Promise<SpawnResult> {
  return new Promise(resolve => {
    const child = spawn(CLI_BIN, ['uninstall', '--yes'], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', err => resolve({ code: null, stdout, stderr, error: err.message }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
