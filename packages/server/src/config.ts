/*
 * What an install is told from outside. Only secrets and infrastructure live
 * here. Everything else is set in the UI and kept in the database.
 */

export interface AppConfig {
  /* Where people reach the app, with no trailing slash: "https://family.example.com". */
  baseUrl: string;
  /* "file:./data/family.db" when self-hosted, "libsql://…" for Turso. Demo mode keeps its own file. */
  databaseUrl: string;
  databaseAuthToken?: string;
  /* Signs sessions. When missing, one is made on first start and kept in the database. */
  secret?: string;
  /* Plant the fictional Marlow family with a ready-made account for every role. Never for a real family. */
  demoMode: boolean;
  /* Claims a fresh install, for hosts where the server log cannot be read. */
  setupToken?: string;
  email: {
    from: string;
    /* "smtp://user:pass@host:587" */
    smtpUrl?: string;
    resendKey?: string;
  };
  google?: { clientId: string; clientSecret: string };
  /* Run the daily jobs on a timer inside this process. Off on serverless hosts, where the host's cron calls /api/jobs. */
  timers: boolean;
  /* Lets the host's cron run the daily jobs. */
  jobsToken?: string;
}

type Env = Record<string, string | undefined>;

export function readConfig(env: Env = process.env): AppConfig {
  const port = env.PORT ?? '3000';
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined;
  const demoMode = env.DEMO_MODE === '1' || env.DEMO_MODE === 'true';
  return {
    baseUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
    // The made-up family gets a folder of its own, so trying the demo never touches a real family's file
    databaseUrl: env.DATABASE_URL ?? (demoMode ? 'file:./data/demo/family.db' : 'file:./data/family.db'),
    databaseAuthToken: env.DATABASE_AUTH_TOKEN,
    secret: env.AUTH_SECRET,
    demoMode,
    setupToken: env.SETUP_TOKEN,
    email: { from: env.EMAIL_FROM ?? 'Family tree <tree@localhost>', smtpUrl: env.SMTP_URL, resendKey: env.RESEND_API_KEY },
    google,
    timers: env.JOB_TIMERS !== '0',
    jobsToken: env.JOBS_TOKEN,
  };
}
