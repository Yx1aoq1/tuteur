import { KnowledgePage } from '@/appTemplates/Knowledge';

export default function Page({ params }: { params: Promise<{ project: string }> }) {
  return <KnowledgePage params={params} />;
}
