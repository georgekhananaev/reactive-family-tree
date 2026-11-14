---
title: Run your own
description: Start Reactive Family Tree from source, claim it with the one-time setup link, try demo mode, and set the environment variables the app reads.
---

One install holds one family's tree. Today you run it from the source code. Nothing is published to npm yet, and there is no ready-made Docker image to pull.

## What you need

- Node.js 24 or newer
- pnpm 11
- The source code of the project

## Start it

In the top folder of the repository:

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the app at `http://localhost:3000`. On the first start it creates its database, a single file at `apps/web/data/family.db`.

## Claim it with the setup link

A new install belongs to nobody yet. So the app prints a one-time link in the server log, which is the terminal where you ran `pnpm dev`:

```text
This family tree has not been set up yet. Open this link to claim it:

  http://localhost:3000/setup?token=setup_...
```

Open the link. The setup has five short steps:

1. **You.** The language, then your name and email. This makes you the owner of the tree, and the language becomes the family's own.
2. **The family.** What the tree is called. You can also create a passkey here, so signing in works before email is set up.
3. **A starting point.** Your own leaf, or a GEDCOM file from other family tree software. You can skip this.
4. **The look.** Whether the tree opens light or dark for the family. Skip it, and it follows each person's device. Either way, everyone can still switch for themselves. Later, the look tab under Manage family adds more: light and dark by the sun where the family is, which moon shows after dark, where the family is, and the music.
5. **Who can see it.** Private, public with the living hidden, or public.

Only that link opens the setup, so a stranger who finds a new install cannot claim it. Every start prints a new link until someone has claimed the tree.

### Signing in before email works

Relatives sign in with a link sent by email, and an invitation is emailed to the address it names. If you have not set up email, the app writes each sign-in link to the server log instead, and invitations are handed over as links you can copy. That is enough to run a tree at home.

Anyone who is signed in can also add a passkey from the account menu. After that, signing in is one touch and needs no email at all.

## Demo mode

```sh
pnpm demo
```

This starts the same app with `DEMO_MODE=1`. It plants the made-up Marlow family, with a ready-made account for every role, so you can try being an owner, an admin, a steward or a member. There is no setup link in demo mode. Never use it for a real family.

Demo mode keeps its data in a file of its own, `apps/web/data/demo/family.db`. Trying the demo never touches a real family's database, and you can go back and forth between `pnpm demo` and `pnpm dev`.

## Environment variables

Every one of these is optional when you run the tree on your own computer. Only secrets and infrastructure are set this way. Everything else is set inside the app, under "Manage family", and kept in the database.

You can set them in the shell, or copy `apps/web/.env.example` to `apps/web/.env.local` and fill in what you need.

| Variable | What it does | When it is not set |
| --- | --- | --- |
| `PUBLIC_URL` | Where people reach the tree, with no slash at the end. Links in emails and the MCP address are built from it. | `http://localhost:` and the port |
| `PORT` | The port used in that default address. | `3000` |
| `DATABASE_URL` | Where the data is kept. `file:` and a path for one file on disk, or a `libsql://` address for a hosted libSQL database such as Turso. | `file:./data/family.db` |
| `DATABASE_AUTH_TOKEN` | The token for a hosted libSQL database. | No token is sent |
| `AUTH_SECRET` | The secret that signs sessions. | One is made on the first start and kept in the database |
| `DEMO_MODE` | `1` or `true` plants the demo family and its ready-made accounts. | Off |
| `SETUP_TOKEN` | Sets the token of the setup link yourself, for hosts where you cannot read the log. The link is then `PUBLIC_URL` followed by `/setup?token=` and your token. Whoever knows it becomes the owner, so make it long and random: one shorter than 20 characters is not used. | A random token is made and printed |
| `EMAIL_FROM` | The address emails are sent from. | `Family tree <tree@localhost>` |
| `SMTP_URL` | Sends email through an SMTP server, for example `smtp://user:pass@host:587`. | Emails are written to the server log |
| `RESEND_API_KEY` | Sends email through Resend. It is used first if `SMTP_URL` is set too. | Emails are written to the server log |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | With both set, people who already have an account can sign in with Google. | No Google sign-in |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | With all four set, photos are kept in an S3-compatible bucket such as Cloudflare R2. For R2 the endpoint is `https://<account id>.r2.cloudflarestorage.com`. `S3_REGION` is `auto` unless your store wants another. | Photos are kept in a `media` folder beside the database |
| `MEDIA_DIR` | Another folder for photos, when they are not in a bucket. | The `media` folder beside the database |
| `JOB_TIMERS` | `0` stops the app from running its daily jobs on a timer of its own. | The timer runs |
| `JOBS_TOKEN` | Lets a scheduler on your host run the daily jobs, by sending `POST /api/jobs` with the header `Authorization: Bearer` and this token. | That address refuses every request |

Photos are files, so a backup of the database does not hold them. Back up the `media` folder, or the bucket, beside it.

The daily jobs remove photos nobody has used for 30 days, empty the compost of people removed more than 30 days ago and, when the database is a file, write a full snapshot into a `snapshots` folder beside it. The last 14 snapshots are kept.

## Check that it is up

`GET /api/healthz` answers with JSON that says whether the database responds and whether email is set up. It needs no sign-in, so an uptime monitor can call it.

## Docker

The repository has a `docker/Dockerfile` and a `docker/compose.yml` that build the app into one container, with the database in a volume at `/data`. No image is published to a registry yet, so you build it yourself from the source:

```sh
docker compose -f docker/compose.yml up --build
```

The first start prints the same setup link in the container's log.

On a server, three things make it a real install:

- **Say where it lives.** Put `PUBLIC_URL=https://family.example.com` in a file named `.env` beside `compose.yml`. Links in emails, sign-in and the address for AI clients are built from it. Passkeys and AI sign-in need https there.
- **Put a proxy in front.** The container listens on this machine only, at `127.0.0.1:3000`, and speaks plain http. A proxy such as Caddy, nginx or Traefik gives it its https address. Let it pass on up to 12 MB in one request, or a GEDCOM import and a restore from backup are turned away (nginx allows 1 MB unless told otherwise), and let it pass the live update stream at `/api/stream` through without buffering.
- **Back up the volume.** The database, the photos and the nightly snapshots all live in the `/data` volume. A copy of that volume kept somewhere else is the whole backup.
