import { createKnowledgePage } from '@withy/core';
import { knowledgeErrorResponse, knowledgeScope, parseBody } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 在 dirRelPath(空=wiki 根)下新建页;name → slug。slug 与全库 id 冲突 → 409。
// body: { dirRelPath?, name }。返回新页 relPath 供客户端打开。
export async function POST(req: Request): Promise<Response> {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const body = await parseBody(req);
  const dirRelPath = typeof body?.dirRelPath === 'string' ? body.dirRelPath : '';
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return Response.json({ ok: false, error: 'name required' }, { status: 400 });
  }

  try {
    return Response.json({ ok: true, relPath: createKnowledgePage(scope, dirRelPath, body.name) });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
