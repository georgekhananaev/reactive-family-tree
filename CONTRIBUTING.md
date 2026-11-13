# Contributing

Thank you for wanting to help. This is a family record, so the bar is care more
than speed: nothing here should ever lose, leak, or invent a fact about someone.

## Getting set up

You need Node 24 and pnpm.

```sh
pnpm install
pnpm demo        # the app with the fictional Marlow family, on http://localhost:3000
pnpm test
pnpm typecheck
pnpm lint
```

`pnpm dev` starts an empty install and prints a setup link, which is the path a
real family takes.

If the page ever keeps reloading itself while you develop, the dev server has
got itself into a bad state. Stop it, delete `apps/web/.next`, and start it
again.

## How the code is laid out

All the rules live in packages that know nothing about a framework. The apps are
thin shells around them.

- `packages/core` holds the rules: what a family is, who may change what, who may
  see whom, how two people are related. Pure functions, no database.
- `packages/server` holds the services. `Edits.submit()` is the one way to change
  the family. The page, the MCP tools, and GEDCOM import all go through it.
- `packages/db` holds the tables. After changing them, run `pnpm db:generate` and
  commit the new migration with your change.
- `packages/react` is the drawing. It takes data and callbacks and knows nothing
  about sign-in or the API.
- `apps/web` wires it together on Next.js.

If a change needs a new rule, it belongs in `core` with a test, not in a route or a
component.

## What a good change looks like

- **It has a test that would have failed before.** The journeys in
  `packages/server/tests` run through the real API against a real database file.
  New behaviour goes there, written the way a person would use it.
- **It keeps the one write path.** No route or tool writes to the family tables on
  its own.
- **It respects privacy by default.** Anything that shows a person must go through
  the same view functions the page uses, so a visitor never learns about the
  living by a side door.
- **It stays small.** No unused code, no dependency for something a few lines can
  do, one job per component.
- **It reads plainly.** Comments say why, in ordinary words. Text shown to people
  is short and says what happens next.

For anything visible, check it in light and dark, at phone width, and with reduced
motion turned on. The tree must stay usable with a keyboard alone.

## Sending it

1. Open an issue first for anything larger than a fix, so we can agree on the
   shape before you spend time on it.
2. Branch from `main`.
3. Make sure `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass.
4. Open a pull request that says what changed and why, and how you checked it.

## Versions and the changelog

Leave `version` and `CHANGELOG.md` alone in a pull request. Both change in one
place only, the release commit on `main`, so two branches can never collide over
them. Your change gets its line in the changelog when the release is made, from
what the commits say. CI turns away a pull request that touches either.

Every package shares one version. Before 1.0 a release with anything new or
changed moves the middle number (0.1.0 to 0.2.0), and one with only fixes moves
the last (0.1.0 to 0.1.1).

## Reporting a problem

A bug report is most useful with what you did, what you expected, and what
happened. If it is about security or someone's private data, do not open a public
issue. See [SECURITY.md](SECURITY.md).

By contributing you agree that your work is released under the project's
[MIT license](LICENSE), and that you will follow the
[code of conduct](CODE_OF_CONDUCT.md).
