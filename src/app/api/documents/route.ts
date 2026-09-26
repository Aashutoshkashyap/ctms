import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { canTransitionDocument, cleanDocumentText, isDocumentStatus, validDocumentDate, type DocumentStatus } from '../../../lib/documentLifecycle';

export const dynamic = 'force-dynamic';
const editingRoles = new Set(['business_admin', 'project_director', 'project_manager']);
const approvingRoles = new Set(['business_admin', 'project_director', 'project_manager']);
const categories = new Set(['contract', 'security', 'insurance', 'rfi', 'notice', 'approval', 'variation', 'test_record', 'permit', 'compliance_report', 'ipc_claim', 'ipc_certificate', 'payment_proof', 'safety_report', 'quality_report', 'handover', 'other']);

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function documentInput(value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const ref_number = cleanDocumentText(row.ref_number, 120); const title = cleanDocumentText(row.title, 500);
  const category = cleanDocumentText(row.category, 60); const version = cleanDocumentText(row.version, 80) || 'Rev 0';
  const submitted_date = cleanDocumentText(row.submitted_date, 10);
  if (!ref_number || !title || !categories.has(category) || !validDocumentDate(submitted_date) || !submitted_date) return null;
  return { ref_number, title, category, version, submitted_date, remarks: cleanDocumentText(row.remarks, 4000) || null };
}

async function actorName(actor: { admin: any; project: { id: string }; userId: string; role: string }) {
  const membership = await actor.admin.from('project_users').select('name').eq('project_id', actor.project.id).eq('auth_user_id', actor.userId).maybeSingle();
  return cleanDocumentText(membership.data?.name, 160) || actor.role;
}

async function loadDocument(actor: any, documentId: string) {
  return actor.admin.from('document_register').select('*').eq('id', documentId).eq('project_id', actor.project.id).maybeSingle();
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'documents', 'read');
  if ('error' in actor) return bad(actor.error, actor.status);
  const documents = await actor.admin.from('document_register').select('*').eq('project_id', projectId).order('submitted_date', { ascending: false });
  if (documents.error) return bad('Controlled documents could not be loaded.');
  return Response.json({ documents: documents.data || [], history: [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = cleanDocumentText(body?.projectId, 120); const actor = await authorizeProjectRequest(request, projectId, 'documents', 'write');
  if ('error' in actor) return bad(actor.error, actor.status);
  const input = documentInput(body?.document); const id = cleanDocumentText((body?.document as Record<string, unknown> | undefined)?.id, 160);
  if (!input || !id) return bad('Reference, title, category, submitted date and document ID are required.');
  const record = { id, project_id: projectId, ...input, status: 'draft', owner: await actorName(actor), action_date: null };
  const saved = await actor.admin.from('document_register').insert(record).select('*').single();
  if (saved.error) return bad(saved.error.code === '23505' ? 'That document reference already exists in this project.' : 'Controlled document could not be created.');
  return Response.json({ document: saved.data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = cleanDocumentText(body?.projectId, 120); const documentId = cleanDocumentText(body?.documentId, 160);
  const actor = await authorizeProjectRequest(request, projectId, 'documents', 'write');
  if ('error' in actor) return bad(actor.error, actor.status);
  const loaded = await loadDocument(actor, documentId);
  if (!loaded.data) return bad('Controlled document was not found.', 404);
  const document = loaded.data; const elevated = editingRoles.has(actor.role);
  if (body?.action === 'update') {
    if (!['draft', 'rejected'].includes(document.status) || !elevated) return bad('Only an authorized project manager may edit a draft or rejected document.', 403);
    const input = documentInput(body.document); if (!input) return bad('Reference, title, category and submitted date are required.');
    const saved = await actor.admin.from('document_register').update(input).eq('id', documentId).eq('project_id', projectId).eq('status', document.status).select('*').single();
    if (saved.error || !saved.data) return bad('Document changed elsewhere. Refresh and retry.', 409);
    return Response.json({ document: saved.data });
  }
  const to = body?.action;
  if (!isDocumentStatus(to) || !canTransitionDocument(document.status as DocumentStatus, to)) return bad('Invalid document workflow transition.', 409);
  if (to === 'under_review' && !elevated) return bad('Only an authorized project manager may submit this document.', 403);
  if (['approved', 'rejected'].includes(to) && !approvingRoles.has(actor.role)) return bad('Only the Project Director, Project Manager or Business Admin can decide this document.', 403);
  const saved = await actor.admin.from('document_register').update({ status: to, action_date: day() }).eq('id', documentId).eq('project_id', projectId).eq('status', document.status).select('*').single();
  if (saved.error || !saved.data) return bad('Document changed elsewhere. Refresh and retry.', 409);
  return Response.json({ document: saved.data });
}
