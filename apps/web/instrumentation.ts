/*
 * Runs once when the server starts: bring the database up to date, print the
 * setup link of a fresh install, plant the demo family in demo mode, and start
 * the daily jobs. Without this they would wait for the first visitor.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getApp } = await import('./lib/server');
  await getApp();
}
