import { getKnowledgeGraph } from '@/server/knowledge';
import { knowledgeErrorResponse, knowledgeScope } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 取最新关系图(进入关系图模式时按需取,反映刚保存的链接变化)。
export function GET(req: Request): Response {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  try {
    return Response.json({ ok: true, graph: getKnowledgeGraph(scope) });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
