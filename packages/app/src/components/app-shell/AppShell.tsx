import { Suspense } from 'react';
import { GlobalSettingsFab } from './GlobalSettingsFab';
import { RealtimeRefresher } from './RealtimeRefresher';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PRODUCT_DISPLAY_NAME } from '@/product';
import type { ProjectCard } from '@/types/dashboard';

interface AppShellProps {
  projects: ProjectCard[];
  children: React.ReactNode;
}

// 应用外壳(服务端):左栏(scope 导航)+ 顶栏(视图切换)+ 悬浮全局设置 + 主内容槽。
// Sidebar/Topbar/Realtime 用 useSearchParams,需包在 Suspense 内(Next 要求)。
export function AppShell({ projects, children }: AppShellProps) {
  return (
    <div className="tt-grain relative grid h-screen grid-cols-[214px_1fr]">
      <Suspense fallback={<div className="border-r border-line-strong bg-canvas-tint" />}>
        <Sidebar projects={projects} productName={PRODUCT_DISPLAY_NAME} />
      </Suspense>
      <div className="flex min-w-0 flex-col">
        <Suspense fallback={<div className="h-[60px] border-b border-line-strong" />}>
          <Topbar projects={projects} />
        </Suspense>
        <div className="relative flex min-h-0 flex-1">{children}</div>
      </div>
      <GlobalSettingsFab />
      <Suspense fallback={null}>
        <RealtimeRefresher />
      </Suspense>
    </div>
  );
}
