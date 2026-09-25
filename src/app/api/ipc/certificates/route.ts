import { authorizeProjectRequest } from '../../../../lib/server/projectAuthorization';
import { calculateCertificate, validCertificateTransition, type PaymentCertificateStatus } from '../../../../lib/paymentCertificate';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const certificateStatuses = new Set(['draft', 'submitted', 'review', 'approved', 'certified', 'rejected']);
const deductionKinds = new Set(['retention', 'advance_recovery', 'other_contract_deduction']);

async function certificate(actor: any, projectId: string, certificateId: string) {
  return actor.admin.from('payment_certificates').select('*').eq('id', certificateId).eq('organization_id', actor.project.organizationId).eq('project_id', projectId).maybeSingle();
}

async function refreshTotals(actor: any, record: any) {
  const deductions = await actor.admin.from('payment_certificate_deductions').select('id,deduction_kind,amount,description,created_by,created_at').eq('organization_id', actor.project.organizationId).eq('payment_certificate_id', record.id).order('created_at');
  if (deductions.error) return { error: 'Certificate deductions could not be loaded.' };
  try {
    const totals = calculateCertificate(Number(record.gross_certified_amount), (deductions.data || []).map((item: any) => ({ kind: item.deduction_kind, amount: Number(item.amount), description: item.description })));
    const saved = await actor.admin.from('payment_certificates').update({ total_deductions: totals.totalDeductions, net_certified_amount: totals.netCertifiedAmount, deduction_snapshot: deductions.data || [], updated_at: new Date().toISOString() }).eq('id', record.id).eq('organization_id', actor.project.organizationId).eq('status', 'draft').select('*').single();
    return saved.error ? { error: 'Certificate totals could not be updated.' } : { certificate: saved.data, deductions: deductions.data || [] };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Certificate deductions are invalid.' }; }
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'ipc', 'read');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const [certificates, periods] = await Promise.all([
    actor.admin.from('payment_certificates').select('*').eq('organization_id', actor.project.organizationId).eq('project_id', projectId).order('certificate_date', { ascending: false }),
    actor.admin.from('ipc_valuation_periods').select('id,reference_number,period_start,period_end,status,certified_at,created_by,certified_by').eq('organization_id', actor.project.organizationId).eq('project_id', projectId).eq('status', 'certified').order('certified_at', { ascending: false }),
  ]);
  if (certificates.error || periods.error) return Response.json({ error: 'Payment certificates could not be loaded.' }, { status: 400 });
  const ids = (certificates.data || []).map((item: any) => item.id);
  const deductions = ids.length ? await actor.admin.from('payment_certificate_deductions').select('*').eq('organization_id', actor.project.organizationId).in('payment_certificate_id', ids).order('created_at') : { data: [], error: null };
  if (deductions.error) return Response.json({ error: 'Certificate deductions could not be loaded.' }, { status: 400 });
  return Response.json({ certificates: certificates.data || [], deductions: deductions.data || [], certifiedValuations: periods.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const limited = rateLimit({ key: `payment-certificate:${getClientIp(request)}`, limit: 20, windowMs: 60_000 });
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId);
  const actor = await authorizeProjectRequest(request, projectId, 'ipc', 'write');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (body?.action === 'create') return createCertificate(actor, projectId, body);
  if (body?.action === 'add_deduction') return addDeduction(actor, projectId, body);
  return Response.json({ error: 'Unsupported payment certificate action.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId); const certificateId = text(body?.certificateId); const action = text(body?.action);
  const actor = await authorizeProjectRequest(request, projectId, 'ipc', 'write');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const loaded = await certificate(actor, projectId, certificateId);
  if (!loaded.data) return Response.json({ error: 'Payment certificate was not found.' }, { status: 404 });
  const current = loaded.data;
  if (action === 'remove_deduction') {
    if (current.status !== 'draft') return Response.json({ error: 'Deductions can only be changed while the certificate is a draft.' }, { status: 409 });
    const removed = await actor.admin.from('payment_certificate_deductions').delete().eq('id', text(body?.deductionId)).eq('organization_id', actor.project.organizationId).eq('payment_certificate_id', certificateId);
    if (removed.error) return Response.json({ error: 'Deduction could not be removed.' }, { status: 400 });
    const totals = await refreshTotals(actor, current); return 'error' in totals ? Response.json(totals, { status: 400 }) : Response.json(totals);
  }
  const target: Record<string, PaymentCertificateStatus> = { submit: 'submitted', review: 'review', approve: 'approved', certify: 'certified', reject: 'rejected' };
  const next = target[action];
  if (!next || !validCertificateTransition(current.status as PaymentCertificateStatus, next)) return Response.json({ error: 'Invalid payment certificate transition.' }, { status: 409 });
  if (['review', 'approve', 'certify', 'reject'].includes(action) && actor.role !== 'project_director') return Response.json({ error: 'Only the Project Director can review or certify a payment certificate.' }, { status: 403 });
  if (['review', 'approve', 'certify', 'reject'].includes(action) && current.created_by === actor.userId) return Response.json({ error: 'The certificate creator cannot review or certify it.' }, { status: 403 });
  const patch: any = { status: next, updated_at: new Date().toISOString() };
  if (next === 'submitted') { patch.submitted_by = actor.userId; patch.submitted_at = patch.updated_at; }
  if (next === 'review') { patch.reviewed_by = actor.userId; patch.reviewed_at = patch.updated_at; }
  if (next === 'approved') { patch.approved_by = actor.userId; patch.approved_at = patch.updated_at; }
  if (next === 'certified') { patch.certified_by = actor.userId; patch.certified_at = patch.updated_at; }
  if (next === 'rejected') patch.rejection_reason = text(body?.rejectionReason) || 'Rejected by reviewer';
  const saved = await actor.admin.from('payment_certificates').update(patch).eq('id', certificateId).eq('organization_id', actor.project.organizationId).eq('project_id', projectId).eq('status', current.status).select('*').single();
  return saved.error || !saved.data ? Response.json({ error: 'Payment certificate changed elsewhere. Refresh and retry.' }, { status: 409 }) : Response.json({ certificate: saved.data });
}

async function createCertificate(actor: any, projectId: string, body: Record<string, unknown>) {
  const valuationPeriodId = text(body.valuationPeriodId); const certificateNumber = text(body.certificateNumber); const certificateDate = text(body.certificateDate);
  if (!valuationPeriodId || !certificateNumber || !certificateDate) return Response.json({ error: 'Certified IPC, certificate number and date are required.' }, { status: 400 });
  const valuation = await actor.admin.from('ipc_valuation_periods').select('*').eq('id', valuationPeriodId).eq('organization_id', actor.project.organizationId).eq('project_id', projectId).eq('status', 'certified').maybeSingle();
  if (!valuation.data) return Response.json({ error: 'A same-project certified IPC valuation is required.' }, { status: 409 });
  const lines = await actor.admin.from('ipc_valuation_lines').select('*').eq('organization_id', actor.project.organizationId).eq('valuation_period_id', valuationPeriodId);
  if (lines.error || !lines.data?.length) return Response.json({ error: 'The certified IPC has no valuation lines.' }, { status: 409 });
  try {
    const gross = lines.data.reduce((sum: number, line: any) => sum + Number(line.current_value || 0), 0);
    const totals = calculateCertificate(gross, []);
    const saved = await actor.admin.from('payment_certificates').insert({ organization_id: actor.project.organizationId, project_id: projectId, valuation_period_id: valuationPeriodId, certificate_number: certificateNumber, certificate_date: certificateDate, gross_certified_amount: totals.grossCertifiedAmount, total_deductions: 0, net_certified_amount: totals.netCertifiedAmount, valuation_snapshot: { valuation: valuation.data, lines: lines.data, grossCertifiedAmount: totals.grossCertifiedAmount }, deduction_snapshot: [], created_by: actor.userId }).select('*').single();
    return saved.error ? Response.json({ error: saved.error.code === '23505' ? 'This certified IPC or certificate number is already in use.' : 'Payment certificate could not be created.' }, { status: saved.error.code === '23505' ? 409 : 400 }) : Response.json({ certificate: saved.data }, { status: 201 });
  } catch { return Response.json({ error: 'Certified IPC valuation contains invalid monetary values.' }, { status: 400 }); }
}

async function addDeduction(actor: any, projectId: string, body: Record<string, unknown>) {
  const certificateId = text(body.certificateId); const kind = text(body.kind); const amount = Number(body.amount);
  if (!certificateId || !deductionKinds.has(kind) || !Number.isFinite(amount) || amount < 0) return Response.json({ error: 'A valid deduction type and non-negative amount are required.' }, { status: 400 });
  const loaded = await certificate(actor, projectId, certificateId); if (!loaded.data || loaded.data.status !== 'draft') return Response.json({ error: 'Deductions can only be changed on a draft certificate.' }, { status: 409 });
  const inserted = await actor.admin.from('payment_certificate_deductions').insert({ organization_id: actor.project.organizationId, payment_certificate_id: certificateId, deduction_kind: kind, amount, description: text(body.description) || null, created_by: actor.userId }).select('*').single();
  if (inserted.error) return Response.json({ error: 'Deduction could not be saved.' }, { status: 400 });
  const totals = await refreshTotals(actor, loaded.data); return 'error' in totals ? Response.json(totals, { status: 400 }) : Response.json({ ...totals, deduction: inserted.data }, { status: 201 });
}
