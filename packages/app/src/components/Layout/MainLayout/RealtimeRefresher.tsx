'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { parseRoute } from '@/constants/views';
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
    source.addEventListener('task-updated', () => router.refresh());
    return () => source.close();
  }, [path, router]);

  return null;
}
