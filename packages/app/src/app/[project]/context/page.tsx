import { ContextPage } from '@/appTemplates/Context';

interface PageProps {
  params: Promise<{ project: string }>;
}

export default function Page({ params }: PageProps) {
  return <ContextPage params={params} />;
}
