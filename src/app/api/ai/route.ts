import { getClientIp, rateLimit, rateLimitResponse } from '../../../lib/server/security';
import { authorizeProjectRequest, bearerToken } from '../../../lib/server/projectAuthorization';
import { AI_USE_CASES, type AiUseCase } from '../../../lib/aiAuthorization';
import { can } from '../../../lib/permissions';

const AI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function POST(request: Request) {
  if (!bearerToken(request)) return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `ai:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const body = await request.json().catch(() => null) as {
    prompt?: string;
    systemPrompt?: string;
    projectId?: string;
    useCase?: AiUseCase;
  } | null;

  if (typeof body?.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 100_000 ||
      typeof body.projectId !== 'string' || !body.projectId ||
      !body.useCase || !Object.hasOwn(AI_USE_CASES, body.useCase) ||
      (body.systemPrompt !== undefined && (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > 10_000))) {
    return Response.json({ error: 'A valid project, AI use case and bounded prompt are required.' }, { status: 400 });
  }
  const capability = AI_USE_CASES[body.useCase];
  const authorization = await authorizeProjectRequest(request, body.projectId, capability.feature, capability.access);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const userLimit = rateLimit({ key: `ai-user:${authorization.userId}:${authorization.project.organizationId}`, limit: 20, windowMs: 60_000 });
  if (!userLimit.allowed) return rateLimitResponse(userLimit.resetAt);
  // Respect an explicit AI restriction when the role has the existing AI capability.
  if (authorization.permissions.ai !== undefined && !can(authorization.role, 'ai', authorization.permissions)) {
    return Response.json({ error: 'AI access is disabled for this membership.' }, { status: 403 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: body.systemPrompt || 'You are a professional Design & Build construction project controls specialist.',
        },
        { role: 'user', content: body.prompt },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json(
      { error: data?.error?.message || `AI provider returned ${response.status}.` },
      { status: response.status }
    );
  }

  return Response.json({ content: data?.choices?.[0]?.message?.content || '' });
}
