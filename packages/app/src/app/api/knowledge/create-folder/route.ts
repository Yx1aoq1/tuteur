import { createKnowledgeFolder } from '@withy/core';
import { knowledgeErrorResponse, knowledgeScope, parseBody } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 在 dirRelPath(空=wiki 根)下新建空文件夹(树中可见,不产生 index)。
// body: { dirRelPath?, name }。返回新目录 relPath。
export async function POST(req: Request): Promise<Response> {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const body = await parseBody(req);
  const dirRelPath = typeof body?.dirRelPath === 'string' ? body.dirRelPath : '';
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return Response.json({ ok: false, error: 'name required' }, { status: 400 });
  }

  try {
    return Response.json({ ok: true, relPath: createKnowledgeFolder(scope, dirRelPath, body.name) });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
