/*
 * Runs once when the server starts: bring the database up to date, print the
 * setup link of a fresh install, plant the demo family in demo mode, and start
 * the daily jobs. Without this they would wait for the first visitor.
 *
 * The work itself is in a file of its own, loaded only where there is a Node
 * process to do it in.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await (await import('./lib/start')).start();
}
