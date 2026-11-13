/*
 * Live updates. Each open browser holds one event stream. The server only ever
 * says "something changed" (with the new sequence number) or "your inbox
 * changed". Browsers then fetch what they are allowed to see, so nothing
 * private can leak through the stream.
 */

interface Listener {
  userId: string | null;
  send(event: string, data: unknown): void;
}

const BEAT_MS = 25000;

export class Hub {
  private readonly listeners = new Set<Listener>();

  /* A stream for one browser, as a web response. `userId` is null for a visitor. */
  stream(userId: string | null, signal?: AbortSignal): Response {
    const encoder = new TextEncoder();
    let detach = () => {};
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const write = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            detach();           // the browser has gone
          }
        };
        const listener: Listener = { userId, send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) };
        const beat = setInterval(() => write(': still here\n\n'), BEAT_MS);
        detach = () => {
          clearInterval(beat);
          this.listeners.delete(listener);
        };
        this.listeners.add(listener);
        signal?.addEventListener('abort', detach, { once: true });
        write(': connected\n\n');
      },
      cancel: () => detach(),
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  private send(event: string, data: unknown, userIds: string[] | null = null): void {
    for (const listener of this.listeners) {
      if (!userIds || (listener.userId !== null && userIds.includes(listener.userId))) listener.send(event, data);
    }
  }

  /* The family changed: everyone refreshes their own view of it. */
  changed(seq: number): void {
    this.send('changed', { seq });
  }

  /* Something waits for these people: a suggestion, a draft, a decision. */
  inbox(userIds: (string | null | undefined)[]): void {
    const signedIn = userIds.filter((id): id is string => Boolean(id));
    if (signedIn.length) this.send('inbox', {}, signedIn);
  }
}
