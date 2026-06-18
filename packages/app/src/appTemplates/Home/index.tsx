import { redirect } from 'next/navigation';
import { getFirstProjectName } from '@/server/dashboard';
import { HomeLanding } from './HomeLanding';

// 根 landing(/):有项目则跳第一个项目看板(/<name>/board);否则渲染可加项目的落地页。
// 根布局已无侧栏,故无项目时的加项目入口由本页自带(HomeLanding)。
export async function HomePage() {
  const first = getFirstProjectName();
  if (first) redirect(`/${encodeURIComponent(first)}/board`);
  return <HomeLanding />;
}
