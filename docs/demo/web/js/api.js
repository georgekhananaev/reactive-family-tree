/* Talking to the server. A failed request throws an error whose message is written for the person to read. */

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/* When this browser last changed something, so a change it sees soon after is known to be its own. */
export const activity = { lastWrite: 0 };

async function call(method, path, body) {
  if (method !== 'GET') activity.lastWrite = Date.now();
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'The server cannot be reached. Check that it is still running.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Something went wrong.', data.details);
  return data;
}

export const api = {
  get: (path) => call('GET', path),
  post: (path, body = {}) => call('POST', path, body),
  patch: (path, body) => call('PATCH', path, body),
  del: (path) => call('DELETE', path),
};
