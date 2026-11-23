---
title: Contributing
description: How the Reactive Family Tree repository is laid out, how to run the app and this site while you work, and the three checks to run before you send a change.
---

The project is one repository with several packages in it. All the rules live in packages that know nothing about a web framework. The apps are thin shells around them.

## What you need

- Node.js 24 or newer
- pnpm 11

Then, in the top folder:

```sh
pnpm install
```

## The layout

```text
reactive-family-tree/
├─ apps/
│  ├─ web/          The app, on Next.js: the tree, person pages, sign-in,
│  │                the admin area, the API and the MCP endpoint
│  └─ site/         This site, on Astro: the home page, the demo, the docs
├─ packages/
│  ├─ core/         The rules of a family tree: types, operations, permissions,
│  │                privacy, dates, kinship. No DOM and no I/O
│  ├─ react/        The tree as a React component, named reactive-family-tree
│  ├─ db/           The database: schema, migrations and the libSQL client
│  ├─ server/       The services: edits, members, sign-in, what each viewer
│  │                may see, email, backups, live updates, daily jobs
│  ├─ mcp/          The MCP server: tools, resources, prompts and the HTTP endpoint
│  ├─ gedcom/       GEDCOM import and export
│  └─ demo-data/    The made-up Marlow family, used by tests, the demo and the docs
├─ docs/            The design prototype and an early demo
└─ docker/          The Dockerfile and a compose file
```

The packages are TypeScript source. Nothing is compiled ahead of time: each app compiles the packages it uses.

Two things hold the design together:

- **One way to change the family.** The app, an AI client and a GEDCOM import all send a list of operations through the same edit service in `packages/server`. That is the one place where a change is checked, recorded and applied.
- **The same rules on both sides.** `packages/core` decides whether an edit is published, sent for review or refused. The browser uses the answer to label a button. The server uses it to enforce.

## Run it while you work

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the app at `http://localhost:3000`. See [Run your own](/docs/run-your-own/). |
| `pnpm demo` | Starts the app in demo mode, with the Marlow family and an account for every role. |
| `pnpm site` | Starts this site. |

## Before you send a change

Run these three in the top folder. The project's CI runs the same three on every pull request.

```sh
pnpm test
pnpm typecheck
pnpm lint
```

- `pnpm test` runs the tests of every package that has them, with Vitest.
- `pnpm typecheck` checks the types of every package and app.
- `pnpm lint` runs ESLint over the whole repository.

`pnpm format` rewrites files with Prettier, using the project's settings: single quotes and lines up to 140 characters.

## House rules

- TypeScript is strict everywhere.
- Import types with `import type`. The linter insists on it.
- No unused variables or imports. A name that starts with `_` is allowed to go unused.
- Comments say why something is the way it is, in plain words.
- If you change a table in `packages/db`, run `pnpm db:generate` to write the migration.

## License and credit

The project is open source under the MIT license. Its author is George Khananaev.
