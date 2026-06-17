import { resolveProjectScope, setChecklistItem, StoreError } from '@tuteur/core';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

// 勾选/取消单条验收项(等价 `ttur check`,core §4.7)。body: { itemId, done }。
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const scope = resolveProjectScope(project);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  let body: { itemId?: unknown; done?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  if (typeof body.itemId !== 'string' || typeof body.done !== 'boolean') {
    return Response.json({ ok: false, error: 'itemId(string) and done(boolean) required' }, { status: 400 });
  }

  try {
    const checklist = setChecklistItem(scope, id, body.itemId, body.done);
    return Response.json({ ok: true, checklist });
  } catch (error) {
    if (error instanceof StoreError) return Response.json({ ok: false, error: error.message }, { status: 404 });
    throw error;
  }
}
