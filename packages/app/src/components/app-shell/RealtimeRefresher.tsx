'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// 订阅 SSE(/api/events?project=),收到 task-updated 即 router.refresh() 让 RSC 局部重读盘。
// 只跟随当前前台项目;切换项目自动重连(project 变化触发 effect 重订阅)。
export function RealtimeRefresher() {
  const router = useRouter();
  const params = useSearchParams();
  const project = params.get('project');

  useEffect(() => {
    if (!project) return;
    const url = `/api/events?project=${encodeURIComponent(project)}`;
    const source = new EventSource(url);
    source.addEventListener('task-updated', () => router.refresh());
    return () => source.close();
  }, [project, router]);

  return null;
}
