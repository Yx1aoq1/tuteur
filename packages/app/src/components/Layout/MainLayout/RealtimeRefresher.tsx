'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { parseRoute } from '@/constants/views';
import { withinEchoWindow } from '@/lib/knowledgeEcho';
import type { ProjectCard } from '@/types/dashboard';

interface RealtimeRefresherProps {
  projects: ProjectCard[];
}

// 订阅 SSE(/api/events?project=<path>),收到 task-updated 即 router.refresh() 让 RSC 局部重读盘。
// 路由身份是项目名(/<name>),此处经 projects 映射回 path 喂给 API;切项目自动重连。
export function RealtimeRefresher({ projects }: RealtimeRefresherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { project: name } = parseRoute(pathname);
  const path = name ? (projects.find(p => p.name === name)?.path ?? null) : null;

  useEffect(() => {
    if (!path) return;
    const url = `/api/events?project=${encodeURIComponent(path)}`;
    const source = new EventSource(url);
    // 本地知识库写盘也会触发 task-updated;抑制窗口内跳过刷新,避免打断正在编辑的编辑器(echo 抑制)。
    source.addEventListener('task-updated', () => {
      if (withinEchoWindow()) return;
      router.refresh();
    });
    return () => source.close();
  }, [path, router]);

  return null;
}
