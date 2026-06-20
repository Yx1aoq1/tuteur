import { renameKnowledgeEntry } from '@withy/core';
import { knowledgeErrorResponse, knowledgeScope, parseBody } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 重命名/移动文件或文件夹(简单移动,不改 frontmatter/链接)。目标已存在 → 409。
// body: { fromRelPath, toRelPath }。
export async function POST(req: Request): Promise<Response> {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const body = await parseBody(req);
  if (typeof body?.fromRelPath !== 'string' || typeof body?.toRelPath !== 'string') {
    return Response.json({ ok: false, error: 'fromRelPath and toRelPath required' }, { status: 400 });
  }

  try {
    renameKnowledgeEntry(scope, body.fromRelPath, body.toRelPath);
    return Response.json({ ok: true });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
