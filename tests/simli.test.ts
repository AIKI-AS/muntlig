import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/server/errors';
import { requireAvatarStart, type AvatarConfig } from '../src/server/media/config';
import { createAvatarToken } from '../src/server/media/simli';

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  globalThis.fetch = savedFetch;
});

const config: AvatarConfig = { apiKey: 'test-key-not-real', faceId: 'bf13113a-355a-4d97-8b90-4edccd1da7b2' };
const refused = (status: number) => (error: unknown) => error instanceof AppError && error.status === status;

test('avatar start fails closed without the provider switch, ElevenLabs, a Simli key or a valid face id', () => {
  process.env.PROVIDER_CALLS_ENABLED = 'true';
  process.env.ELEVENLABS_API_KEY = 'test-key-not-real';
  process.env.SIMLI_API_KEY = 'test-key-not-real';
  delete process.env.SIMLI_FACE_ID;
  process.env.SIMLI_FACE_ID = 'not-a-uuid';
  assert.throws(() => requireAvatarStart(), refused(503));
  delete process.env.SIMLI_FACE_ID;
  process.env.PROVIDER_CALLS_ENABLED = 'false';
  assert.throws(() => requireAvatarStart(), refused(503));
  process.env.PROVIDER_CALLS_ENABLED = 'true';
  delete process.env.ELEVENLABS_API_KEY;
  assert.throws(() => requireAvatarStart(), refused(503));
  process.env.ELEVENLABS_API_KEY = 'test-key-not-real';
  delete process.env.SIMLI_API_KEY;
  assert.throws(() => requireAvatarStart(), refused(503));
});

test('provider failures and malformed responses never leak provider detail', async () => {
  const secret = 'provider-detail-and-token-secret';
  const leaks = (error: unknown) => error instanceof AppError && !error.message.includes(secret);
  for (const status of [400, 401, 422, 500]) {
    globalThis.fetch = async () => Response.json({ detail: secret, session_token: secret }, { status });
    await assert.rejects(createAvatarToken(config), (error) => leaks(error) && refused(502)(error));
  }
  globalThis.fetch = async () => new Response(secret, { status: 429 });
  await assert.rejects(createAvatarToken(config), (error) => leaks(error) && refused(429)(error));
  const malformed: Array<() => Response> = [
    () => new Response(secret),
    () => Response.json({ detail: secret }),
    () => Response.json({ session_token: '' }),
    () => Response.json({ session_token: 42 }),
    () => Response.json({ session_token: `${secret} with space` }),
    () => Response.json({ session_token: 'x'.repeat(9000) }),
  ];
  for (const make of malformed) {
    globalThis.fetch = async () => make();
    await assert.rejects(createAvatarToken(config), (error) => leaks(error) && refused(502)(error));
  }
  globalThis.fetch = async () => { throw new Error(secret); };
  await assert.rejects(createAvatarToken(config), (error) => leaks(error) && refused(504)(error));
});

test('oversized streamed provider responses are cancelled before the rest is read', async () => {
  let cancelled = false;
  let pulls = 0;
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++pulls === 1) controller.enqueue(new Uint8Array(65_537));
      else controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }));
  await assert.rejects(createAvatarToken(config), refused(502));
  assert.equal(cancelled, true);
});
