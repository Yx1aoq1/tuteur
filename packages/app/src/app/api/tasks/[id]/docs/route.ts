import { resolveProjectScope } from '@withy/core';
import { getTaskDocs } from '@/server/tasks';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

// 任务产物清单(prd/design/implement 等 .md 文件名)。scope 由 ?project=<path> 解析。
// 详情面板选中任务时按需调用;产物清单不挂 BoardCard,避免每卡 readdir。
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const scope = resolveProjectScope(project);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  try {
    return Response.json({ ok: true, docs: getTaskDocs(scope, id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'list task docs failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
