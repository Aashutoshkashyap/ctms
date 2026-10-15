import { authorizeProjectRequest } from '../../../../lib/server/projectAuthorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'manage_users', 'read');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const assignments = await actor.admin.from('employee_project_assignments').select('id,employee_id,project_id,project_role,manager_person_id,start_date,end_date,status,project_user_id').eq('organization_id', actor.project.organizationId).eq('project_id', projectId).order('status').order('created_at');
  if (assignments.error) return Response.json({ error: 'Project workforce could not be loaded.' }, { status: 400 });
  const ids = (assignments.data || []).map(item => item.employee_id);
  const employees = ids.length ? await actor.admin.from('employee_records').select('id,employee_code,full_name,department,designation,trade_skill,location,employment_status,active,person_id').eq('organization_id', actor.project.organizationId).in('id', ids) : { data: [], error: null };
  if (employees.error) return Response.json({ error: 'Project workforce could not be loaded.' }, { status: 400 });
  return Response.json({ assignments: assignments.data || [], employees: employees.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
