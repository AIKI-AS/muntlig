import type { ZodType } from 'zod';
import { checkOrigin, jsonError } from './context';
import { AppError } from './errors';
import { LIMITS } from '../lib/limits';

/** Runs a route body: origin check for unsafe methods, JSON success, mapped errors. */
export async function route(request: Request, run: () => Promise<unknown>): Promise<Response> {
  try {
    checkOrigin(request);
    return Response.json(await run(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

/** Reads the request body, stopping as soon as the cap is exceeded (Content-Length may be absent or false). */
export async function readCapped(request: Request, maxBytes: number): Promise<Buffer<ArrayBuffer>> {
  const tooBig = () => new AppError(413, 'Forespørselen er for stor.');
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooBig();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes: number = LIMITS.jsonBodyBytes): Promise<T> {
  return schema.parse(JSON.parse((await readCapped(request, maxBytes)).toString('utf8')));
}
