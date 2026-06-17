import { resolveProjectScope, archiveTask } from '@tuteur/core';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

// 归档任务(core §9:移入 archive/YYYY-MM/ 分桶)。body: { markCancelled? }。
// markCancelled=true 把未完成任务标记为 cancelled;默认不改状态。
export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const scope = resolveProjectScope(project);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  let markCancelled = false;
  try {
    const body = await req.json();
    markCancelled = Boolean(body?.markCancelled);
  } catch {
    // 空 body 视为默认归档(不改状态)
  }

  try {
    archiveTask(scope, id, { markCancelled });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'archive failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
