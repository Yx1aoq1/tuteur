import { BoardPage } from '@/appTemplates/Board';

export default function Page({ params }: { params: Promise<{ project: string }> }) {
  return <BoardPage params={params} />;
}
