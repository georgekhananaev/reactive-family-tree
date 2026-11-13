'use client';

import { Icon } from './Icon';

/* Zoom, the whole tree, and the way back to your own leaf. */
export function ZoomButtons({ hasLeaf, onZoom, onWhole, onMyLeaf }: { hasLeaf: boolean; onZoom(factor: number): void; onWhole(): void; onMyLeaf(): void }) {
  return (
    <nav className="zoom panel" aria-label="View">
      <button id="zoomIn" type="button" className="round" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onZoom(1.5)}><Icon name="plus" /></button>
      <button id="zoomOut" type="button" className="round" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onZoom(1 / 1.5)}><Icon name="minus" /></button>
      <button id="fit" type="button" className="round" aria-label="Show the whole tree" title="Whole tree (0)" onClick={onWhole}><Icon name="fit" /></button>
      <button id="myLeaf" type="button" className="round" aria-label="Go to my leaf" title="My leaf (M)" hidden={!hasLeaf} onClick={onMyLeaf}><Icon name="leaf" /></button>
    </nav>
  );
}
