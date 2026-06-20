import { saveKnowledgePageBody } from '@withy/core';
import { knowledgeErrorResponse, knowledgeScope, parseBody } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 保存正文:core 逐字保留 frontmatter、就地置 updated、换正文,不重建 index。
// body: { relPath, body }。index.md / 越界 / 缺页由 core 抛错映射状态码。
export async function POST(req: Request): Promise<Response> {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const body = await parseBody(req);
  if (typeof body?.relPath !== 'string' || typeof body?.body !== 'string') {
    return Response.json({ ok: false, error: 'relPath and body required' }, { status: 400 });
  }

  try {
    saveKnowledgePageBody(scope, body.relPath, body.body);
    return Response.json({ ok: true });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
