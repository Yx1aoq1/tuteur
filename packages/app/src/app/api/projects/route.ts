import { basename } from 'node:path';
import { resolveGlobalScope, upsertProject, readProjects, detectTuteur, isDirectory } from '@tuteur/core';

export const runtime = 'nodejs';

// 加项目:校验路径 → detectTuteur。
// - 已含 .tuteur/ → upsert 进全局注册表(added|exists)。
// - 是有效目录但无 .tuteur/ → needInit(前端弹初始化表单,走 /api/projects/init)。
// - 路径无效 → 400 invalidPath。
export async function POST(req: Request): Promise<Response> {
  let path: unknown;
  try {
    ({ path } = await req.json());
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  if (typeof path !== 'string' || path.trim() === '') {
    return Response.json({ ok: false, error: 'path required' }, { status: 400 });
  }

  const target = path.trim();
  if (!isDirectory(target)) {
    return Response.json({ ok: false, error: 'invalidPath' }, { status: 400 });
  }

  if (!detectTuteur(target)) {
    return Response.json({ ok: true, status: 'needInit' });
  }

  const global = resolveGlobalScope();
  const existed = readProjects(global).projects.some(project => project.path === target);
  upsertProject(global, { path: target, name: basename(target) });

  return Response.json({ ok: true, status: existed ? 'exists' : 'added' });
}
