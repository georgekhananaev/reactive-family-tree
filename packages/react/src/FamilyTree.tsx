'use client';

/*
 * The family tree as one React component.
 *
 * React renders the stage: the two skies, the year in the sky, an empty layer
 * for the sun, the moon and the stars, and the empty drawing the tree goes
 * into. Everything on the tree itself is then drawn by the engine, by hand
 * and outside React, because it changes on every frame. Props are handed to
 * the engine as they change, and what happens on the tree comes back through
 * the callbacks.
 *
 * The markup keeps the ids that tree.css draws by, so a page holds one tree.
 * Author: George Khananaev
 */

import { useEffect, useImperativeHandle, useRef } from 'react';
import type { ReactElement, Ref } from 'react';
import type { PersonLeaf, Relation, TreePerson } from '@reactive-family-tree/core';
import { FACE_RADIUS, TreeEngine } from './engine';
import type { BranchState, TreeData, TreeInsets, TreeLabels, YearRange } from './engine';
import { THIS_YEAR } from './leaf';
import type { PondChoice } from './pond';
import type { MoonChoice, Place } from './sky';

export interface FamilyTreeProps {
  data: TreeData;
  /* Whose leaf is ringed as "you". */
  viewerId?: string | null;
  /* Show the family this person belongs to. */
  focusId?: string | null;
  /* The year being shown. Defaults to this year. */
  year?: number;
  /* The years are being played through. The moon, which is tonight's, steps out of the sky until they stop. */
  playing?: boolean;
  /* Where the family is. The sun and the moon are drawn as they stand over that place right now. Without one, the moon is seen from the north. */
  place?: Place | null;
  /* Which moon to show after dark: tonight's real one (the default), 'full', 'none', or the moon of a day, as { day: '1922-04-12' }. */
  moon?: MoonChoice;
  /* A Japanese pond on the ground beside the tree, with koi swimming in it and now and then one leaping: the garden pond with a bridge, a pine and a bamboo spout, or the smaller koi pond. None unless asked for. */
  pond?: PondChoice;
  editing?: boolean;
  selectedId?: string | null;
  /* Search: these keep their colour, everyone else steps back. */
  matches?: ReadonlySet<string> | null;
  /* Light the branches between two people. */
  route?: readonly [string, string] | null;
  /* Ring each person's leaf in a colour: person id to colour. */
  tints?: ReadonlyMap<string, string> | null;
  /* Show a round photo in place of the leaf, for everyone who has one. */
  faces?: boolean;
  /* Where someone's photo is. Asked only while faces are shown, for people whose `portrait` is set. */
  portraitOf?(person: PersonLeaf): string | null;
  /* Space taken by an open side panel and a banner, kept clear of the tree. */
  insets?: TreeInsets;
  /* What the drawing is called for a screen reader. */
  label?: string;
  /* The words the tree writes on itself, for a page in another language. Any left out are in English. Pass the same object until the words change: a new one has the tree write them all again. */
  labels?: Partial<TreeLabels>;
  className?: string;
  onSelect?(person: TreePerson | null): void;
  onAdd?(detail: { person: TreePerson; relation: Relation }): void;
  onHold?(detail: { person: TreePerson; x: number; y: number; keyboard: boolean }): void;
  onHoldMove?(x: number, y: number): void;
  onHoldEnd?(x: number, y: number): void;
  onMoved?(): void;
  ref?: Ref<FamilyTreeHandle>;
}

/* What an app may ask of the tree directly: moving the camera, and where things are. */
export interface FamilyTreeHandle {
  fit(whole?: boolean, animated?: boolean): void;
  flyTo(personId: string): void;
  zoomStep(factor: number): void;
  panBy(dx: number, dy: number): void;
  leafRect(personId: string): DOMRect | null;
  toggleBranch(personId: string): void;
  hasBranch(personId: string): BranchState | null;
  addable(personId: string): Relation[];
  yearRange(): YearRange;
  focus(): void;
  readonly trunkX: number;
  readonly freeWidth: number;
  readonly still: boolean;
  readonly editing: boolean;
  readonly selectedId: string | null;
}

/* The washes, the glows and the pencil hatch the leaves are painted with: the <defs> of the approved design. */
const DEFS = (
  <defs>
    <radialGradient id="wash" cx="38%" cy="34%" r="72%">
      <stop className="wash-light" offset="0" stopOpacity="0.5" />
      <stop className="wash-light" offset="0.55" stopOpacity="0.06" />
      <stop className="wash-shade" offset="1" stopOpacity="0.2" />
    </radialGradient>
    <radialGradient id="leafGlow">
      <stop offset="0" stopColor="#BFE3C8" stopOpacity="0.55" />
      <stop offset="0.45" stopColor="#8FD3A6" stopOpacity="0.18" />
      <stop offset="1" stopColor="#8FD3A6" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="warmGlow">
      <stop offset="0" stopColor="#F3D36B" stopOpacity="0.6" />
      <stop offset="0.45" stopColor="#F3D36B" stopOpacity="0.18" />
      <stop offset="1" stopColor="#F3D36B" stopOpacity="0" />
    </radialGradient>
    {/* The round window a face is seen through, as large as the engine draws a face */}
    <clipPath id="faceClip">
      <circle r={FACE_RADIUS} />
    </clipPath>
    <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
      <rect className="hatch-paper" width="5" height="5" />
      <line className="hatch-line" x1="0" y1="0" x2="0" y2="5" />
    </pattern>
  </defs>
);

/*
 * Put the markup back the way React rendered it: an empty drawing with only
 * its <defs>. An engine leaves what it drew behind when it is destroyed, and
 * the next one, given the same markup, would draw a second tree over it.
 */
function clearDrawing(stage: HTMLElement, world: HTMLElement, svg: SVGSVGElement): void {
  for (const child of [...svg.children]) if (child.localName !== 'defs') child.remove();
  for (const name of ['class', 'viewBox', 'width', 'height', 'data-zoom']) svg.removeAttribute(name);
  for (const layer of stage.querySelectorAll('.heavens, .behind, .ahead')) layer.replaceChildren();
  world.removeAttribute('style');
}

export function FamilyTree({
  data, viewerId = null, focusId = null, year = THIS_YEAR, playing = false, place = null, moon = 'tonight', pond = 'none', editing = false, selectedId = null, matches = null, route = null, tints = null,
  faces = false, portraitOf, insets, label = 'The family tree', labels, className, onSelect, onAdd, onHold, onHoldMove, onHoldEnd, onMoved, ref,
}: FamilyTreeProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const engineRef = useRef<TreeEngine | null>(null);

  // The callbacks as the parent last passed them. The engine reads them here when something happens, so it never has to be made again.
  const callbacks = useRef({ onSelect, onAdd, onHold, onHoldMove, onHoldEnd, onMoved, portraitOf });
  useEffect(() => {
    callbacks.current = { onSelect, onAdd, onHold, onHoldMove, onHoldEnd, onMoved, portraitOf };
  });

  // One engine for as long as the component is on the page. In development React mounts twice: the first engine is stopped and its drawing cleared before the second is made.
  useEffect(() => {
    const stage = stageRef.current, world = worldRef.current, svg = svgRef.current;
    if (!stage || !world || !svg) return;
    const engine = new TreeEngine({
      stage, world, svg,
      on: {
        select: (person) => callbacks.current.onSelect?.(person),
        add: (detail) => callbacks.current.onAdd?.(detail),
        hold: ({ person, x, y, keyboard = false }) => callbacks.current.onHold?.({ person, x, y, keyboard }),
        holdMove: (x, y) => callbacks.current.onHoldMove?.(x, y),
        holdEnd: (x, y) => callbacks.current.onHoldEnd?.(x, y),
        moved: () => callbacks.current.onMoved?.(),
      },
      portraitOf: (person) => callbacks.current.portraitOf?.(person) ?? null,
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      clearDrawing(stage, world, svg);
    };
  }, []);

  // Before the family, so the tree is drawn in the page's words from the start
  useEffect(() => {
    engineRef.current?.setLabels(labels);
  }, [labels]);

  /*
   * Each prop goes to the engine when it changes, and only then. The effects run
   * in the order they are written, after the one above: first the family, then
   * the year, as on a first load of the demo, then the room around the tree,
   * and last whatever is chosen or lit on it.
   */
  const { people, unions, rootId } = data;
  useEffect(() => {
    engineRef.current?.setData({ people, unions, rootId }, { viewerId, focusId });
  }, [people, unions, rootId, viewerId, focusId]);

  useEffect(() => {
    engineRef.current?.setYear(year);
  }, [year]);

  // Keyed on the two numbers and not on the object that holds them: the same place in a new object is not a new place
  const latitude = place?.latitude ?? null, longitude = place?.longitude ?? null;
  useEffect(() => {
    engineRef.current?.setPlace(latitude === null || longitude === null ? null : { latitude, longitude });
  }, [latitude, longitude]);
  // The same, for the moon: a day written in a new object is not a new choice
  const moonDay = typeof moon === 'object' ? moon.day : null, moonKind = typeof moon === 'string' ? moon : null;
  useEffect(() => {
    engineRef.current?.setMoon(moonDay !== null ? { day: moonDay } : moonKind ?? 'tonight');
  }, [moonDay, moonKind]);
  useEffect(() => {
    engineRef.current?.setPond(pond);
  }, [pond]);

  const right = insets?.right ?? 0, top = insets?.top ?? 0;
  useEffect(() => {
    // The year in the sky centres itself in the room that is left, as the tree does
    stageRef.current?.style.setProperty('--inset', `${right}px`);
    engineRef.current?.setInsets({ right, top });
  }, [right, top]);

  useEffect(() => {
    engineRef.current?.setEditing(editing);
  }, [editing]);

  useEffect(() => {
    engineRef.current?.setFaces(faces);
  }, [faces]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    engineRef.current?.setMatches(matches);
  }, [matches]);

  // Keyed on the two people and not on the pair that holds them: a new array with the same two inside is not a new route
  const from = route?.[0] ?? null, to = route?.[1] ?? null;
  useEffect(() => {
    if (from && to) engineRef.current?.setRoute(from, to);
    else engineRef.current?.setRoute();
  }, [from, to]);

  useEffect(() => {
    engineRef.current?.setTints(tints);
  }, [tints]);

  useImperativeHandle(ref, (): FamilyTreeHandle => {
    // The engine is there from the first effect until the component goes. A handle used outside that time has no tree to act on, and says so.
    const engine = (): TreeEngine => {
      if (!engineRef.current) throw new Error('FamilyTree: the tree is not on the page');
      return engineRef.current;
    };
    return {
      fit: (whole, animated) => engine().fit(whole, animated),
      flyTo: (personId) => engine().flyTo(personId),
      zoomStep: (factor) => engine().zoomStep(factor),
      panBy: (dx, dy) => engine().panBy(dx, dy),
      leafRect: (personId) => engine().leafRect(personId),
      toggleBranch: (personId) => engine().toggleBranch(personId),
      hasBranch: (personId) => engine().hasBranch(personId),
      addable: (personId) => engine().addable(personId),
      yearRange: () => engine().yearRange(),
      focus: () => engine().focus(),
      get trunkX() { return engine().trunkX; },
      get freeWidth() { return engine().freeWidth; },
      get still() { return engine().still; },
      get editing() { return engine().editing; },
      get selectedId() { return engine().selectedId; },
    };
  }, []);

  return (
    <div id="stage" ref={stageRef} className={[editing && 'editing', className].filter(Boolean).join(' ') || undefined}>
      <div className="sky sky-light" aria-hidden="true" />
      <div className="sky sky-dark" aria-hidden="true" />
      {/* Edit mode: a faint trellis behind the tree says "you are gardening now" */}
      <div className="trellis" aria-hidden="true" />
      {/* Time travel: the year stands in the sky while the slider is away from today */}
      <div id="yearGhost" className={year < THIS_YEAR ? 'year-ghost on' : 'year-ghost'} aria-hidden="true">{year}</div>
      {/* The sun, the moon and the stars: far things, which the camera does not carry */}
      <div className={playing ? 'heavens playing' : 'heavens'} aria-hidden="true" />
      <div id="world" ref={worldRef}>
        <div className="behind" aria-hidden="true" />
        <svg id="tree" ref={svgRef} aria-label={label}>{DEFS}</svg>
        <div className="ahead" aria-hidden="true" />
      </div>
    </div>
  );
}
