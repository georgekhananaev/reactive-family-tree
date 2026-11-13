# 02 Visual design

## The concept

A family is drawn as a living tree, in the manner of a botanical plate: confident ink branches, soft washes of colour in the leaves, and a clean white sky behind. After sunset the same tree is drawn on a deep night sky with leaves lit from within. It is an illustration that happens to be generated from data, and it is alive.

A working prototype of this design, in both appearances and sized for phones, is in [design/index.html](design/index.html). Where the prototype and this document differ on a visual detail, the prototype is the newer decision.

One rule holds the design together: **the tree is the one bold thing.** Everything that is not the tree (menus, panels, forms, the admin area) is calm, flat and plainly worded, so the tree never has to compete.

## How the family maps onto the tree

| In the family | On the tree | Notes |
|---------------|-------------|-------|
| The focus person or founding couple | Trunk | The founders in Canopy view, "me" in Roots view |
| Parent to children | A limb that forks | Thickness shows how many descendants it carries |
| One person | A leaf | Shape shows lineage, colour shows state |
| A partnership | A blossom at the fork where two leaf stems join | Children grow from the blossom |
| A partner from another lineage | A leaf of a different species, with a small graft band on its stem | Tap the band to travel to their own tree |
| Ancestors of the focus person | Roots below the soil line | |
| Collapsed descendants | A bud with a count | Tap and the branch grows out of it |
| Someone unknown | A ghost leaf: outline only | "Do you know who this is?" |
| A pending suggestion or draft | A pencil leaf: Pencil-grey outline, hatched | Becomes ink when approved |
| A person who belongs in two places | A thin vine joining both spots | Cousin marriages, shared ancestors |
| Time | Growth rings | Rings view |
| Other people looking right now | Small birds perched on the branch they are viewing | Fireflies at night |

### Leaf states

| State | Look |
|-------|------|
| Living | Green wash, portrait in a round medallion |
| Child under one year | Small pale new leaf, slightly curled |
| Remembered (deceased) | Gold leaf. It stays on the tree in its place, never greyed out |
| Private (masked for this viewer) | Plain leaf, no portrait, labelled "Living relative" |
| You | A thin ring around the medallion and a small "You" tag |
| In your branch | Normal. Everything outside your branch is very slightly desaturated in edit mode only |
| New since your last visit | A soft glint that plays once when it scrolls into view |
| Birthday this week | A blossom on the leaf |
| Remembrance day this week | A single still firefly beside the leaf |

### Leaf species

Each lineage gets its own leaf shape, chosen by the admin: oak, olive, ginkgo, maple, fig, birch, linden, cherry. A partner who marries in keeps the species of the family they came from, so you can read where someone came from by the shape of their leaf. Children take the species of the branch they are drawn on, with a vein tinted in the other parent's colour.

Species are a small library of hand-drawn SVG symbols. Adding a species is adding one symbol, which makes it an easy first contribution for the open-source community.

## Views

| View | What it shows | When you use it |
|------|---------------|-----------------|
| Canopy | One founding couple at the trunk, all their descendants growing upward | The default family-wide view |
| Roots | You at the trunk, your ancestors as roots below, your descendants above | "Where do I come from?" |
| Rings | A cross-section of the trunk. Each ring is a decade. People sit on the ring of their birth year | Seeing generations in time |
| Grove | Every lineage as its own tree, standing side by side, joined by grafts | The big picture, and travelling between families |
| Outline | A plain indented list | Screen readers, fast keyboard editing, slow connections |
| Person page | One life: portrait, story, timeline, photos, memories, sources | Reading about someone |

Switching view never loses your place. The same people are on screen before and after, and they travel to their new positions.

### Which family a couple is drawn with

Two people from two families form one couple, and the couple can only grow from one branch. Each union therefore has a **host partner**: the couple and their children are drawn on the host's branch, and the other partner is the grafted leaf beside them.

- When a relative adds a partner to someone, the person who was already on the tree is the host. This matches what the editor sees: "I added my wife to my leaf, so she is on my branch."
- When both already exist, the host is the one whose branch the editor was working in. An admin can switch the host of any union.
- On import, the admin chooses a rule for the whole file (father's side, mother's side) in the preview.
- Inside one tree every person is drawn once. Canopy shows every descendant of the founders, whichever partner hosts.
- In Grove, each lineage is a tree of the people whose host line leads back to its founders. A person who married into another tree appears once in their birth tree as a leaf with a graft band, and once as the grafted partner in the other tree, joined by a graft line across the grove. Their children are drawn only in the host's tree.
- A partner whose own family is not recorded gets the neutral default species until their lineage exists.

## Zoom is meaning, not magnification

As you zoom, the tree changes what it draws, the way a map does. Zoom levels are separate from views: every view passes through the same levels.

| Zoom level | Roughly | What is drawn |
|------------|---------|---------------|
| Distant | Several trees fit (Grove view only) | Tree silhouettes with lineage names |
| Whole tree | One tree fits | Limbs and foliage masses. Each mass carries a count and the surname |
| Branch | A few dozen people | Individual leaves with first names. On an upright phone the tree opens at this level, filling the height with the trunk in the middle, and is panned sideways |
| Leaf | A handful of people | Portraits, full names, years, blossoms, graft bands |
| Card | One person selected | The leaf opens into a card |

A tree of 5,000 people never draws 5,000 leaves. Distant branches are foliage.

## Screens

### Tree explorer

The tree fills the whole screen. Controls float at the edges and fade back while you pan.

```
+--------------------------------------------------------------+
| Khananaev family   [Canopy v]                 (search)  (me) |
|                                                              |
|                     .  leaves and branches  .                |
|                .        fill the screen        .             |
|                                                              |
|                           |trunk|                            |
|  (minimap)                                     (+)(-)(fit)(me)|
|            1840 ----------------o---------- 2026   [> play]  |
+--------------------------------------------------------------+
```

- Top left: the family name and the view switcher.
- Top right: search, and your avatar (your leaf, your suggestions, settings).
- Bottom: the year slider, collapsed to a thin line until touched.
- Bottom right: zoom, "fit", and "my leaf". Bottom left: a small minimap of the tree silhouette.
- On a phone the view switcher and search move to a bottom bar within thumb reach.

### Person card

Tapping a leaf opens a card that grows out of the leaf itself. On a phone it is a bottom sheet with three heights.

```
+------------------------------------+
|  (portrait)  Sara Khananaev        |
|              born Levi             |
|              1921 to 2009, Baku    |
|                                    |
|  Daughter of David and Rivka       |
|  Married Yosef in 1946             |
|  4 children, 11 grandchildren      |
|                                    |
|  [Read her story]  [Focus here]    |
|  Something wrong? Suggest a fix    |
+------------------------------------+
```

### Person page

A reading page, typeset like a well-made book. Portrait, name in every script the family uses, a short life summary, then the story, a vertical life timeline, a photo gallery, memories left by relatives, and sources. A small live tree in the margin shows where this person sits and takes you back.

Suggestions appear on this page as pencil notes in the margin beside the fact they question. Approving one turns it to ink.

### Edit mode

Edit mode is entered with one button and is unmistakable. A faint trellis appears behind the tree, leaves you may edit keep their colour, and the rest fade slightly. Small bud handles appear around the selected leaf for adding relatives. A bar at the bottom shows "3 changes, all saved" with Undo.

### Review inbox

A list of suggestions, each as a before-and-after card with who suggested it, their note, and any evidence. Approve, edit and approve, or decline with a note. The affected leaf is shown in a small live tree beside the card.

### Other screens

Sign-in, setup wizard, members, branch assignment, settings, "Connect your AI", history, and compost are described in [08](08-admin-experience.md) and [09](09-mcp-and-api.md). They share one quiet layout: a single column, generous spacing, one primary action per screen.

## Colour

The palette is taken from a tree on a clear morning. There are two appearances, light and dark. The page follows the device setting until the viewer chooses one, and remembers the choice.

### Light

| Name | Hex | Used for |
|------|-----|----------|
| White | `#FFFFFF` | Sky and page background, with a faint cool tint (`#EEF4F4`) at the top and a faint green one (`#F6F8F1`) at the ground |
| Sheet | `#FFFFFF` | Cards, panels, the person page |
| Ink | `#14261F` | Text, branch outlines |
| Bark | `#4A3F35` | Branch fill |
| Canopy | `#2F6B4F` | Living leaves |
| Sprout | `#8DBF6A` | New leaves, success |
| Gold | `#C9992E` | Remembered leaves |
| Blossom | `#E58FA6` | Unions, birthdays |
| Kingfisher | `#12708A` | Everything you can press: primary buttons (white text), links, focus rings, selection, "you" |
| Graphite | `#57606A` | Secondary text |
| Pencil | `#6E7781` | Pencil strokes for suggestions and drafts, closed buds |
| Rust | `#B4432E` | Destructive actions, errors |

### Dark

| Name | Hex | Used for |
|------|-----|----------|
| Dusk | `#131C33` | Sky at the horizon |
| Deep | `#0C1322` | Sky overhead, page background |
| Slate | `#1B2740` | Cards and panels |
| Moonleaf | `#BFE3C8` | Living leaves, lit from within |
| Pale gold | `#E3C77A` | Remembered leaves |
| Firefly | `#F3D36B` | Presence, highlights |
| Night ink | `#E7EEF0` | Text |
| Night kingfisher | `#7CCDE0` | Everything you can press, at night |
| Night graphite | `#A9B4C0` | Secondary text |

### Sky

Leaves and interface have two palettes, light and dark. The sky can have four states, with dawn drawn in the light palette and dusk in the dark one. The prototype shows day and night only.

| Sky | Horizon | Overhead | Palette |
|-----|---------|----------|---------|
| Dawn | `#F2DDD3` | `#E3ECEF` | Light |
| Day | `#F6F8F1` | `#EEF4F4`, white between | Light |
| Dusk | `#4A3F5C` | `#1A2340` | Dark |
| Night | `#2B3263` | `#0C1322` | Dark |

Rules:
- Colour never carries meaning alone. A remembered leaf is gold and also has a small mark and its years. A pencil leaf is grey and also dashed.
- Kingfisher is the only interaction colour. If it is blue-green, you can press it. Canopy green belongs to leaves and is never a button.
- Every leaf, whatever its fill, has an edge line (Ink in light, a pale line in dark). Leaf shapes therefore stay distinct even where a fill is close in lightness to the sky.
- Every text and background pair is checked for contrast in the test suite (4.5:1 for body, 3:1 for large type and for the edges of leaves and controls). The pairs above were checked while writing this plan: Ink on white 15.8, Graphite on white 6.4, Kingfisher on white 5.7, white on Kingfisher 5.7, Rust on white 5.6, Night ink on Slate 12.7, Night graphite on Deep 8.8, Night kingfisher on Slate 8.3.
- Light or dark follows the device by default, with a switch in the corner of every screen. Following the viewer's local time of day is an optional setting.

Tokens are CSS custom properties with a semantic layer on top (`--surface`, `--text`, `--leaf-living`, `--action`), so a skin replaces the palette without touching components.

## Type

Two faces from one family, chosen for an organic, pen-drawn rhythm that suits botanical work and stays readable at small sizes on a leaf.

| Role | Face | Notes |
|------|------|-------|
| Names, headings, stories | Alegreya | Calligraphic serif with real italics and small figures for years |
| Interface, labels, forms | Alegreya Sans | The matching sans, so interface and tree feel related |
| Hebrew | Frank Ruhl Libre (serif), Assistant (sans) | Loaded only when Hebrew text is present |
| Other scripts | Noto Serif and Noto Sans for that script | Loaded on demand per script |

All fonts are open licensed, self-hosted, and subset. Coverage for each script is verified before launch.

Scale (rem, 1rem = 16px, ratio about 1.25): 0.8125, 0.9375, 1.0625, 1.3125, 1.625, 2.0625, 2.5625, 3.25. Body text on the person page is 1.1875rem with a line height of 1.6 and a measure of 60 to 68 characters. Interface text is 0.9375rem with a line height of 1.4.

Typographic rules:
- Sentence case everywhere. No all-caps labels.
- Years use old-style figures in running text and tabular figures in timelines.
- A person's name is always the largest thing on any surface about them.
- Pencil suggestions are set in Alegreya italic, in Graphite, tilted one degree. No third typeface.
- Uncertain dates are written the way a person would say them: "about 1890", "before 1914", "1921 or 1922".

## Shape, depth and texture

- Corners: 6px for controls, 14px for cards and sheets, full round for the portrait medallion. Three radii, each with a job.
- Depth comes from the tree itself (foliage layers, soft focus behind an open card), not from drop shadows on boxes. Panels sit flat on Sheet with a one-pixel Ink line at 12% opacity.
- Texture is reserved for the tree: a slight ink wobble on branch edges and a watercolour grain inside leaves. Interface surfaces have none.
- Icons are a single-weight line set drawn to match the branch ink, 1.5px at 24px.

## Layout

- The explorer is full bleed. Nothing frames the tree.
- Reading and admin screens use a single left-aligned column, 680px wide for reading and 880px for tables, on a 4px spacing grid.
- Minimum touch target is 44 by 44px. Leaves that are drawn smaller have an invisible larger hit area.
- Right-to-left languages mirror the interface. The tree itself does not mirror, because left and right have no meaning in a tree, but sibling order runs right to left.

## Comfort mode

One switch in the avatar menu, aimed at older relatives but useful to anyone: larger type, stronger contrast, bigger leaves and touch targets, no ambient motion, and a simplified explorer that opens in Roots view on the viewer's own family. It is also offered automatically when the device asks for larger text or reduced motion.

## Words in the interface

- Name things as a relative would: "Add child", "Suggest a fix", "Undo", "People you can edit".
- A button says what happens, and the confirmation uses the same word: "Approve" then "Approved".
- Empty states invite: an empty branch says "Nobody here yet. Add the first person."
- Errors say what happened and what to do: "That would make Sara her own grandmother. Check who you connected."
- The botanical words that do appear in the interface are the view names (Canopy, Roots, Rings, Grove) and Compost. Everything else is plain.

## Themes and skins

A theme is a package of: colour tokens, type tokens, a leaf and blossom symbol library, a branch drawing style, an ambient layer, and motion presets. The botanical theme is the default and the only one in v1. The theme interface is public so the constellation and atlas worlds, or anyone's own idea, can be added without touching the layout engine. See [05](05-architecture.md).

The admin can adjust the default theme from the UI: palette accents, species per lineage, a "tidy to wild" slider for how organic the branches are, and switches for each ambient effect.
