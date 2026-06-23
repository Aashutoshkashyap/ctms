const AI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as {
    prompt?: string;
    systemPrompt?: string;
  } | null;

  if (!body?.prompt) {
    return Response.json({ error: 'A prompt is required.' }, { status: 400 });
  }

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
