import { NextResponse } from 'next/server';
import { authorizePlatformOwner } from '../../../../lib/server/platformAdmin';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

const allowedTypes = new Set(['application/pdf','image/jpeg','image/png','image/webp']);

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-payment-proof:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const form = await request.formData();
  const file = form.get('file');
  const organizationId = String(form.get('organizationId') || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!(file instanceof File) || !organizationId) return NextResponse.json({ error: 'Business and payment proof are required.' }, { status: 400 });
  if (file.size <= 0 || file.size > 10 * 1024 * 1024 || !allowedTypes.has(file.type)) return NextResponse.json({ error: 'Use a PDF, JPG, PNG or WebP payment proof up to 10 MB.' }, { status: 400 });
  const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
  const storagePath = `${organizationId}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${extension}`;
  const { error } = await authorization.admin.storage.from('subscription-payments').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ storagePath, fileName: file.name.slice(0, 180) }, { status: 201 });
}

export async function GET(request: Request) {
  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const storagePath = new URL(request.url).searchParams.get('path') || '';
  if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) return NextResponse.json({ error: 'A valid payment proof path is required.' }, { status: 400 });
  const { data, error } = await authorization.admin.storage.from('subscription-payments').createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Payment proof is unavailable.' }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
