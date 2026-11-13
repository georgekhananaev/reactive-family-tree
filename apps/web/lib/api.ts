/* Talking to the server from the browser. A failed request throws an error whose message is written for the person to read. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

/* When this browser last changed something, so a change it sees soon after is known to be its own. */
export const activity = { lastWrite: 0 };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (method !== 'GET') activity.lastWrite = Date.now();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'The server cannot be reached. Check that it is still running.');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
  if (!response.ok) throw new ApiError(response.status, data.error ?? data.message ?? 'Something went wrong.', data.details);
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
};

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');
