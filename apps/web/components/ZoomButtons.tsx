'use client';

import { Icon } from './Icon';

/* Zoom, the whole tree, the way back to your own leaf, and leaves or faces. `faces` is null while nobody on the tree has a photo. */
export function ZoomButtons({ hasLeaf, faces, onZoom, onWhole, onMyLeaf, onFaces }: {
  hasLeaf: boolean;
  faces: boolean | null;
  onZoom(factor: number): void;
  onWhole(): void;
  onMyLeaf(): void;
  onFaces(): void;
}) {
  return (
    <nav className="zoom panel" aria-label="View">
      <button id="zoomIn" type="button" className="round" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onZoom(1.5)}><Icon name="plus" /></button>
      <button id="zoomOut" type="button" className="round" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onZoom(1 / 1.5)}><Icon name="minus" /></button>
      <button id="fit" type="button" className="round" aria-label="Show the whole tree" title="Whole tree (0)" onClick={onWhole}><Icon name="fit" /></button>
      <button id="myLeaf" type="button" className="round" aria-label="Go to my leaf" title="My leaf (M)" hidden={!hasLeaf} onClick={onMyLeaf}><Icon name="leaf" /></button>
      <button id="faces" type="button" className="round" aria-label="Show faces" aria-pressed={faces === true} title={faces ? 'Show leaves (V)' : 'Show faces (V)'} hidden={faces === null} onClick={onFaces}>
        <Icon name="face" />
      </button>
    </nav>
  );
}
