# 01 Vision and scope

## The idea

Most family tree software draws an org chart: boxes, right-angle lines, a toolbar from 2005. It stores the facts and loses the feeling.

Reactive Family Tree draws an actual tree. It is grown from the family's data by a layout engine, so every family gets a tree that is recognisably theirs and no two look the same. Open a branch and it grows. Add a baby and a new leaf unfurls on every relative's screen. Slide the year back to 1890 and watch the tree shrink to a seedling.

Under the art is a serious, permissioned, collaborative data system. An admin keeps the family's tree. Relatives look after their own branches. Everyone else can point out mistakes. Every change is recorded and can be undone. And each relative can plug in the AI they already use and say "add my wife's side, here are my notes".

## Reactive, in four ways

1. **To data.** Any change, from any person or AI, appears live as growth on every open screen.
2. **To touch.** Pinch, drag, long-press and keyboard all work directly on the tree. Editing is done by pulling a new twig out of a leaf.
3. **To time.** A year slider replays the family's growth. Birthdays bloom. The sky follows the viewer's time of day.
4. **To the viewer.** The tree knows who is looking. It opens on your leaf, highlights your branch, shows what grew since your last visit, and only offers the edits you are allowed to make.

## Who it is for

| Person | What they want | What they must never feel |
|--------|----------------|---------------------------|
| The keeper (admin) | To gather the family's history in one beautiful place and keep it accurate without doing all the typing | That they are the bottleneck, or that they need a developer |
| The steward | To fill in and maintain their own side of the family | Afraid of breaking someone else's part |
| The relative (member) | To explore, find themselves, share a memory, fix a wrong date | That they need training |
| The elder | To see faces and names in large, calm type and tell stories | Lost, rushed, or locked out by a password |
| The visitor | To see a public family's history | That they are looking at living people's private details |
| The developer | To put a gorgeous tree in their own site with one component | That the package only works inside our app |
| The member's AI | To read the tree and propose precise changes on the member's behalf | Able to do more than the member can |

## Principles

1. **The tree is the one bold thing.** All the visual ambition goes into the tree. Menus, forms and panels stay quiet and plain.
2. **Readable first, organic second.** Generations stay legible. The organic look comes from how branches are drawn, never from scrambling who is where.
3. **Motion means something.** Things move when you act or when the family changes. Nothing bounces for decoration.
4. **Plain words.** Buttons say "Add child", not "Sprout". The botanical metaphor lives in the drawing, not the labels.
5. **Trust with a safety net.** Let people edit freely where they belong, record everything, make undo one tap.
6. **Never invent history.** Unknown stays unknown. Uncertain dates are stored as uncertain. AI changes are visible as AI changes.
7. **The living are protected.** Privacy rules are enforced on the server, and the safe option is the default.
8. **No lock-in.** Everything can be exported in standard formats at any time.

## Goals for v1

- A tree renderer that makes people say "wow" in the first three seconds and still works with 5,000 people on a mid-range phone.
- A full self-hosted app: sign-in, roles, branch stewardship, live editing, suggestions, review, history, undo.
- Admin does everything from the UI. Setup takes under ten minutes from `docker run` to an invited relative.
- A built-in MCP server so a member's own AI can read and edit within that member's permissions.
- GEDCOM import and export, full backup, and a print-quality poster export.
- Public trees that search engines can read, with living people masked.
- A standalone React package, documented, themed, and usable without the app.
- Keyboard and screen reader access to everything, and a reduced-motion mode that loses nothing.

## Not in v1

- Hosting many unrelated families in one install with public sign-up.
- DNA matching, or automatic record hints from external archives.
- Native mobile apps. The web app installs as a PWA.
- A built-in AI assistant. AI arrives through MCP from the member's own client.
- A social feed, chat, or messaging.
- The constellation and atlas skins. The theme system is built so they can be added.
- Video export of the time-lapse.

## Things that would make it a failure even if it works

- It looks like an org chart with a leaf icon on it.
- An AI silently adds a great-grandfather who never existed.
- A living person's birthday or photo is visible to a stranger.
- The admin has to approve every comma.
- A relative needs a tutorial to add their child.
- The effects make a phone hot, or the tree stutters while panning.
- A family cannot leave with all their data.

## Feature map

| Area | v1 | Later |
|------|----|-------|
| Views | Canopy, Roots, Rings, Grove, Outline, person page | Map view of migrations |
| Tree behaviour | Expand and collapse by growth, semantic zoom, search fly-to, relationship path, time slider | Narrated time-lapse, video export |
| Ambient | Wind, day and night sky, birthday blossoms, "new since your visit", presence | Seasons tied to the calendar, optional sound |
| People | Names in several scripts, fuzzy dates, facts, bio, portrait, gallery, sources, memories | Face tagging in group photos, alternate conflicting facts |
| Editing | Pull-a-twig gestures, forms, live publish in own branch, suggestions elsewhere, drafts | Bulk spreadsheet editing |
| Review | Inbox, before and after, approve, edit and approve, decline with a note, history, revert | Reputation and auto-trust |
| Admin | Setup wizard, invites, roles, branch painter, privacy, appearance, guidelines, data tools | Custom fields designer |
| AI | Remote MCP with sign-in, personal tokens, local bridge, draft review, activity log | Direct local-database mode |
| Data | GEDCOM 5.5.1 and 7 import, GEDCOM 7 export, zip backup and restore, poster export | Sync between installs |
| Platform | Docker, serverless deploy, PWA, English and Hebrew, React package | More languages, more skins, WebGL renderer for very large trees |

## How we will know it worked

- A first-time visitor expands a branch within ten seconds without being told how.
- A steward adds a family of five from their phone in under two minutes.
- A member connects their AI client in under one minute and gets a correct answer to "how am I related to Miriam?".
- Panning and zooming hold 60 frames per second with 500 leaves on screen on a mid-range phone.
- The demo is the thing people share. The React package is installed by people who never run the app.
