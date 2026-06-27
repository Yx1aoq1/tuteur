import { getKnowledgeFile } from '@/server/knowledge';
import { knowledgeErrorResponse, knowledgeScope } from '@/server/knowledgeApi';

export const runtime = 'nodejs';

// 取单文件正文 + 只读标记(切换文件时按需读,只刷新中栏/右栏)。
// relPath 越界由 core `assertInsideKnowledge` 抛错 → 400;文件不存在返回 file:null。
export function GET(req: Request): Response {
  const scope = knowledgeScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const relPath = new URL(req.url).searchParams.get('relPath');
  if (!relPath) return Response.json({ ok: false, error: 'relPath required' }, { status: 400 });

  try {
    return Response.json({ ok: true, file: getKnowledgeFile(scope, relPath) });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
