import { cookies } from 'next/headers';
import {
  createDemoSession,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_MAX_AGE_SECONDS,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  readDemoSession,
  secureCompare,
} from '../../../../lib/server/security';

const DEMO_USERS: Record<string, { id: string; email: string; name: string; role: string }> = {
  'admin@buildtrack.com': { id: 'usr-1', email: 'admin@buildtrack.com', name: 'Arjun Adhikari', role: 'super_admin' },
  'businessadmin@buildtrack.com': { id: 'usr-11', email: 'businessadmin@buildtrack.com', name: 'Nisha Karki', role: 'business_admin' },
  'director@buildtrack.com': { id: 'usr-2', email: 'director@buildtrack.com', name: 'Dr. Ramesh Thapa', role: 'project_director' },
  'pm@buildtrack.com': { id: 'usr-3', email: 'pm@buildtrack.com', name: 'Eng. Santosh Yadav', role: 'project_manager' },
  'planning@buildtrack.com': { id: 'usr-4', email: 'planning@buildtrack.com', name: 'Sujita Shrestha', role: 'planning_engineer' },
  'site@buildtrack.com': { id: 'usr-5', email: 'site@buildtrack.com', name: 'Binod Tamang', role: 'site_engineer' },
  'qs@buildtrack.com': { id: 'usr-6', email: 'qs@buildtrack.com', name: 'Gopal Bhatta', role: 'qs_billing_engineer' },
  'design@buildtrack.com': { id: 'usr-7', email: 'design@buildtrack.com', name: 'Sunita Pradhan', role: 'design_coordinator' },
  'qaqc@buildtrack.com': { id: 'usr-8', email: 'qaqc@buildtrack.com', name: 'Kiran KC', role: 'qa_qc_engineer' },
  'safety@buildtrack.com': { id: 'usr-9', email: 'safety@buildtrack.com', name: 'Prem Chaudhary', role: 'safety_officer' },
  'employer@buildtrack.com': { id: 'usr-10', email: 'employer@buildtrack.com', name: 'Govind Raj Pandey', role: 'employer_viewer' },
  'employee@buildtrack.com': { id: 'usr-12', email: 'employee@buildtrack.com', name: 'Maya Rai', role: 'field_employee' },
  'accountant@buildtrack.com': { id: 'usr-13', email: 'accountant@buildtrack.com', name: 'Sarita Poudel', role: 'accountant' },
  'store@buildtrack.com': { id: 'usr-14', email: 'store@buildtrack.com', name: 'Raju Gurung', role: 'store_officer' },
};

const DEV_PASSWORD_HASHES: Record<string, string> = {
  'admin@buildtrack.com': 'e875eabef9aa055350481cb7519af33124185b62eb38ca0897ce5767f73de93c',
  'director@buildtrack.com': '8484da40847caf78a24126fdb17cbf9182288343e3e3ef4d39d732f647c75ead',
  'pm@buildtrack.com': 'f3843f841dc4f4422cf060e7c52f2b095fc4272b388cbad95818ddc54e82fc58',
  'planning@buildtrack.com': '10c301f0c4fe4a9924ecc71c8ce854f48b47f56a98d7ccab9e91540160d9b77a',
  'site@buildtrack.com': '2ff296772bd2c62aab7cc8bab9f0f45960e2fbe7be01d935491da5b0b87b6255',
  'qs@buildtrack.com': '4e65e090b536afafdea8aa2e75e9468101f5fe8ff558dbc5179ea42144afb51b',
  'design@buildtrack.com': 'b876f82bfe5a047c17004bc5193bc15a3d4cb7a0e50a45cb2aff1da67e2f0ce2',
  'qaqc@buildtrack.com': '6d7a2db20135fa89fba519865f405ff0132fc40fa35d720d7b71e2fd7ab6a0f5',
  'safety@buildtrack.com': '8d61f0a46e3695c7693de9d405f40cb39bc26925d4dc33215a432fd98333ad9f',
  'employer@buildtrack.com': '558097718b4d2a4cfbf02900a594d2b09bdfa20e03810c11d12e8f31d79eeb70',
  'businessadmin@buildtrack.com': '30b5f8a2eb304edffc7aaf9ef181d04789215ccdcf495ba62675e1fdcbc3077d',
  'employee@buildtrack.com': '7ddf4257aedb1f782455d722c97b3eabad65f4b0cdc7240fe9b2e953890aa785',
  'accountant@buildtrack.com': 'a93747747f8ee142bc9085e370e447f8a32eb75d2b783dd7ef13593f0fd8eb5a',
  'store@buildtrack.com': 'a8b8747e639166ca68603768f75eb987b8ac3961280fc7f03c5fa9b329ee04d5',
};

function resolveLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'admin') return 'admin@buildtrack.com';
  if (normalized === 'director') return 'director@buildtrack.com';
  return normalized;
}

function getConfiguredHashes() {
  if (process.env.BUILDTRACK_DEMO_PASSWORD_HASHES_JSON) {
    try {
      return JSON.parse(process.env.BUILDTRACK_DEMO_PASSWORD_HASHES_JSON) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return process.env.NODE_ENV === 'production' ? {} : DEV_PASSWORD_HASHES;
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `local-auth:${ip}`, limit: 8, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const loginEmail = resolveLoginIdentifier(body?.email || '');
  const password = body?.password || '';
  const accountLimit = rateLimit({ key: `local-auth-account:${loginEmail || 'unknown'}`, limit: 12, windowMs: 15 * 60_000 });
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit.resetAt);
  const hashes = getConfiguredHashes();
  const expectedHash = hashes[loginEmail];

  if (!expectedHash || !password) {
    return Response.json({ error: 'Local demo login is not enabled for this account.' }, { status: 401 });
  }

  const submittedHash = await sha256(password);
  if (!secureCompare(submittedHash, expectedHash)) {
    return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const user = DEMO_USERS[loginEmail];
  if (!user) {
    return Response.json({ error: 'No local user exists for this account.' }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, await createDemoSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
  });
  return Response.json({ local: true, user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  const cookieStore = await cookies();
  const user = await readDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: 'No verified demo session.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ local: true, user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
