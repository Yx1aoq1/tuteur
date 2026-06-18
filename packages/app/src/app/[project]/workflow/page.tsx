import { WorkflowPage } from '@/appTemplates/Workflow';

export default function Page({ params }: { params: Promise<{ project: string }> }) {
  return <WorkflowPage params={params} />;
}
