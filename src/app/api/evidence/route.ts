import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';

export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const evidenceTypes = new Set(['progress', 'quality', 'safety', 'delivery', 'attendance', 'other']);
const text = (value: unknown, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const fail = (error: string, status = 400) => Response.json({ error }, { status });
const signedPhoto = (row: Record<string, unknown>, signedUrl?: string | null) => ({ ...row, url: signedUrl || text(row.url, 2000) });

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'view_evidence', 'read');
  if ('error' in actor) return fail(actor.error, actor.status);
  const records = await actor.admin.from('site_photos').select('*').eq('project_id', projectId).order('captured_at', { ascending: false });
  if (records.error) return fail('Evidence records could not be loaded.');
  const photos = await Promise.all((records.data || []).map(async row => {
    const path = text(row.storage_path, 2000);
    if (!path || path.startsWith('google-drive:')) return signedPhoto(row);
    const { data } = await actor.admin.storage.from('site-photos').createSignedUrl(path, 3600);
    return signedPhoto(row, data?.signedUrl);
  }));
  return Response.json({ photos }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const projectId = text(form?.get('projectId'), 160);
  const actor = await authorizeProjectRequest(request, projectId, 'upload_evidence', 'write');
  if ('error' in actor) return fail(actor.error, actor.status);
  const reportId = text(form?.get('reportId'), 160);
  const file = form?.get('file');
  const caption = text(form?.get('caption'), 2000);
  const evidenceType = text(form?.get('evidenceType'), 30) || 'progress';
  if (!reportId || !(file instanceof File) || !file.size || file.size > 6 * 1024 * 1024 || !allowedTypes.has(file.type) || !evidenceTypes.has(evidenceType)) return fail('Choose a JPG, PNG, or WebP image up to 6 MB for the active project report.');
  const report = await actor.admin.from('daily_reports').select('id').eq('id', reportId).eq('project_id', projectId).maybeSingle();
  if (!report.data) return fail('The selected daily report is not part of this project.', 404);
  const name = text(file.name, 160) || 'evidence-image';
  const id = `photo-${crypto.randomUUID()}`;
  const storagePath = `${projectId}/${reportId}/${id}-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  const upload = await actor.admin.storage.from('site-photos').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upload.error) return fail('Evidence image could not be stored.');
  const photo = { id, project_id: projectId, daily_report_id: reportId, name, url: '', storage_path: storagePath, caption: caption || null, captured_at: new Date().toISOString(), uploaded_by: actor.userId, evidence_type: evidenceType };
  const saved = await actor.admin.from('site_photos').insert(photo).select('*').single();
  if (saved.error) {
    await actor.admin.storage.from('site-photos').remove([storagePath]);
    return fail('Evidence metadata could not be saved.');
  }
  return Response.json({ photo: signedPhoto(saved.data) }, { status: 201 });
}
