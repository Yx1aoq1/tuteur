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
// 高度:整体撑满视口(h-screen)并设 600px 最小高度(过矮时整页滚动);主列 min-h-0 让其服从
// 网格轨道高度,把溢出交给左/右面板各自的内部滚动区,中间区域恒满高、不引发整页滚动。
export function AppShell({ projects, children }: AppShellProps) {
  return (
    <div className="tt-grain relative grid h-screen min-h-[600px] grid-cols-[214px_1fr]">
      <Suspense fallback={<div className="border-r border-line-strong bg-canvas-tint" />}>
        <Sidebar projects={projects} productName={PRODUCT_DISPLAY_NAME} />
      </Suspense>
      <div className="flex min-h-0 min-w-0 flex-col">
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
