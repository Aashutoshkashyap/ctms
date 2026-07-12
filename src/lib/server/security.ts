type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type DemoSessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type DemoSessionPayload = {
  user: DemoSessionUser;
  expiresAt: number;
};

export const DEMO_SESSION_COOKIE = 'buildtrack_demo_session';
export const DEMO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const buckets = new Map<string, { count: number; resetAt: number }>();

function toBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret() {
  const configured = process.env.BUILDTRACK_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'buildtrack-local-development-session-key';
  return '';
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createDemoSession(user: DemoSessionUser) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('Demo session signing is not configured.');
  const payload: DemoSessionPayload = {
    user,
    expiresAt: Date.now() + DEMO_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function readDemoSession(value?: string | null): Promise<DemoSessionUser | null> {
  if (!value) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = await hmac(encoded, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as DemoSessionPayload;
    if (!payload.user?.email || !payload.user?.role || payload.expiresAt <= Date.now()) return null;
    return payload.user;
  } catch {
    return null;
  }
}

export function secureCompare(left: string, right: string) {
  return constantTimeEqual(left, right);
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'local';
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(limit - 1, 0), resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(limit - current.count, 0), resetAt: current.resetAt };
}

export function rateLimitResponse(resetAt: number) {
  return Response.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': `${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))}`,
        'Cache-Control': 'no-store',
      },
    }
  );
}
