import { AppError } from '@/server/errors';

/** Reads a stream into memory and aborts as soon as `max` bytes are exceeded. Never touches disk. */
export async function readBounded(stream: ReadableStream<Uint8Array> | null, max: number, tooLarge: () => AppError) {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function checkLength(request: Request, max: number, tooLarge: () => AppError) {
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > max) throw tooLarge();
}

const SMALL_JSON = 4096;

/** Small JSON request body, bounded. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const tooLarge = () => new AppError(413, 'Forespørselen er for stor.');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new AppError(415, 'Forespørselen må være JSON.');
  }
  checkLength(request, SMALL_JSON, tooLarge);
  const bytes = await readBounded(request.body, SMALL_JSON, tooLarge);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, 'Forespørselen er ugyldig.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AppError(400, 'Forespørselen er ugyldig.');
  return value as Record<string, unknown>;
}

/** Multipart body, bounded to `max` bytes in memory, parsed with the platform parser. */
export async function readForm(request: Request, max: number): Promise<FormData> {
  const tooLarge = () => new AppError(413, 'Opptaket er for stort.');
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) throw new AppError(415, 'Forespørselen må være multipart.');
  checkLength(request, max, tooLarge);
  const bytes = await readBounded(request.body, max, tooLarge);
  try {
    return await new Response(bytes, { headers: { 'content-type': type } }).formData();
  } catch {
    throw new AppError(400, 'Forespørselen er ugyldig.');
  }
}
