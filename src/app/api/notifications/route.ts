import { authorizeProjectMembershipRequest } from '../../../lib/server/projectAuthorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const auth = await authorizeProjectMembershipRequest(request, projectId);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true';
  let query = auth.admin.from('app_notifications').select('id,event_id,project_id,actor,action,module,detail,created_at,read,read_at').eq('project_id', projectId).eq('recipient_user_id', auth.userId).order('created_at', { ascending: false }).limit(100);
  if (unreadOnly) query = query.eq('read', false);
  const { data, error } = await query;
  if (error) return Response.json({ error: 'Notifications could not be loaded.' }, { status: 400 });
  return Response.json({ notifications: data || [], unreadCount: (data || []).filter((item) => !item.read).length });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId || ''); const notificationId = String(body?.notificationId || '');
  if (!notificationId) return Response.json({ error: 'Notification is required.' }, { status: 400 });
  const auth = await authorizeProjectMembershipRequest(request, projectId);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from('app_notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', notificationId).eq('project_id', projectId).eq('recipient_user_id', auth.userId).select('id,read,read_at').maybeSingle();
  if (error) return Response.json({ error: 'Notification could not be updated.' }, { status: 400 });
  if (!data) return Response.json({ error: 'Notification is not available.' }, { status: 404 });
  return Response.json({ notification: data });
}
