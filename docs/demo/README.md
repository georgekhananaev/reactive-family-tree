# Reactive Family Tree: end-to-end demo

A working demo of the whole product: the living tree, sign-in and roles, editing, suggestions and review, history and undo, privacy, the admin area, live updates between browsers, a real MCP endpoint for AI clients, and data in and out.

It runs on Node alone. No install, no build.

## Run it

You need Node 24 or newer.

```
cd docs/demo
node server/main.js
```

Open http://localhost:4321. The first start creates `data/family.db` and plants the demo family.

| Command | What it does |
|---------|--------------|
| `node server/main.js` | Start the demo |
| `node server/main.js --reset` | Start again from the demo family |
| `node --test` | Run the tests (19 tests, a few seconds) |
| `PORT=5000 node server/main.js` | Use another port |

## Try it

The demo family is the fictional Marlows, 50 people over five generations. A sign-in panel offers a relative for every role:

| Sign in as | Role | Try this |
|------------|------|----------|
| Helen Stein | Owner | Manage family: members, branches, settings, data. Review the two waiting suggestions |
| Peter Lindqvist | Admin | Edit anyone. Approve, adjust or decline suggestions |
| Margaret Hale | Steward of her branch | Open the inbox: an AI draft is waiting. Apply all of it, or part |
| Karl Lindqvist | Steward of his branch | Review the suggestion to add Lena, which landed in his branch |
| Nora Bell | Steward of her branch | Add a child to herself. It publishes at once |
| Sophie Stein | Member | Suggest a fix on someone outside her branch |
| Daniel Okafor | Member with no branch | Edit only his own leaf |

Things worth doing:

1. **Without signing in**, look at the tree. Living people are unnamed leaves. Tap one. Then tap someone who has died and suggest a fix as a visitor.
2. **Open a second browser window** (a private window works) as someone else. Change something in one and watch it grow in the other.
3. **Edit mode** (the pencil): tap a leaf you can edit and pull one of the + buds to add a child, partner, parent or sibling.
4. **Edit someone outside your branch.** The button says "Send for review" before you press it, and the change shows on the tree in pencil for you and the reviewers.
5. **Undo** from the toast, or from a person's History.
6. **Manage family, Branches, Assign on the tree**: tap a person to give a steward their branch. Each steward's branch is ringed in their colour.
7. **Drag the year** at the bottom, or press Play, to watch the family grow from 1898. The year stands in the sky while you are away from today.
8. **Download GEDCOM**, then import it again: it arrives as a draft to preview, and the duplicates are noticed.
9. **Hold a leaf, or right-click it.** A ring of actions opens around it. On a phone, keep the finger down, slide to a petal and let go.
10. **Ask "How are we related?"** from that ring, or tap the line under a person's name ("Your great-aunt"). The branches between the two of you light up one after another.
11. **Search** with `/`. The people found keep their colour on the tree and everyone else steps back.
12. **Put the mouse away.** Tab to the tree, travel along the family with the arrow keys, open with Enter, and press `?` for every gesture and key.

## Connect an AI client

1. Sign in, open the menu, choose **Connect your AI**, and create a connection. The token is shown once, with ready-made setup for common clients.
2. For Claude Code, for example:

```
claude mcp add --transport http family-tree http://localhost:4321/mcp --header "Authorization: Bearer rft_..."
```

3. Ask it something: "Who are Nora's children?", "Add my cousin Pip, born about 2010, as Nora's child."

By default the connection is **review first**: the AI's changes arrive as a private draft in your inbox, drawn on your tree in pencil, and nothing is published until you apply it. Switch a connection to "apply directly" and its changes publish inside your branch and become suggestions outside it, exactly as yours would.

The endpoint offers 22 tools (fewer on the "simple" setting for small local models), three resources (`tree://summary`, `tree://guidelines`, `tree://schema`) and four prompts. It was checked against both generations of the official MCP client library.

## How it is built

```
core/      Rules shared by the server and the browser. No I/O.
  dates.js         fuzzy dates: "about 1890", "between 1921 and 1922"
  graph.js         the family as a graph: ancestors, descendants, branches
  ops.js           operations, the only way the family changes
  permissions.js   who may change what: apply, suggest or deny
  privacy.js       who may see whom
  validate.js      does the family still make sense after an edit
  compose.js       "add a relative" turned into operations
  kinship.js       a chain of relatives named in words: "your first cousin once removed"
server/    One Node process: HTTP, SQLite, live stream, MCP.
  main.js          entry point, routing, static files
  db.js, store.js  SQLite, and the family held in memory
  auth.js          accounts, sessions, invitations, branches, AI connections
  edits.js         the single write path: submit, review, drafts, undo, compost
  views.js         what a viewer may see: tree, person, search, health
  api.js           the web API
  mcp.js           the MCP endpoint
  gedcom.js        GEDCOM export and import
  realtime.js      server-sent events
  seed.js          the demo family
web/       The app. Plain ES modules, no framework, no build.
  tree.css         the approved design (from docs/design)
  app.css          the app around the tree
  js/tree-view.js  the living tree, drawn from live data
  js/card.js       the person card: read, edit, suggest, add a relative
  js/petal-menu.js the ring of actions around a leaf
  js/panel-*.js    sign in, inbox, manage family, connect your AI, gestures and keys
tests/     node:test. Rules, and the journeys end to end over HTTP.
```

What this demo proves:

- **One write path.** The app, an AI client and a GEDCOM import all call `Edits.submit()`. There is no second way to change the family.
- **The same rules on both sides.** `core/permissions.js` labels the button in the browser and enforces on the server.
- **Privacy on the server.** A masked person is sent as a placeholder with nothing in it, not even their real id. A test reads everything a visitor receives and fails if a living name appears.
- **Nothing is lost.** Every edit records the before and after of what it changed. Undo is a new edit. Removal goes to a compost for 30 days.
- **Live without leaks.** The stream only says "something changed". Each browser then fetches what it may see.

## Where the demo differs from the real build

These are shortcuts for a zero-install demo. The behaviour is the planned one unless noted.

| Area | Demo | Real build |
|------|------|---------------------------|
| Stack | Node's own HTTP and SQLite, vanilla modules | Next.js, libSQL with Drizzle, the React package |
| Sign-in | Demo accounts. Magic links and invitations work, but the link is shown on screen | Links emailed. Passkeys and Google sign-in |
| AI sign-in | Personal tokens | OAuth sign-in from the client, plus tokens and a local bridge |
| MCP server | Hand-written, speaks the protocol revisions that open with `initialize` | The official SDK, including the 2026-07-28 revision |
| Family storage | One JSON document per person, partnership and fact | Typed tables |
| Names | One name per person, with "born as" | Several names per person, in several scripts |
| Photos and sources | Not included | Portraits, galleries, sources attached to facts |
| Views | The Canopy view, with "Focus here" to see another lineage | Roots, Rings, Grove and Outline as well |
| Gestures | Drag, pinch, double tap, one-hand zoom, the petal menu, pulling a + bud, the card as a sheet, the keyboard | Also: swipe a card to the next sibling, drop a bud on someone to connect two people, select several at once, redo |
| Undo conflicts | Refuses if something was changed again since, and says to undo that first | Field by field choice |
| Merging duplicates | Flagged, not merged | Side by side merge |
| Languages | English | English and Hebrew, right to left |
| Default visibility | Public with living people hidden, so the demo has something to show a visitor | Private |

The app in `apps/web` now covers the first five rows of the right-hand column, apart from the local bridge, and it is private by default. It also has one portrait per person, with a switch between leaves and faces. The rest of the rows from "Names" to "Languages" are still to come.

## Reset

To start over, sign in as Helen and use **Manage family, Data, Start the demo again**, or run `node server/main.js --reset`, or delete the `data` folder.
