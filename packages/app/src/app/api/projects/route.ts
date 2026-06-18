import {
  resolveGlobalScope,
  findProjectByName,
  upsertProject,
  readProjects,
  detectWithy,
  isDirectory,
} from '@withy/core';
import { RESERVED_PROJECT_NAMES } from '@/constants/views';

export const runtime = 'nodejs';

// 加项目:校验路径 + 项目名 → detectWithy。
// - 名称为唯一 URL 身份(/<name>):被别的路径占用 → 409 nameTaken,前端提示改名。
// - 已含 .withy/ → upsert 进全局注册表(added|exists)。
// - 是有效目录但无 .withy/ → needInit(前端弹初始化表单,走 /api/projects/init,name 透传)。
// - 路径无效 → 400 invalidPath。
export async function POST(req: Request): Promise<Response> {
  let body: { path?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const target = typeof body.path === 'string' ? body.path.trim() : '';
  if (!target) {
    return Response.json({ ok: false, error: 'path required' }, { status: 400 });
  }
  if (!isDirectory(target)) {
    return Response.json({ ok: false, error: 'invalidPath' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ ok: false, error: 'nameRequired' }, { status: 400 });
  }
  if (RESERVED_PROJECT_NAMES.includes(name)) {
    return Response.json({ ok: false, error: 'nameReserved' }, { status: 409 });
  }

  const global = resolveGlobalScope();
  const clash = findProjectByName(global, name);
  if (clash && clash.path !== target) {
    return Response.json({ ok: false, error: 'nameTaken' }, { status: 409 });
  }

  if (!detectWithy(target)) {
    return Response.json({ ok: true, status: 'needInit' });
  }

  const existed = readProjects(global).projects.some(project => project.path === target);
  upsertProject(global, { path: target, name });

  return Response.json({ ok: true, status: existed ? 'exists' : 'added' });
}
