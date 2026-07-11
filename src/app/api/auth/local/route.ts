import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

const DEMO_USERS: Record<string, { id: string; email: string; name: string; role: string }> = {
  'admin@buildtrack.com': { id: 'usr-1', email: 'admin@buildtrack.com', name: 'Arjun Adhikari', role: 'super_admin' },
  'director@buildtrack.com': { id: 'usr-2', email: 'director@buildtrack.com', name: 'Dr. Ramesh Thapa', role: 'project_director' },
  'pm@buildtrack.com': { id: 'usr-3', email: 'pm@buildtrack.com', name: 'Eng. Santosh Yadav', role: 'project_manager' },
  'planning@buildtrack.com': { id: 'usr-4', email: 'planning@buildtrack.com', name: 'Sujita Shrestha', role: 'planning_engineer' },
  'site@buildtrack.com': { id: 'usr-5', email: 'site@buildtrack.com', name: 'Binod Tamang', role: 'site_engineer' },
  'qs@buildtrack.com': { id: 'usr-6', email: 'qs@buildtrack.com', name: 'Gopal Bhatta', role: 'qs_billing_engineer' },
  'design@buildtrack.com': { id: 'usr-7', email: 'design@buildtrack.com', name: 'Sunita Pradhan', role: 'design_coordinator' },
  'qaqc@buildtrack.com': { id: 'usr-8', email: 'qaqc@buildtrack.com', name: 'Kiran KC', role: 'qa_qc_engineer' },
  'safety@buildtrack.com': { id: 'usr-9', email: 'safety@buildtrack.com', name: 'Prem Chaudhary', role: 'safety_officer' },
  'employer@buildtrack.com': { id: 'usr-10', email: 'employer@buildtrack.com', name: 'Govind Raj Pandey', role: 'employer_viewer' },
};

const DEV_PASSWORD_HASHES: Record<string, string> = {
  'admin@buildtrack.com': 'a694e84f2b660407754266f002bf366f512afd7cfe30c81030f0754ab8467894',
  'director@buildtrack.com': 'b93d7233cc55fa0b328287da91a7c4115231613acb4c571f7dc791a06ddf982e',
  'pm@buildtrack.com': '12315a34b708e294e082469019a1179c3389d1823748e7b8aaddfa082fe2046f',
  'planning@buildtrack.com': '11b28573909936b104322321ce6402eecc43bc35d713e8433161fbc2baf6d53b',
  'site@buildtrack.com': '3898c38138801ceef4e6928cb26c900e606fe36cdb0c8a28f27816059c079018',
  'qs@buildtrack.com': '4871ba064128efa26fe5971aebecd6836c9a532a5cd2576f2790f4dbe7e03150',
  'design@buildtrack.com': '81a32c2fca6b2ca8684ddfa607199c786328926da8a795a010d86b14cb10ce81',
  'qaqc@buildtrack.com': '4a843c5d593920926dfaa54c22d81992bd423d2170c9d73b6aa3f852428a7248',
  'safety@buildtrack.com': 'e12cfa57c9e0022612a3b8e3bbf3b33c4b67ecc47ebc98ab594fab5e1541b9b0',
  'employer@buildtrack.com': '3a37793ea99816b4565b42a627bc37b7fdf7fc98e7f4d2b89823743bb6f5d143',
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
  const hashes = getConfiguredHashes();
  const expectedHash = hashes[loginEmail];

  if (!expectedHash || !password) {
    return Response.json({ error: 'Local demo login is not enabled for this account.' }, { status: 401 });
  }

  const submittedHash = await sha256(password);
  if (submittedHash !== expectedHash) {
    return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const user = DEMO_USERS[loginEmail];
  if (!user) {
    return Response.json({ error: 'No local user exists for this account.' }, { status: 404 });
  }

  return Response.json({ local: true, user });
}
