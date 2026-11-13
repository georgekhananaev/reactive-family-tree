/*
 * reactive-family-tree: a family drawn as a living tree, as one React component.
 * Load the stylesheet beside it: `import 'reactive-family-tree/tree.css'`.
 * Author: George Khananaev
 */

export { FamilyTree } from './FamilyTree';
export type { FamilyTreeHandle, FamilyTreeProps } from './FamilyTree';
export { LeafPortrait } from './LeafPortrait';
export type { LeafPortraitProps } from './LeafPortrait';
export { TreeEngine } from './engine';
export type { BranchState, Camera, TreeData, TreeEngineEvents, TreeEngineOptions, TreeInsets, YearRange } from './engine';
export type { LeafSubject } from './leaf';
export { MELODIES, TreeMusic } from './music';
export type { Melody, Mood } from './music';
export { useTreeMusic } from './useTreeMusic';
export type { MelodyTrial, TreeMusicOptions, TreeMusicSwitch } from './useTreeMusic';
