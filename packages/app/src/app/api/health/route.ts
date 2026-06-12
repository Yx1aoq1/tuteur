import { DASHBOARD_PROJECT_ROOT_ENV, DASHBOARD_SERVICE_NAME } from '../../../product';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    service: DASHBOARD_SERVICE_NAME,
    projectRoot: process.env[DASHBOARD_PROJECT_ROOT_ENV] ?? null,
  });
}
