import { subscribeProject } from '@/server/watcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 实时事件流(SSE):监听当前项目 .tuteur 变化,推 `task-updated` 让浏览器局部 revalidate。
// 仅 watch ?project= 指定的前台项目;无 project 时只发心跳保活。
export function GET(req: Request): Response {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const encoder = new TextEncoder();

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('ready', { project: project ?? null });
      if (project) unsubscribe = subscribeProject(project, () => send('task-updated', { project }));

      // 心跳:防代理/浏览器掐断空闲连接
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 25_000);

      req.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(heartbeat);
        controller.close();
      });
    },
    cancel() {
      unsubscribe();
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
