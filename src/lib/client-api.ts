export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout((init?.method ?? "GET").toUpperCase() === "GET" ? 15_000 : 90_000);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      credentials: "same-origin",
      headers: {
        ...(init?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(timeout.aborted
      ? "Det tok for lang tid. Prøv igjen."
      : "Vi fikk ikke kontakt. Kontroller forbindelsen og prøv igjen.", 0);
  }
  const body = await response.json().catch(() => null);
  if (response.ok && body === null)
    throw new ApiError("Vi fikk ikke lest svaret. Prøv igjen.", response.status);
  if (!response.ok)
    throw new ApiError(
      typeof body?.error === "string"
        ? body.error
        : "Vi fikk ikke kontakt. Prøv igjen.",
      response.status,
    );
  return body as T;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : "Noe gikk galt. Prøv igjen.";
}
export function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return api(path, {
    method: "POST",
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
export function duration(start: string, end: string | null) {
  return Math.max(
    1,
    Math.round(
      (new Date(end ?? start).getTime() - new Date(start).getTime()) / 60000,
    ),
  );
}
