# 03 Motion and SVG

This doc lists every transition in the product and the SVG techniques that produce them. It is written so that each effect can be built and tested on its own.

## Motion principles

1. **Growth, not animation.** Things appear by growing from where they attach, and leave by drawing back to it. Nothing fades in from nowhere or slides in from the side.
2. **Answer an action or report a change.** Motion happens because you did something or because the family changed. The only exception is ambient life (wind, sky), which is close to subliminal.
3. **One hero moment.** The first time the tree loads in a session, it grows from the trunk. It takes at most 2.4 seconds, any input skips it, and it never plays twice in a session.
4. **Stay out of the way.** Ambient motion stops the moment you touch the tree and resumes after you let go.
5. **Springs for things you move, curves for things that grow.** Dragged or released objects use springs so they can be interrupted. Growth uses a fixed ease so a branch always takes the same, readable time.
6. **Nothing is lost without motion.** With reduced motion, every transition becomes a short crossfade and every piece of information is still shown.

## Timing tokens

| Token | Value | Used for |
|-------|-------|----------|
| `instant` | 90ms | Press feedback |
| `quick` | 160ms | Hover, small state changes |
| `base` | 240ms | Panels, menus |
| `grow` | 520ms per generation | Branch growth |
| `settle` | 700ms | Layout moves after an edit |
| `cinema` | 1200 to 2400ms | First load, view switches, fly-to |

Easing: `grow` uses `cubic-bezier(0.2, 0.8, 0.2, 1)` (quick start, long settle, like a shoot reaching for light). Retraction uses the same curve reversed at 60% of the duration.

Springs (stiffness, damping, mass 1): `leaf` 320, 22. `card` 260, 28. `branch` 180, 26. `camera` 120, 24.

## Catalogue of transitions

| Moment | What happens | Timing | Reduced motion |
|--------|--------------|--------|----------------|
| First load | Trunk draws upward, limbs follow generation by generation, leaves unfurl outward from the trunk | `cinema`, skippable | Tree appears, 200ms fade |
| Expand a bud | The bud opens, the limb grows from it, twigs branch off as the growing tip passes them, leaves unfurl in order of distance. The camera eases to keep the new growth in view | `grow` per generation, at most 3 generations animated, the rest appear | Crossfade |
| Collapse | Leaves fold, twigs draw back into the limb, the limb draws back into a bud | 60% of expand | Crossfade |
| Focus or hover a leaf | Leaf lifts slightly and its medallion gains a Kingfisher ring. The route to the trunk brightens | `quick` | Ring only |
| Leaf to card (tap) | The medallion is the shared element. It travels and scales into the card's portrait while the card grows from the leaf. The tree behind softens and dims. Interruptible: tapping elsewhere mid-flight reverses it | `card` spring | Card fades in |
| Card to person page | A route change. The card expands to the full page. Portrait and name stay continuous | `base`, browser view transition | Page fade |
| Page back to tree | A route change. The portrait returns to its leaf, wherever that leaf now is | `base`, browser view transition | Fade |
| Close a card | The card draws back into its leaf | `card` spring | Fade |
| Refocus ("Focus here") | The chosen leaf travels to the trunk position. Every other person moves to their new place. Roots regrow below | `cinema` | Crossfade |
| Switch view | People travel from their old positions to their new ones. Branches morph. In Rings view, branches thin to nothing as rings draw | `cinema` | Crossfade |
| Search result | Non-matching foliage dims. The camera flies out, across, and in. A light travels along the branches from the trunk to the match | `cinema` | Jump, match ringed |
| Relationship path | The path between two people fills with moving light, like sap. A label names the relationship | Loops while shown | Static highlight |
| Enter edit mode | Trellis fades in behind. Non-editable leaves lose a little colour. Bud handles appear on the selected leaf | `base` | Same, instant |
| Pull a twig | A twig stretches from the leaf to your finger with a ghost leaf at its tip. It snaps toward relationship zones | Follows the finger, `leaf` spring on release | Same without spring |
| Change saved | The new leaf's pencil outline floods with colour from the stem outward | `grow` | Colour change |
| Someone else's change arrives | The new leaf grows in place. If off screen, an edge glint points toward it | `grow` | Appears |
| Suggestion made | A pencil leaf or pencil margin note sketches itself in | `base` | Appears |
| Suggestion approved | Ink bleeds across the pencil lines from one corner | `grow` | Colour change |
| Suggestion declined | The pencil lines are lifted away, as if erased | `base` | Fade out |
| Remove to compost | The leaf loosens and drifts down out of view. Undo brings it back up | `settle` | Fade out |
| Year slider | Branches lengthen or shorten, leaves appear at births, turn gold at deaths, blossoms open at unions | Follows the slider, or plays at one decade per second | Steps by decade |
| Birthday | A blossom opens on the leaf the first time it enters view that day | `grow`, once | Shown open |
| New since last visit | A glint sweeps the leaf once when it enters view | 600ms, once | Small dot |
| Light to dark, and back | The old and new pictures of the whole page are cross-faded by the graphics card, so the change is slow and complete and stays smooth however large the tree is. Inside the new picture the sun sets as the moon rises, then stars and fireflies arrive, and the switch's thumb slides across. Where a browser cannot cross-fade, every colour drifts to its new value instead | About 1.5s for the fade, 2 to 2.6s for sun, moon and stars | Instant |
| Roots | A first small root goes down before the trunk comes up. From then on the roots grow in step with the tree, slightly ahead of it, and finish when the crown does: the taproot first, then side roots a pair at a time, each forking only once its tip has passed the fork point, and all of them thickening as the tree gets bigger. Going back in time draws them in again | In step with the crown. The first root takes about half a second | Jump to size |
| Camera | Dragging has momentum: let go and the tree drifts to a stop. A mouse wheel eases toward where it is heading instead of jumping a notch at a time. "Whole tree" and bringing a chosen leaf into view glide. Any touch or scroll takes over at once | 750ms and 320ms for glides | Jump |
| Controls | Buttons ease between states and press in slightly. The card draws back before it disappears. The hint fades away after the first touch. Names fade out and in across zoom levels | 180 to 450ms | Instant |
| Wind | Every several seconds a gust crosses the tree from left to right and the leaves stir in turn, a few degrees each. A fast pan can send a gust through as well. Between gusts the tree is still | 2.8s per leaf, staggered across about 1.5s | Off |

## SVG techniques

### Layer stack

```
HTML   day sky, night sky                            (two layers, cross-faded)
HTML   #world                                        (carries the camera)
  HTML   sun, washes, moon, stars                    (behind the tree)
  SVG    ground, roots, branches, blossoms, leaves, names
  HTML   fireflies                                   (in front of the tree)
HTML   cards, menus, controls
```

**The camera is a CSS transform on `#world`, which sits on its own compositor layer.** Panning and zooming are then done entirely by the graphics card: nothing is redrawn while the tree moves. While zooming, the tree is a picture being scaled. A moment after it comes to rest at a new zoom, it is redrawn once, sharp, at that size, the way a map does.

Anything that animates on its own (sun, moon, stars, fireflies) is an ordinary HTML element animating only `transform` or `opacity`, so it never causes the tree to be redrawn either.

### 1. Tapered branches

A limb is a filled shape, not a stroke, so it can taper.

1. The layout engine gives each link a start point, an end point and two widths.
2. Build a cubic centreline with vertical tangents at both ends, so limbs leave the parent upward and arrive at the child upward.
3. Add wobble: displace the two control points sideways by seeded noise. The seed is the link's id, so the same branch always bends the same way, on every device and every render. Amplitude is `length × wildness × 0.12`.
4. Sample the centreline at a fixed 12 points. At each, step out along the normal by half the interpolated width, left and right.
5. Join left points forward and right points backward into one closed path with smooth joins.

Because every limb has exactly the same number of points in the same order, any limb can morph into any other by interpolating numbers. No path-morphing library is needed.

Width follows the pipe model that real trees follow: a limb carrying `n` people has width `leafWidth × n^0.45`, clamped. The trunk ends up visibly thick and outer twigs hair-thin without any hand tuning.

### 2. Growth reveal

A tapered fill cannot be animated with a dash offset, so the limb is revealed through a mask.

```svg
<mask id="grow-b17">
  <path d="[centreline]" pathLength="1" stroke="white" fill="none"
        stroke-width="[max width + 4]" stroke-linecap="round"
        stroke-dasharray="1" stroke-dashoffset="1" />
</mask>
<path d="[tapered outline]" mask="url(#grow-b17)" />
```

Animating `stroke-dashoffset` from 1 to 0 makes the limb grow along its length with a rounded tip. Child limbs start when the parent's reveal passes the point where they attach, so growth travels through the tree at a constant speed. Masks are removed when growth completes.

### 3. Leaves

- Every species is one `<symbol>`. Each person is a `<use>` of it, coloured through CSS variables (`--leaf`, `--vein`, `--edge`), so a thousand leaves cost a thousand small nodes and no duplicated geometry.
- Unfurl: scale from 0.2 with a rotation of -25 degrees to rest, on the `leaf` spring, with `transform-box: fill-box` and the origin at the stem.
- Watercolour: flat fill, plus a radial gradient for a wet edge, plus one shared noise pattern at low opacity for grain. No per-leaf filters.
- Portraits are clipped to a circle inside the leaf and loaded only at the Leaf zoom level, with a blurred placeholder first.

### 4. Hand-inked edges

The slight pen wobble is part of the branch's shape, not a filter. When a branch outline is built, each edge point is pushed in or out by a fraction of a pixel to a pixel and a half, using a small repeatable noise keyed to the branch's id and the distance along it. The result is a hand-drawn line that costs nothing to display, never needs switching off while moving, and exports to a poster as plain vector.

An SVG turbulence filter gives a similar look and was the first approach. It was dropped because it is recomputed for every pixel whenever anything near it is redrawn, which made the whole tree expensive to animate.

### 5. Wind

- Wind arrives as a gust. Each leaf has a one-shot sway of a few degrees, and its start is delayed by its horizontal position, so the gust visibly travels across the crown.
- A gust comes every 7 to 12 seconds when nothing else is happening: not while the tree is growing, being moved or touched, and not while the tab is hidden.
- Between gusts nothing moves, so nothing is redrawn. A tree that is always trembling keeps the device busy for no benefit and makes the first touch feel late.
- On phones that grant motion access, tilting the device can trigger a gust in that direction.

### 6. Foliage masses

At the Whole tree zoom level, the leaves of a collapsed or distant subtree are replaced by one soft cloud shape, built from the convex hull of the subtree's layout expanded and rounded, filled with the lineage's leaf colour and a scatter pattern of that species' leaf. It carries a count and a surname. Zooming in dissolves the mass into its leaves by cross-fading the two levels over a short zoom range.

### 7. Sap light and route highlights

The path between two people is drawn as a second stroke over the centrelines with a dashed gradient whose offset animates, so light appears to flow from one person to the other. The glow is a blurred copy on the canvas layer, not an SVG filter.

### 8. Blossoms

Five petals, each a `<use>` of one petal symbol rotated by 72 degrees. Opening is a staggered scale from the centre. A union that has ended is drawn as a closed bud in Pencil grey.

### 9. Pencil and ink

- Pencil: a dashed Pencil-grey stroke with a diagonal hatch pattern fill.
- Inking on approval: the full-colour version is revealed through a circular mask whose edge is roughened by turbulence, expanding from the stem. It reads as ink soaking into paper.

### 10. Gold leaf

Remembered leaves use a linear gradient with a narrow bright band. On hover or focus only, the gradient's transform animates once across the leaf, a brief catch of light. It never loops.

### 11. Rings view

Rings are near-circles with a little seeded noise in the radius, darker at decade boundaries, with the decade written along the ring on a text path. People sit at their birth year's radius, at an angle taken from their Canopy position, so relatives stay near each other and the switch between the two views is a readable journey.

### 12. Year slider

Each person has a birth year and an optional death year. Each limb's reveal progress is a function of the slider year and its child's birth year. Scrubbing sets the same mask offsets used for growth, so the slider reuses the growth code and stays cheap. People with unknown years appear with their nearest sibling or parent.

### 13. Camera flights

Fly-to uses the smooth zoom-and-pan path from cartography (zoom out, travel, zoom in, with constant perceived speed), so long jumps across a large tree never smear across the screen. Duration grows with the logarithm of the distance and is capped at `cinema`.

### 14. Shared elements and routes

Two mechanisms, each where it fits:

- **Leaf to card, and card back to leaf**, happen inside the explorer without a route change. They use Motion's shared layout animation on the `card` spring, so they follow the finger on a bottom sheet and can be interrupted and reversed.
- **Card to person page, and page back to tree**, are route changes. They use the browser's View Transitions API with a `view-transition-name` on the selected person's portrait and name. Where it is not available, the page fades.

### 15. Sky

The sky is a CSS gradient whose stops are custom properties. Four skies (dawn, day, dusk, night, defined in [02](02-visual-design.md)) are interpolated from the viewer's local time. Leaves and interface switch between the day and night palettes once, at the start of dusk and at the start of dawn. Fireflies are 20 to 40 soft dots on the canvas with slow sine wander. They double as presence at night: one firefly holds near each branch another relative is viewing.

### 16. Poster export

The same renderer produces a pure vector SVG at a fixed size with every branch expanded. No filters and no masks are used: the ink wobble is applied to the path geometry itself, by sampling the outlines more densely and displacing the points with the same seeded noise. Fonts are embedded. The PDF is made from that SVG in the browser, so no headless browser is needed on the server and the export works the same in every deployment mode. Sizes: A2, A1, 24 by 36 inches.

## Performance budget

| Measure | Budget |
|---------|--------|
| Pan and zoom | 60 frames per second with 500 leaves visible on a mid-range phone |
| SVG nodes on screen | Under 4,000 at any zoom |
| Elements animating at once | Under 150 |
| Time to an interactive tree | Under 2 seconds on 4G for a 1,000-person tree |
| Layout of 10,000 people | Under 100ms, off the main thread |
| Idle processor use with ambient motion | Under 5% of one core |

Rules that keep it there:
- Animate only `transform`, `opacity` and the dash offset used for growth.
- Draw only what the camera can see, found through a spatial index. Detail level changes with zoom.
- No SVG filters on anything that moves or sits beside something that moves. Texture is built into shapes or into static backgrounds.
- The camera never redraws the tree. Per-frame work is limited to the branches and roots that are actually growing.
- Page content is written only when it changes, never once per frame "just in case".
- Ambient effects have a quality ladder (full, light, off) chosen from a quick frame-time measurement during the first load and overridable in settings. Low battery mode and reduced motion force "off".
- Every effect has a story in the component workshop and a frame-time test that fails the build if it regresses.

## Libraries

- **Motion** (MIT) for springs, shared layout and gesture-linked values in React.
- **CSS and the Web Animations API** for ambient loops and growth, so they run off the main thread.
- No path-morphing, charting, or zoom libraries. Branch geometry, morphing and the camera are small, purpose-built and tested in the core package.
