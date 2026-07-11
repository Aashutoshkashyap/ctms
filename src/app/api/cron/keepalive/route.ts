import { NextResponse } from 'next/server';

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
  if (!url || !anonKey) {
    return NextResponse.json({ ok: true, mode: 'local-only', message: 'Supabase config is not set; app remains locally functional.' });
  }

  const startedAt = new Date().toISOString();
  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
  };
  const checks: Array<{ name: string; ok: boolean; status?: number; message?: string }> = [];

  async function ping(name: string, endpoint: string) {
    try {
      const response = await fetch(endpoint, { headers, cache: 'no-store' });
      checks.push({ name, ok: response.ok, status: response.status });
    } catch (error) {
      checks.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await Promise.all([
    ping('rest-projects', `${url}/rest/v1/projects?select=id&limit=1`),
    ping('storage-site-photos', `${url}/storage/v1/bucket/site-photos`),
    ping('storage-project-documents', `${url}/storage/v1/bucket/project-documents`),
  ]);

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
