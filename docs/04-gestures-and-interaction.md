# 04 Gestures and interaction

The tree is operated directly. This doc defines every gesture on every input, how gestures are told apart, and the keyboard and screen reader model.

## Principles

1. **Everything has three ways in:** touch, pointer and keyboard. No action exists only as a gesture.
2. **Gestures are shortcuts, buttons are the truth.** A long-press menu, a visible button and a keyboard key all reach the same action.
3. **Follow the finger.** While something is being dragged or pinched, it tracks the input exactly. Easing happens only on release.
4. **Forgiving.** Small accidental movements do not turn a tap into a drag. Destructive results always offer Undo.

## Exploring

| Intent | Touch | Trackpad | Mouse | Keyboard |
|--------|-------|----------|-------|----------|
| Move around | One-finger drag, with momentum | Two-finger scroll | Drag the background | Shift + arrows |
| Zoom | Pinch, centred between the fingers | Pinch, or Ctrl/Cmd + scroll | Wheel, centred on the pointer | `+` and `-` |
| Zoom with one hand | Double-tap, hold, then drag up or down | | | |
| Zoom in on a spot | Double-tap | Double-click | Double-click | |
| Zoom out a step | Two-finger tap | | | |
| Fit the whole tree | Tap the fit button | | | `0` |
| Go to my leaf | Tap the "my leaf" button | Click it | Click it | `M` |
| Open a person's card | Tap a leaf. The card opens at its smallest height | Click | Click | Arrows to move, Enter to open |
| See more of the card | Drag the card up | Scroll the card | Scroll the card | Tab into the card |
| Open their page | Tap "Read their story" | Click it | Click it | Enter on the card |
| Close a card | Swipe it down, or tap the tree | | Click the tree | Esc |
| Next or previous sibling | Swipe the card left or right | | | Left and right arrows |
| Expand a branch | Tap a bud, or pinch outward over it | Click, or pinch out | Click | Space |
| Collapse a branch | Long-press the limb, then "Collapse" | Right-click the limb | Right-click the limb | Space |
| More actions | Long-press a leaf | Two-finger click | Right-click | `.` or the Menu key |
| Search | Tap search | | | `/` |
| Scrub through time | Drag the year slider | | Drag | `[` and `]` |
| Play the time-lapse | Tap play | | | `P` |
| Find a relationship | Long-press a leaf, "How are we related?", tap another leaf | Same from the menu | Same | `R`, then choose |
| Switch view | View switcher | | | `1` to `5` |

Zooming across a level boundary expands or folds branches automatically (see "Zoom is meaning" in [02](02-visual-design.md)). A branch you opened by hand stays open until you close it.

### The petal menu

Long-press (or right-click) opens a ring of five actions around the leaf, drawn as petals. There are two sets.

```
   While exploring                     In edit mode

        Focus here                       Add relative
  Read story    How are we         Edit details   Connect to…
       ( leaf )     related?              ( leaf )
  Suggest a fix     Share            Remove       Focus here
```

In the exploring set, "Suggest a fix" is replaced by "Edit" for anyone who may edit that person directly. In edit mode, anyone without edit rights there sees the same five actions, and whatever they do lands as a suggestion.

- On touch it is a marking menu: keep your finger down, slide to a petal, release. Once learned it takes a quarter of a second and no looking.
- It also works as tap-to-open, tap-to-choose, and with arrow keys and Enter.
- Near a screen edge the ring becomes an arc that stays on screen.

## Editing

Edit mode is entered with the Edit button or `E`. Every editing gesture below also exists as a form reached from the petal menu.

| Intent | Gesture | Result |
|--------|---------|--------|
| Add a relative | Drag a bud handle out of the selected leaf | A twig follows your finger with a ghost leaf at its tip. Release and a short form opens on the ghost leaf: name, year, done |
| Choose which relative | The direction you drag | Up: child. Down: parent. Toward the partner side: partner. Along the branch: sibling. The ghost label names it as you move |
| Connect two existing people | Drag a bud handle and drop it on another leaf | Asks "Yosef is Sara's…" with the options that make sense, then connects them |
| Edit a fact | Tap the fact on the card | Edits in place. Saves when you leave the field |
| Change a portrait | Tap the medallion, or drop an image on the leaf | Crop to circle, save |
| Reorder siblings | Drag a leaf along its limb | Only when birth dates are unknown. With dates, order is automatic |
| Remove | Petal menu, "Remove" | The leaf falls to compost. A bar offers Undo for 10 seconds, and it stays restorable for 30 days |
| Select several | Shift + drag a lasso on the background (desktop), or long-press then tap more leaves (touch) | Bulk actions: assign a steward, set privacy, remove |
| Undo, redo | Two-finger double-tap, or the Undo button | Cmd/Ctrl + Z, Shift + Cmd/Ctrl + Z |
| Leave edit mode | Done button | Esc |

Details that make pulling a twig feel right:
- Bud handles sit above, below and beside the selected leaf, 44px targets, visible only in edit mode.
- The twig snaps toward the four relationship zones with a light haptic tick where the device supports it, and the ghost leaf's label changes ("Child of Sara and Yosef").
- If the person has several partners, dragging up fans out one blossom per union to choose which family the child joins.
- Dropping outside every zone cancels and the twig draws back.
- When the viewer cannot edit that person directly, the same gesture works and the new leaf lands as a pencil leaf: a suggestion. The bar says "Sent to Daniel for review".

The form on a new leaf asks for as little as possible: given name, family name (pre-filled), and one of birth year or "living". Everything else can be added later.

## Telling gestures apart

One recogniser handles all pointer input on the tree.

```
idle
  press on background ──move > 8px──> pan ──release──> momentum ──> idle
  press on a leaf ─────release < 280ms, moved < 8px──> tap
                  ─────held 450ms, moved < 8px──────> petal menu
                  ─────move > 8px───────────────────> pan
  press on a bud handle (edit mode) ──move > 8px────> pull twig
  second finger down at any time ───────────────────> pinch (cancels the above)
  tap, then press within 280ms and move ────────────> one-hand zoom
  tap, then tap within 280ms ───────────────────────> zoom in
```

- Tap slop is 8px (12px for coarse pointers). Long-press is 450ms. Double-tap window is 280ms.
- A single tap on a leaf opens its card immediately. It does not wait for a possible double-tap, because double-tap on a leaf is not a gesture. Double-tap zoom applies to the background and to foliage.
- Pinch always wins. Adding a second finger cancels a pan, a twig pull or a long-press cleanly.
- Momentum decays over time, not per frame, so it feels the same at 60 and 120 frames per second.
- At the edges of the tree, panning stretches like a rubber band and springs back.
- Zoom limits: from "the whole grove fits with a margin" to "one leaf fills a third of the screen".
- The canvas sets `touch-action: none` and handles its own scrolling. Cards and sheets scroll normally.
- Browser back closes the card, then the person page, then leaves the tree. Selected person, view and camera position are in the URL, so any state can be shared as a link.

## Phone specifics

- The card is a bottom sheet with three heights: a peek (name and years), half, and full. Dragging it follows the finger and it snaps on release.
- Primary controls sit in the bottom third. The top of the screen holds only the family name.
- In landscape, the card becomes a side panel so the tree keeps its width.
- Haptics are used for: snap to a relationship zone, petal chosen, change saved. They are light, optional, and silent where the platform does not support them.
- Installed as a PWA, the last viewed tree opens offline for reading. Editing requires a connection in v1.

## Keyboard

The tree is one tab stop. Inside it, arrow keys move along family relationships, not screen positions.

| Key | Action |
|-----|--------|
| Up | To a child (the first, or the last one visited) |
| Down | To a parent |
| Left, Right | Between siblings, and between a person and their partner |
| Enter | Open the card. Enter on the card's "Read their story" opens the person page |
| Space | Expand or collapse the branch |
| `.` or Menu | Open the petal menu |
| `/` | Search |
| `F` | Focus the tree on this person |
| `M` | Go to my leaf |
| `R` | How are we related? |
| `E` | Enter or leave edit mode |
| `A` then `C`, `P`, `S`, `B` | In edit mode: add child, parent, spouse or partner, brother or sister |
| `+`, `-`, `0` | Zoom in, zoom out, fit |
| Shift + arrows | Pan |
| `1` to `5` | Canopy, Roots, Rings, Grove, Outline |
| `[`, `]`, `P` | Year back, year forward, play |
| Cmd/Ctrl + Z | Undo |
| `?` | Show this list |
| Esc | Close the top-most thing |

Up means child because descendants grow upward. If the admin chooses the classic orientation (ancestors on top), Up and Down swap so that keys always match what is on screen.

The camera follows keyboard focus, and the focused leaf carries a 2px Kingfisher ring with a 2px gap, visible on every background.

## Screen readers

- The tree exposes each visible person as a focusable item with a full spoken label: "Sara Khananaev, born Levi, 1921 to 2009. Daughter of David and Rivka. Married to Yosef. 4 children. Branch expanded."
- Relationship moves are announced: "Moved to child, 2 of 4: Daniel Khananaev."
- Live changes are announced politely: "New: Maya Cohen added as daughter of Noa and Eitan."
- The Outline view is a standard tree widget with the same data and the same actions, and is offered as the first link on the page for screen reader users.
- Every gesture-only affordance (bud handles, lasso, petal menu) has a labelled button equivalent.
- Automated accessibility checks run on every screen in the test suite, and a manual pass with VoiceOver and NVDA is part of the launch checklist.

## What the React package exposes

The package ships all exploring gestures. Editing gestures are opt-in and raise events (`onAddRelative`, `onConnect`, `onRemove`, `onEditField`) so the host decides what happens. The gesture thresholds above are props with these defaults. The keyboard map can be extended or replaced.
