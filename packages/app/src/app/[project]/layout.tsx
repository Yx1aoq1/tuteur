import { MainLayout } from '@/components/Layout/MainLayout';
import { getProjects } from '@/server/dashboard';

// 项目作用域布局:挂上主布局壳(侧栏项目切换 + 顶栏功能 tab + 实时刷新)。
// 仅覆盖 /<name>/* 路由;根 / 与全局 /settings 各自布局,不含此壳。
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const projects = getProjects();
  return <MainLayout projects={projects}>{children}</MainLayout>;
}
