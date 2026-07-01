import {
  resolveProjectScope,
  enginePlatformAvailable,
  validateWorkflow,
  resolveAgentEngine,
  writeWorkflow,
  readWorkflow,
  agentExists,
  skillExists,
  WorkflowSchema,
} from '@withy/core';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

function projectScope(req: Request) {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  return resolveProjectScope(project);
}

// 读 workflow 节点图(server component 也可直接调 core,这里供客户端按需取)。
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  try {
    return Response.json({ ok: true, workflow: readWorkflow(scope, id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'read failed';
    return Response.json({ ok: false, error: message }, { status: 404 });
  }
}

// 保存 workflow:先 schema 校验(400),再 core 结构校验(连通/无环/阶段单调/switch default/skill 可解析)。
// 结构 error 拒绝落盘(422 带 issues);warning(skill/模板悬空)允许保存,随响应回传供前端提示。
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const parsed = WorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => ({
      level: 'error' as const,
      message: `${issue.path.join('.')}: ${issue.message}`,
    }));
    return Response.json({ ok: false, issues }, { status: 400 });
  }

  // URL 里的 id 是写入文件名的权威来源;对齐 body.id,避免画布改名后写错文件。
  const workflow = { ...parsed.data, id };
  const issues = validateWorkflow(workflow, {
    skillExists: name => skillExists(scope, name),
    agentExists: name => agentExists(scope, name),
    resolveAgentEngine: role => resolveAgentEngine(scope, role),
    enginePlatformAvailable: engine => enginePlatformAvailable(scope, engine),
  });
  if (issues.some(issue => issue.level === 'error')) {
    return Response.json({ ok: false, issues }, { status: 422 });
  }

  try {
    writeWorkflow(scope, workflow);
    return Response.json({ ok: true, issues });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'write failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
