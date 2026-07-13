import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, message: 'Unauthorized keep-alive request.' }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: true, mode: 'local-only', message: 'Supabase config is not set; app remains locally functional.' });
  }
  const baseUrl = url;
  const publicKey = anonKey;

  const startedAt = new Date().toISOString();
  const checks: Array<{ name: string; ok: boolean; status?: number; message?: string }> = [];

  async function pingRest() {
    try {
      const response = await fetch(`${baseUrl}/rest/v1/projects?select=id&limit=1`, {
        headers: { apikey: publicKey },
        cache: 'no-store',
      });
      checks.push({ name: 'rest-projects', ok: response.ok, status: response.status });
    } catch (error) {
      checks.push({ name: 'rest-projects', ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function pingStorage(bucket: string) {
    const serverKey = secretKey;
    if (!serverKey) {
      checks.push({ name: `storage-${bucket}`, ok: false, message: 'Server storage key is not configured.' });
      return;
    }
    try {
      const admin = createClient(baseUrl, serverKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await admin.storage.from(bucket).list('', { limit: 1 });
      checks.push({ name: `storage-${bucket}`, ok: !error, message: error?.message });
    } catch (error) {
      checks.push({ name: `storage-${bucket}`, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await Promise.all([pingRest(), pingStorage('site-photos'), pingStorage('project-documents')]);

  const cloudReachable = checks.some(check => check.ok);
  return NextResponse.json({
    ok: true,
    cloud_reachable: cloudReachable,
    started_at: startedAt,
    checked_at: new Date().toISOString(),
    checks,
    message: cloudReachable
      ? 'BuildTrack cloud keep-alive completed.'
      : 'BuildTrack keep-alive completed; queued local continuity remains active until cloud responds.',
  });
}
