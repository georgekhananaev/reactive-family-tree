/*
 * Scheduled work: small jobs that are safe to run twice. In a container a
 * timer in this process runs them. On a serverless host the host's cron calls
 * /api/jobs and whatever is due runs then. Either way a job runs only when
 * its time has come, which is remembered in the database.
 */

import { meta } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { like, sql } from 'drizzle-orm';

export interface Job {
  name: string;
  everyHours: number;
  /* Returns a short line saying what it did. */
  run(): Promise<string>;
}

const CHECK_EVERY_MS = 15 * 60 * 1000;
const PREFIX = 'job:';

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Database,
    private readonly jobs: Job[],
  ) {}

  /* Run every job whose time has come. */
  async runDue(): Promise<{ name: string; result: string }[]> {
    const rows = await this.db.select().from(meta).where(like(meta.key, `${PREFIX}%`));
    const lastRun = new Map(rows.map((row) => [row.key.slice(PREFIX.length), Date.parse(row.value)]));
    const ran: { name: string; result: string }[] = [];
    for (const job of this.jobs) {
      if (Date.now() - (lastRun.get(job.name) ?? 0) < job.everyHours * 3600 * 1000) continue;
      let result: string;
      try {
        result = await job.run();
      } catch (error) {
        result = `failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`Scheduled job "${job.name}" failed`, error);
      }
      await this.db
        .insert(meta)
        .values({ key: PREFIX + job.name, value: new Date().toISOString() })
        .onConflictDoUpdate({ target: meta.key, set: { value: sql`excluded.value` } });
      ran.push({ name: job.name, result });
    }
    return ran;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runDue(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
