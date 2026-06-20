import { deleteKnowledgeEntry } from '@withy/core';
import { knowledgeErrorResponse, knowledgeScope, parseBody } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 删除文件或文件夹(目录递归);index.md 不可删。完成后 core 重建并清理孤儿 index。
// body: { relPath }。二次确认在客户端。
export async function POST(req: Request): Promise<Response> {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const body = await parseBody(req);
  if (typeof body?.relPath !== 'string') {
    return Response.json({ ok: false, error: 'relPath required' }, { status: 400 });
  }

  try {
    deleteKnowledgeEntry(scope, body.relPath);
    return Response.json({ ok: true });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
