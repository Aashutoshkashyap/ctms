import { createClient } from '@supabase/supabase-js';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../lib/server/security';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `business-contact:${ip}`, limit: 5, windowMs: 60 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const body = await request.json().catch(() => null) as {
    businessName?: string;
    contactName?: string;
    contactEmail?: string;
    phone?: string;
    message?: string;
  } | null;
  const businessName = body?.businessName?.trim();
  const contactName = body?.contactName?.trim();
  const contactEmail = body?.contactEmail?.trim().toLowerCase();
  if (!businessName || !contactName || !contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    return Response.json({ error: 'Business name, contact name and a valid email are required.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return Response.json({ error: 'Contact service is temporarily unavailable.' }, { status: 503 });
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from('business_inquiries').insert({
    business_name: businessName.slice(0, 160),
    contact_name: contactName.slice(0, 120),
    contact_email: contactEmail.slice(0, 254),
    phone: body?.phone?.trim().slice(0, 40) || null,
    message: body?.message?.trim().slice(0, 2000) || null,
    status: 'new',
  });
  if (error) return Response.json({ error: 'Could not save the request. Please try again.' }, { status: 400 });
  return Response.json({ ok: true, message: 'Request received. The BuildTrack team can now review it in the platform console.' }, { status: 201 });
}
