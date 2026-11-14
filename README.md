# Reactive Family Tree

A family tree drawn as a living tree. Branches are ink, leaves are people, and the
whole thing grows, folds, and answers to touch. One family per install, run by its
own relatives, with nothing sent anywhere else.

- **It looks like a tree.** Ancestors are the roots, descendants are the canopy.
  Light and dark, phone and desktop, and it stands still for people who ask for
  less motion.
- **Relatives keep it up.** Each one signs in and edits their own branch directly.
  A change anywhere else becomes a suggestion for whoever looks after that branch.
  Every change can be undone.
- **An admin runs it from the page.** Members, branches, review, privacy, import
  and export are all in the app. No config files to edit.
- **Your own AI can help.** Any relative can connect their AI client over MCP. It
  can do what they can do and no more, and by default its changes wait as a draft
  for them to look over.
- **Faces as well as leaves.** Each person can have one photo. A switch turns
  the leaves of those who have one into round portraits, and back.
- **A melody, if the family wants one.** Five calm melodies in the five-note
  scales of Japanese music, played by the browser itself with no audio files. The
  melody in the background waits until someone turns it on, and each relative
  switches it for themselves. Pressing Play brings a quicker tune of its own,
  which an admin can turn off apart from the other, and make from a different
  melody.
- **Tonight's moon over it.** In the dark the tree stands under the real moon,
  in tonight's phase, or under the one the family chooses: always full, none at
  all, or the moon exactly as it was on a day that matters to them. Tell the tree
  roughly where the family is, and the moon is turned the way it is seen from
  there, the sun is warmer near sunrise and sunset, and the tree can turn dark
  at sunset there by itself.
- **In English, Hebrew and Russian.** Everyone reads the tree in their own
  language, with Hebrew read from the right. A person's names, story and
  memories can be written in all three, so relatives who read different
  languages see the same family. Where a translation is missing, the words
  show as they were first written.
- **The living stay private.** A new tree is closed to strangers. If the family
  opens it, living people still appear as unnamed leaves unless they choose
  otherwise themselves.

Created by George Khananaev. MIT licensed.

## Run it

You need Node 24 and pnpm.

```sh
pnpm install
pnpm dev
```

The first start prints a one-time setup link to the terminal. Open it, and the
wizard makes you the owner, names the tree, and plants your own leaf. After that
you invite relatives from "Manage family". The tree is at http://localhost:3000.

Sign-in is by emailed link or passkey. Until email is set up, sign-in links are
written to the terminal instead, so creating a passkey in the wizard is the easy
way to get back in.

### Looking around with sample data

```sh
pnpm demo
```

This starts the same app with the fictional Marlow family, 50 people over five
generations, and a ready-made account for every role. It keeps its data in a
file of its own, so it never touches a real family's tree.

### With Docker

```sh
docker compose -f docker/compose.yml up --build
```

One container, no separate database. The database file, the photos, the secret
that signs sessions, and the nightly snapshots live in the `/data` volume. Read
the setup link with `docker compose -f docker/compose.yml logs tree`.

On a server, put `PUBLIC_URL=https://family.example.com` in a `.env` file beside
`compose.yml` before the first start, and put a proxy that speaks https in front:
the container listens on `127.0.0.1:3000` only. Back up the `/data` volume.

### Settings

Everything about the family is set in the app. Environment variables are only for
secrets and infrastructure, and all of them are optional on your own computer.
`apps/web/.env.example` lists them with notes.

| Variable | What it is for |
|----------|----------------|
| `PUBLIC_URL` | Where people reach the tree. Sign-in for AI clients needs https here, or localhost |
| `DATABASE_URL` | `file:./data/family.db` by default. A `libsql://` address runs it on Turso |
| `DATABASE_AUTH_TOKEN` | The token for a Turso database |
| `AUTH_SECRET` | Signs sessions. Made once and kept in the database when missing |
| `SMTP_URL` or `RESEND_API_KEY`, `EMAIL_FROM` | Sending sign-in links and invitations. Without them, links go to the server log and invitations are handed over as links |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in for people who already have an account |
| `SETUP_TOKEN` | Claims a fresh install on a host where you cannot read the log |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Keep photos in an S3-compatible bucket such as Cloudflare R2. Without them, photos live in a `media` folder beside the database |
| `MEDIA_DIR` | Another folder for the photos, when they are not in a bucket |
| `DEMO_MODE` | Plants the Marlow family and its demo accounts. Never for a real family |
| `JOB_TIMERS`, `JOBS_TOKEN` | Turn the daily jobs' timer off and let the host's cron call `POST /api/jobs` |

## Connect an AI

Each relative does this for themselves, under "Connect your AI" in the account
menu. The address is the tree's own, ending in `/mcp`.

- A client that can sign in needs only that address. It sends the relative to the
  tree to sign in and agree.
- Any other client uses a personal token, made on the same panel.

The AI gets tools for reading, searching, adding people and facts, and suggesting
corrections. It acts as that relative: the same branch, the same privacy rules.
New connections start in "review first", so nothing an AI writes is published
until its owner has looked at it.

## What is in here

| Folder | What it is |
|--------|------------|
| `apps/web` | The app, on Next.js: the tree, sign-in, editing, review, admin, the API, and the MCP endpoint |
| `apps/site` | The project site, on Astro: landing page with a live tree, and the documentation |
| `packages/react` | `reactive-family-tree`, the tree as one React component |
| `packages/core` | The rules, with no framework: people, partnerships, dates, permissions, privacy, kinship |
| `packages/server` | Services behind the API: the one write path for edits, members, sign-in, email, jobs, backup |
| `packages/db` | The tables and migrations, on Drizzle and libSQL |
| `packages/mcp` | The MCP server: tools, resources, and prompts |
| `packages/gedcom` | GEDCOM in and out |
| `packages/demo-data` | The Marlow family |
| `docs` | The plan this was built from, the design prototype, and the first zero-install demo |

Every change to the family goes through one function, whether it comes from the
page, an AI, or an import. That is where permissions, validation, history, and
undo live, so no way in can skip them.

## The tree as a component

The drawing is a package of its own and needs nothing from the app.

```tsx
import { FamilyTree } from 'reactive-family-tree';
import 'reactive-family-tree/tree.css';

export function Family({ data }) {
  return <FamilyTree data={data} label="The Marlow family" onSelect={(person) => console.log(person)} />;
}
```

`data` is a list of people, a list of partnerships with their children, and the
person the tree grows from. `openSnapshot` in `@reactive-family-tree/core` builds
it from a family held in memory.

## Working on it

```sh
pnpm test         # every package's tests
pnpm typecheck
pnpm lint
pnpm site         # the project site, on its own port
pnpm db:generate  # after changing the tables in packages/db
```

The tests run against a real database file in a temporary folder, through the same
API the page uses. `CONTRIBUTING.md` has the rest.

## More

- [The plan](docs/README.md): what it is, how it looks and moves, and how it is built
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [License](LICENSE)
