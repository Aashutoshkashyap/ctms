import { authorizeOrganizationHrRequest } from '../../../../lib/server/organizationHrAuthorization';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';
const BUCKET = 'employee-documents';

function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'document'; }

export async function POST(request: Request) {
  const limit = rateLimit({ key: `hr-documents:${getClientIp(request)}`, limit: 12, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const form = await request.formData().catch(() => null);
  const organizationId = String(form?.get('organizationId') || ''); const employeeId = String(form?.get('employeeId') || '');
  const documentType = String(form?.get('documentType') || '').trim(); const file = form?.get('file');
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (!employeeId || !documentType || !(file instanceof File) || !file.size) return Response.json({ error: 'Employee, document type and file are required.' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: 'Employee documents must be 15 MB or smaller.' }, { status: 413 });
  const employee = await actor.admin.from('employee_records').select('id').eq('id', employeeId).eq('organization_id', organizationId).maybeSingle();
  if (!employee.data) return Response.json({ error: 'Employee record was not found.' }, { status: 404 });
  const storagePath = `${organizationId}/${employeeId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const upload = await actor.admin.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upload.error) return Response.json({ error: 'Document storage failed; nothing was recorded.' }, { status: 400 });
  const { data, error } = await actor.admin.from('employee_documents').insert({ organization_id: organizationId, employee_id: employeeId, document_type: documentType, original_filename: file.name, mime_type: file.type || null, size_bytes: file.size, storage_provider: 'SUPABASE_STORAGE', storage_path: storagePath, status: 'uploaded', uploaded_by: actor.userId }).select('*').single();
  if (error || !data) { await actor.admin.storage.from(BUCKET).remove([storagePath]); return Response.json({ error: 'Document metadata failed; upload was rolled back.' }, { status: 400 }); }
  return Response.json({ document: data }, { status: 201 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams; const organizationId = params.get('organizationId') || ''; const documentId = params.get('documentId') || '';
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const document = await actor.admin.from('employee_documents').select('storage_path,original_filename').eq('id', documentId).eq('organization_id', organizationId).eq('status', 'uploaded').maybeSingle();
  if (!document.data) return Response.json({ error: 'Employee document was not found.' }, { status: 404 });
  const signed = await actor.admin.storage.from(BUCKET).createSignedUrl(document.data.storage_path, 300);
  if (signed.error || !signed.data?.signedUrl) return Response.json({ error: 'A temporary document link could not be created.' }, { status: 400 });
  return Response.json({ name: document.data.original_filename, url: signed.data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
