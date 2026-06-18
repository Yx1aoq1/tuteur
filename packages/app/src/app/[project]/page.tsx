import { redirect } from 'next/navigation';

// 项目根(/<name>)→ 默认功能看板(/<name>/board)。
export default async function ProjectIndex({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  redirect(`/${project}/board`);
}
