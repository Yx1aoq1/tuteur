// 知识库 API 的服务端公共件:scope 解析、JSON body 解析、core 抛错 → HTTP 状态映射。
// 仅 route handler(node runtime)使用;集中收口避免 7 个 route 各自重复。

import { resolveProjectScope, KnowledgeError } from '@withy/core';
import type { Scope } from '@withy/core';

/** 由 `?project=<path>` 解析项目 scope(对齐 board/workflow route 范式)。 */
export function knowledgeScope(req: Request): Scope | null {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  return resolveProjectScope(project);
}

/** 安全解析 JSON body;非法 body 返回 null(调用方按 400 处理)。 */
export async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * core 抛错 → HTTP 响应。`KnowledgeError`(越界/index.md/缺失/冲突)是预期的客户端错误:
 * 命名冲突类映射 409,其余守卫(越界/index.md/缺页)映射 400;非预期错误映射 422。
 *
 * @param error core 调用抛出的错误
 */
export function knowledgeErrorResponse(error: unknown): Response {
  if (error instanceof KnowledgeError) {
    const status = /exists/.test(error.message) ? 409 : 400;
    return Response.json({ ok: false, error: error.message }, { status });
  }

  const message = error instanceof Error ? error.message : 'knowledge op failed';
  return Response.json({ ok: false, error: message }, { status: 422 });
}
