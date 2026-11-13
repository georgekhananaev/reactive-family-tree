/*
 * The live tree with the demo family: the island the home page and the demo
 * page share.
 *
 * It is the real `reactive-family-tree` component, given a family that was
 * grown in memory. On the home page it is the tree alone, on a page that
 * scrolls past it. On the demo page it fills the window and gains a caption
 * for the chosen person and the year slider.
 * Author: George Khananaev
 */

import { useState } from 'react';
import type { ReactElement, WheelEvent } from 'react';
import { FamilyTree } from 'reactive-family-tree';
import 'reactive-family-tree/tree.css';

import { demoFamily } from '../lib/demo-family';
import { TreeTitle } from './TreeTitle';
import { useTimeline } from './use-timeline';
import { YearSlider } from './YearSlider';
import './demo-tree.css';

export interface DemoTreeProps {
  /* The demo page: a caption and the year slider, and the wheel zooms the tree instead of scrolling the page. */
  explorer?: boolean;
}

/* Stopped on its way down, the wheel never reaches the tree, which would zoom with it and keep the page from scrolling. */
const leaveToPage = (event: WheelEvent<HTMLDivElement>): void => event.stopPropagation();

export function DemoTree({ explorer = false }: DemoTreeProps): ReactElement {
  // Grown once, when the island is first drawn
  const [family] = useState(demoFamily);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timeline = useTimeline(family.years);

  return (
    <div className={explorer ? 'demo-tree explorer' : 'demo-tree'} onWheelCapture={explorer ? undefined : leaveToPage}>
      <FamilyTree
        data={family.tree}
        year={timeline.year}
        playing={timeline.playing}
        selectedId={selectedId}
        label={`The ${family.name} tree`}
        onSelect={(person) => setSelectedId(person?.id ?? null)}
      />
      {explorer && (
        <>
          <TreeTitle
            title={family.name}
            hint={`${family.description}, a made-up family. Choose a leaf.`}
            person={selectedId ? family.lines.get(selectedId) ?? null : null}
          />
          <YearSlider year={timeline.year} min={family.years.min} max={family.years.max} playing={timeline.playing} onYear={timeline.choose} onPlay={timeline.toggle} />
        </>
      )}
    </div>
  );
}
