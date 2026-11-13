/*
 * Live updates. Each open browser holds one event stream. The server only ever
 * says "something changed" (with the new sequence number) or "your inbox
 * changed". Browsers then fetch what they are allowed to see, so nothing
 * private can leak through the stream.
 */

export class Hub {
  constructor() {
    this.clients = new Set();
  }

  /* Attach a browser. `userId` is null for a visitor. */
  attach(response, userId) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(': connected\n\n');
    const client = { response, userId };
    this.clients.add(client);
    const beat = setInterval(() => response.write(': still here\n\n'), 25000);
    response.on('close', () => {
      clearInterval(beat);
      this.clients.delete(client);
    });
  }

  send(event, data, userIds = null) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      if (!userIds || userIds.includes(client.userId)) client.response.write(message);
    }
  }

  /* The family changed: everyone refreshes their own view of it. */
  changed(seq) {
    this.send('changed', { seq });
  }

  /* Something waits for these people: a suggestion, a draft, a decision. */
  inbox(userIds) {
    const signedIn = userIds.filter(Boolean);
    if (signedIn.length) this.send('inbox', {}, signedIn);
  }

  close() {
    for (const client of this.clients) client.response.end();
  }
}
