---
title: The React package
description: The reactive-family-tree React component. How to give it a family, its props, its handle, the stylesheet it needs, and what is not built yet.
---

`reactive-family-tree` is the tree on its own, as one React component. It draws a family as a living tree and tells you what happens on it. It never talks to a server, so it works with data from anywhere.

**The package is not published to npm yet.** Today it lives in this repository as `packages/react` and is used as TypeScript source by the app and by this site. The live tree on the [home page](/) and in the [demo](/demo/) is this component.

## A small example

```tsx
import { useState } from 'react';
import { FamilyTree } from 'reactive-family-tree';
import type { TreeData } from 'reactive-family-tree';
import 'reactive-family-tree/tree.css';

export function Tree({ data }: { data: TreeData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <FamilyTree
        data={data}
        selectedId={selectedId}
        onSelect={(person) => setSelectedId(person?.id ?? null)}
      />
    </div>
  );
}
```

Three things to know before it draws anything:

- **Load `tree.css`.** It holds every colour and shape of the tree.
- **Give it a box.** The tree's root element is `#stage`, placed with `position: absolute; inset: 0`. Put it in a container that has `position: relative` and a real height.
- **One tree per page.** The markup uses fixed ids, such as `#stage` and `#tree`.

The drawing runs only in the browser. On a server the component renders an empty stage, and the tree grows once the page is loaded. It needs React 19.

## The data

`data` is the family as a tree to draw:

```ts
interface TreeData {
  people: TreePerson[];
  unions: TreeUnion[];
  rootId: string | null;
}
```

A person is either a full leaf or a masked one:

```ts
interface PersonLeaf {
  id: string;
  given: string;
  family: string;
  birthName: string;
  sex: 'female' | 'male' | 'other' | 'unknown';
  born: number | null;      // a year
  died: number | null;      // a year
  gone: boolean;            // no longer living
  privacy: 'default' | 'public' | 'members' | 'private';
  pending: PendingMark | null;   // only in a suggestion or a draft so far: drawn in pencil
  editing: 'apply' | 'suggest' | 'none';
}

interface MaskedLeaf {
  id: string;
  masked: true;
}
```

A union joins one or two partners and holds their children:

```ts
interface TreeUnion {
  id: string;
  partners: string[];
  host: string | null;      // the partner whose branch the couple is drawn on
  since: number | null;     // a year
  status: 'current' | 'ended' | 'unknown';
  kind: 'marriage' | 'partnership' | 'unknown';
  pending: PendingMark | null;
  children: { id: string; kind: 'birth' | 'adopted' | 'step' | 'foster' | 'unknown' }[];
}
```

The app's own `GET /api/tree` answers in this shape, already filtered for whoever asks. This site builds the same shape in the browser, from the demo family, with the rules in `packages/core`.

## Props

Only `data` is required.

| Prop | Type | What it does |
| --- | --- | --- |
| `data` | `TreeData` | The family to draw. When it changes, new people grow in and everyone else moves to make room. |
| `viewerId` | `string \| null` | Whose leaf is ringed as "you". |
| `focusId` | `string \| null` | Show the family this person belongs to, instead of the one at `rootId`. |
| `year` | `number` | The year being shown. People born later are not on the tree yet. The default is this year. |
| `playing` | `boolean` | The years are being played through. The moon steps out of the sky until they stop. |
| `place` | `{ latitude: number; longitude: number } \| null` | Where the family is, in degrees, north and east positive. The sun and the moon are drawn as they stand over that place right now. |
| `editing` | `boolean` | Edit mode. The chosen leaf gets + buds for the relatives that can be added. |
| `selectedId` | `string \| null` | The chosen leaf. You keep it, usually from `onSelect`. |
| `matches` | `ReadonlySet<string> \| null` | Search results. These people keep their colour and everyone else steps back. |
| `route` | `readonly [string, string] \| null` | Light the branches between two people. |
| `tints` | `ReadonlyMap<string, string> \| null` | Ring each person's leaf in a colour, by person id. |
| `faces` | `boolean` | Show a round photo in place of the leaf, for everyone who has one. |
| `portraitOf` | `(person) => string \| null` | Where someone's photo is. Asked only while `faces` is on, for people whose `portrait` is set. |
| `insets` | `{ right: number; top: number; left?: number }` | Room taken by an open side panel and a banner, in pixels. The tree keeps clear of it. A page read from the right opens its panel on the left. |
| `label` | `string` | What a screen reader calls the drawing. The default is "The family tree". |
| `labels` | `Partial<TreeLabels>` | The few words drawn on the tree or read out by a screen reader, in your page's language: `showBranch`, `livingRelative`, `unknown`, `draft`, `suggested`, `relations` (the word under each + bud) and `addRelation(relation)`. Anything left out is English. Names come from `data`, so put them in the reader's language there. |
| `className` | `string` | A class for the stage. |
| `ref` | `Ref<FamilyTreeHandle>` | The handle described below. |

What happens on the tree comes back through these:

| Prop | Called when |
| --- | --- |
| `onSelect(person \| null)` | A leaf was tapped, or the open ground, which gives `null`. |
| `onAdd({ person, relation })` | A + bud was tapped or pulled out. `relation` is `'child'`, `'partner'`, `'parent'` or `'sibling'`. |
| `onHold({ person, x, y, keyboard })` | A leaf was pressed and held, right-clicked, or its menu key was pressed. Use it to open a menu at that point. |
| `onHoldMove(x, y)` | The finger that is still down has moved. |
| `onHoldEnd(x, y)` | That finger has lifted. |
| `onMoved()` | The view moved or zoomed. |

Editing is yours to do. The component shows the + buds and reports the gesture. Saving the new relative, and giving the tree new `data`, is up to your code.

## The handle

Pass a `ref` to move the view or to ask where things are.

| Member | What it does |
| --- | --- |
| `fit(whole?, animated?)` | Fit the tree to the stage. With `whole`, show all of it even on a narrow screen. |
| `flyTo(personId)` | Bring a person to the middle, close enough to read. |
| `zoomStep(factor)` | Zoom in or out about the middle. `1.5` is one step in. |
| `panBy(dx, dy)` | Shift the view by that many pixels. |
| `leafRect(personId)` | Where a leaf is on the screen, or where it will come to rest while the view is moving. `null` if the person is not shown. |
| `toggleBranch(personId)` | Fold or open the branch below a person. |
| `hasBranch(personId)` | `{ collapsed }` if the person has a branch below them, otherwise `null`. |
| `addable(personId)` | Which relatives can be added to this person. |
| `yearRange()` | `{ min, max }`: the first birth year and this year. |
| `focus()` | Put the keyboard on the tree. |
| `trunkX` | Where the trunk stands on the screen, in pixels. |
| `freeWidth` | The width of the stage not covered by a side panel. |
| `still` | `true` when nothing moves by itself. See below. |
| `editing` | Whether edit mode is on. |
| `selectedId` | The chosen leaf. |

The handle works from the moment the component is on the page. Before that, and after it is gone, calling it throws.

## Look and motion

- **Light and dark.** Every colour is a CSS custom property. Dark is `data-theme="dark"` on the `<html>` element.
- **Right to left.** On a page with `dir="rtl"` the tree itself is not mirrored: a family is drawn the same way for everyone. Give the stage `direction: ltr` so its labels sit where they are placed, and pass `insets.left` for a panel that opens on the left.
- **Type.** Names are set in Literata and controls in Source Sans 3. Load the two fonts yourself. Without them the tree falls back to Georgia and the system font.
- **The sky.** By day there is a sun, and in the dark a moon and stars. The moon is the real one: it shows tonight's phase, worked out from the date and time, and its glow is strong when it is full and nearly gone when it is new. Give the tree a `place` and the moon is turned the way it is seen from there, lit on the right from the north, on the left from the south, and from below near the equator. Near sunrise and sunset in that place the sun is warmer. Without a place the moon is drawn as it is seen from the north. The sun, the moon and the stars are far away, so they keep their place and nearly their size while the tree is moved and zoomed, and they fade when someone comes close to read. While `playing` is on the moon is hidden, since it is tonight's moon and the years are going by.
- **Reduced motion.** If the device asks for less motion, the tree is shown fully grown at once and nothing moves by itself. Adding `#still` to the page's address does the same. The component sets a `still` class on `<html>` so your own page can follow.

## With the keyboard

The tree is one stop for the Tab key. From there the arrow keys travel along the family: up to a child, down to a parent, sideways along partners and siblings. Enter chooses a leaf, and Space folds or opens a branch.

## What else the package exports

- `LeafPortrait`: one leaf drawn exactly as on the tree, for a person's card. It uses the gradients of a tree on the same page.
- `TreeEngine`: the engine under the component, plain DOM with no React. It draws into the markup the component renders: a stage holding an empty `.heavens` layer and the world, and in the world `.behind`, the `<svg>` and `.ahead`.
- `useTreeMusic(lively, options)`: background music for a page that shows the tree. `lively` is true while the years are playing, and the melody turns quicker. `options.mode` is `'none'`, `'off'` (the default: silent until the visitor turns it on) or `'on'` (from the visitor's first click, since a browser allows no sound before one). `options.playMusic` (true unless you say otherwise) is a separate thing: whether the quick tune plays with the years, which it does whether or not the background melody is on. `options.melody` is the id of one of `MELODIES`, for the background, and `options.playMelody` the id of one of `QUICK_TUNES` (the melody's own, when left out). It gives back `{ available, on, toggle, wake }` for buttons of your own, and remembers each visitor's choice on their device. An iPhone lets a page start its sound only inside the tap that asks for it, so call `wake()` from the click of any button that asks for music other than `toggle`, such as your Play button when the quick tune plays with the years. On an iPhone, music asked for this way plays even with the silent switch on; the melody that starts by itself on a first click does not.
- `MELODIES` and `QUICK_TUNES`: the calm melodies and the quick tunes to choose from, each with an `id`, a `name` and a line `about` it. Every melody brings a quick tune under its own id, and there are more quick tunes besides. Nothing is a recording: the browser plays every note, so there are no audio files to host.
- `TreeMusic`: the player under the hook, with no React. `new TreeMusic(melody, quickTune, context)` plays on an `AudioContext` you hand it, and leaves stopping and closing that context to you. Without one it makes its own.
- `skyOver(when, place)`: the arithmetic behind the sky, for a line of words of your own. It gives how much of the moon is lit (`lit`, 0 to 1), whether that is growing (`waxing`), and with a place how high the sun and the moon stand over it, in degrees (`sunHeight`, `moonHeight`).
- The types: `FamilyTreeProps`, `FamilyTreeHandle`, `TreeData`, `TreeInsets`, `YearRange`, `BranchState`, `Camera`, `TreeEngineEvents`, `TreeEngineOptions`, `LeafPortraitProps`, `LeafState`, `LeafSubject`, `Melody`, `Mood`, `TreeMusicOptions`, `TreeMusicSwitch`, `Place` and `Sky`.

## Not built yet

These are planned and are not in the package today:

- Views other than this one.
- A theme interface for other looks.
- A function that renders the tree to a static SVG on a server.
- Hooks for using the layout or the camera on their own.
