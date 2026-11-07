export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
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
export function post<T>(path: string, body?: unknown): Promise<T> {
  return api(path, {
    method: "POST",
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
