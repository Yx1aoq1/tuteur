import { resolveProjectScope } from '@withy/core';
import { getTaskDoc } from '@/server/tasks';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

// 单个任务产物正文(只读)。scope 由 ?project=<path> 解析;name 缺失或非法 → 400。
// 文件不存在返回 doc:null(详情弹窗据此显示空态)。
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const scope = resolveProjectScope(url.searchParams.get('project') ?? undefined);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const name = url.searchParams.get('name');
  if (!name) return Response.json({ ok: false, error: 'name required' }, { status: 400 });

  try {
    return Response.json({ ok: true, doc: getTaskDoc(scope, id, name) });
  } catch (error) {
    // name 非法(穿越/分隔符/非 .md)由 core 抛错 → 400(客户端错误,非服务器故障)
    const message = error instanceof Error ? error.message : 'read task doc failed';
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
