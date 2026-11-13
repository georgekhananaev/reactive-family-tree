# Reactive Family Tree: the plan

Status: the plan, with a first full build of it in this repository (2026-11-13)
Author: George Khananaev

Reactive Family Tree is an open-source family tree that looks and behaves like a living plant. Branches grow when you open them, leaves are people, and the whole thing responds to touch, to time, and to changes made by relatives or by their AI assistants. An admin runs everything from the UI. Relatives sign in and edit their own branch. Anyone else can suggest a correction.

This folder is the full plan: what we are building, how it looks and moves, how it is built, and in what order. The app itself is described in the [readme at the top of the repository](../README.md), and [11](11-roadmap.md) says how far the build has come.

## How to read this

| Doc | What it answers |
|-----|-----------------|
| [01 Vision and scope](01-vision-and-scope.md) | What is this, who is it for, what is in and out of v1 |
| [02 Visual design](02-visual-design.md) | The botanical language, views, screens, color, type |
| [03 Motion and SVG](03-motion-and-svg.md) | Every transition, and the SVG techniques behind them |
| [04 Gestures and interaction](04-gestures-and-interaction.md) | Touch, trackpad, mouse, keyboard, screen reader |
| [05 Architecture](05-architecture.md) | Monorepo, stack, layout engine, rendering pipeline, realtime, deployment |
| [06 Data model](06-data-model.md) | People, unions, facts, fuzzy dates, edits and history |
| [07 Roles, editing and review](07-roles-editing-and-review.md) | Who can change what, corrections, review, privacy |
| [08 Admin experience](08-admin-experience.md) | Setup, members, branch assignment, settings, all from the UI |
| [09 MCP and API](09-mcp-and-api.md) | Connecting a relative's own AI to the tree, safely |
| [10 SEO and project site](10-seo-and-project-site.md) | Public tree SEO in the app, and the Astro site |
| [11 Roadmap](11-roadmap.md) | Phases, acceptance criteria, testing, launch, risks |
| [design/index.html](design/index.html) | The chosen visual design as a working prototype: light and dark, desktop and phone. Open it in a browser |
| [demo](demo/README.md) | The whole product as a working end-to-end demo: server, database, sign-in, editing, review, admin, live updates and an MCP endpoint. Runs with `node server/main.js`, no install |

If you only read three: 02, 07 and 09.

## Decisions already made

These came from the planning questions and are treated as settled.

| Topic | Decision |
|-------|----------|
| Product shape | A self-hosted app (one family per install) plus the tree renderer published as a standalone React package |
| Database | SQLite/libSQL: one file when self-hosted, Turso when deployed to a serverless host |
| App framework | Next.js |
| SEO | Astro is the project site: a landing page with a live tree, and the documentation. The app, with its public person pages, is on Next.js. Both are built |
| Styling | The approved demo's two stylesheets, carried over as plain CSS with custom property tokens. No Tailwind and no Base UI, so the app looks exactly like the demo that was signed off |
| First build | Everything the demo does, on the real stack: Next.js, typed tables on libSQL, real sign-in, the setup wizard, the official MCP SDK with sign-in and tokens, scheduled jobs, Docker and tests. The tree engine from the demo is carried over unchanged |
| Visual world | A living botanical tree. Other worlds (constellation, engraved atlas) can come later as skins |
| Visual design | "Morning ink": ink branches and watercolour leaves, in a light (white) and a dark appearance, ready for phones. Chosen from three prototypes |
| Edit trust | Edits inside your own branch publish instantly with history and undo. Edits anywhere else become suggestions for that branch's steward or an admin |
| AI access | Editors can connect their own AI through MCP. This is a first-class feature, not an add-on |
| License | Open source |

## Assumptions to confirm

These are calls made while writing the plan. Each one is reversible, and each is marked where it appears in the docs.

1. **Where Astro lives. Confirmed.** The answer on stack was "use Astro for amazing SEO, you can build it with Next.js + SQLite/libSQL". The plan reads this as two roles: Next.js is the app (the tree, person pages, sign-in, admin, MCP), and Astro is the public project site (landing page, live demo, documentation). Public family pages stay inside the Next.js app so a leaf can morph into a person page without a hard page load, and they get their own SEO treatment there. The alternative is a single Astro app with the tree as a React island. The architecture keeps all logic in framework-free packages so switching the shell stays cheap. See [10](10-seo-and-project-site.md).
2. **AI edits are reviewed by their owner first.** Human edits in your own branch go live instantly, as decided. Edits made through MCP land as a private draft that the member approves with one tap, unless they switch that connection to "apply directly". Language models invent dates, and a family record is a bad place for invented dates. See [09](09-mcp-and-api.md).
3. **Private by default.** A new install requires sign-in to see anything. The admin can open it to the public, and living people stay masked for visitors even then. See [07](07-roles-editing-and-review.md).
4. **A branch means an anchor person, their partners, all their descendants, and those descendants' partners.** A steward can hold several anchors. Changing an anchor's own parents is outside the branch. See [07](07-roles-editing-and-review.md).
5. **MIT license** for both the app and the packages, for the widest adoption.
6. **English first, right-to-left ready.** Hebrew ships as the first right-to-left language to prove the layout mirrors correctly. Names in any script are supported from day one.
7. **Passwordless sign-in.** Email magic links and passkeys, with optional Google sign-in. No passwords to forget.
8. **Descendants grow upward.** In the tree, ancestors are roots below and descendants are the canopy above. A classic "ancestors on top" orientation is a setting.
9. **No built-in AI.** The app does not call any model itself. AI comes only through the member's own client over MCP, so there are no API keys to manage and no usage costs for the family.
10. **The npm name `reactive-family-tree`** is assumed to be available. It needs checking before the first publish.
11. **Which side a couple is drawn on.** Each couple has a host partner, and the couple and their children grow from the host's branch. By default the host is whoever was already on the tree when the partner was added. Admins can switch it, and imports ask for a rule. No side is preferred by default. See [02](02-visual-design.md).
12. **Self-hosting is the reference.** The Docker container has every feature. Serverless hosting is supported, with scheduled jobs driven by the host's cron and database safety resting on the provider. See [05](05-architecture.md).
13. **The public demo runs in the browser.** It uses the real rules with in-memory data, so the project does not have to operate a server for it. A hosted full demo is optional at launch. See [10](10-seo-and-project-site.md).
14. **A fresh install is claimed with a one-time setup link** printed in the server log, and the first owner signs in with a passkey, so setup does not depend on email working. See [08](08-admin-experience.md).

## Words used in these docs

| Word | Meaning |
|------|---------|
| Person | One individual in the tree. Drawn as a leaf |
| Union | A partnership between people (marriage or otherwise). Children attach to a union. Drawn as a blossom at a fork |
| Lineage | A founding person or couple and everyone who descends from them. Each lineage can have its own leaf species |
| Branch | An anchor person, their partners, all their descendants, and those descendants' partners |
| Host partner | The partner whose branch a couple and their children are drawn on |
| Steward | A member who can edit one or more branches live |
| Edit | One atomic batch of changes, from any source (UI, MCP, import, API) |
| Draft | An edit only its author can see, not yet submitted |
| Suggestion | An edit waiting for a steward or admin to approve it |
| Compost | The trash. Removed people and facts stay restorable for 30 days |
| Grove | The zoomed-out view where every lineage in the family is a separate tree |
