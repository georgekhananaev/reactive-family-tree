/*
 * Starting and stopping the server process. Only ever loaded by Node, from
 * instrumentation.ts.
 */

import { getApp } from './server';

export async function start(): Promise<void> {
  try {
    const app = await getApp();
    // Asked to stop, the server first lets go of the browsers that are listening, or it would wait for them until it is killed
    process.once('SIGTERM', () => app.hub.close());
  } catch (error) {
    // A server that could not open its database would stay up and answer every page with an error, and nothing would start it
    // again. Stopping lets whatever runs it, such as Docker, see that it failed and try again.
    console.error('The family tree could not start.', error);
    if (process.env.NODE_ENV === 'production') process.exit(1);
    throw error;
  }
}
