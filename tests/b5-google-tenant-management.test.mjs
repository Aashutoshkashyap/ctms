import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('..', import.meta.url); const read = (p) => readFile(new URL(p, root), 'utf8');
test('B5 keeps Google tenant scoped and reconnects the canonical project connection', async () => {
  const callback = await read('src/app/api/google/callback/route.ts'); const connect = await read('src/app/api/google/connect/route.ts'); const upload = await read('src/app/api/google/upload/route.ts');
  assert.match(callback, /business_admin/); assert.match(callback, /existing\.data\.organization_id !== authorization\.project\.organizationId/); assert.match(callback, /update\(\{ connected_by/);
  assert.match(connect, /project_director', 'business_admin/); assert.match(upload, /authorizeGoogleUploadRequest/);
});
test('B5 retains server-only tokens and minimal Drive plus optional Gmail scopes', async () => {
  const workspace = await read('src/lib/server/googleWorkspace.ts'); const gmail = await read('src/app/api/google/gmail/send/route.ts');
  assert.match(workspace, /drive\.file/); assert.match(workspace, /spreadsheets/); assert.match(workspace, /GOOGLE_ENABLE_GMAIL_SEND/);
  assert.match(gmail, /authorizeGoogleRequest/); assert.match(gmail, /return NextResponse\.json\(\{ ok: true, id: sent\.id, threadId: sent\.threadId \}\)/);
});
