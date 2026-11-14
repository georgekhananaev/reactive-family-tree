/* Icons: one weight of line, drawn to match the ink of the branches. */

const ring = (cx: number, cy: number, r: number) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;

const ICONS = {
  open: `M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z ${ring(12, 12, 2.8)}`,
  focus: `${ring(12, 12, 6.5)} M12 2.5v4 M12 17.5v4 M2.5 12h4 M17.5 12h4`,
  related: `${ring(6.5, 7, 3)} ${ring(17.5, 17, 3)} M9 9.2l6 5.6`,
  edit: 'M4 20l4-1 10-10-3-3L5 16l-1 4z M14 7l3 3',
  fold: 'M7 4.5l5 5 5-5 M7 19.5l5-5 5 5',
  unfold: 'M7 9.5l5-5 5 5 M7 14.5l5 5 5-5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  child: 'M12 21V10 M12 10c0-3.3 2.6-5.5 6.5-5.5 0 3.3-2.6 5.5-6.5 5.5z M12 14.5c0-2.7-2.1-4.5-5.5-4.5 0 2.7 2.1 4.5 5.5 4.5z',
  partner: 'M12 20s-7.5-4.6-7.5-10.2a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  parent: 'M12 3.5v12 M7 10.5l5 5 5-5 M5 20.5h14',
  sibling: 'M8 21V11 M8 11c0-3-1.8-5-4.5-5.5 0 3 1.8 5 4.5 5.5z M16 21V11 M16 11c0-3 1.8-5 4.5-5.5 0 3-1.8 5-4.5 5.5z',
  history: `${ring(12, 12, 8.5)} M12 7.5V12l3 2`,
  leaf: 'M12 21.5V10 M12 14.5C5.5 12 5 6 12 2.5 19 6 18.5 12 12 14.5z',
  inbox: 'M4 13l2.5-8h11L20 13v6H4v-6z M4 13h5l1 2h4l1-2h5',
  manage: `M4 7h9 M19 7h1 M4 17h3 M13 17h7 ${ring(16, 7, 2.3)} ${ring(10, 17, 2.3)}`,
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z',
  signout: 'M10 4.5H5.5v15H10 M14 8l4 4-4 4 M18 12H9.5',
  plus: 'M12 5.5v13 M5.5 12h13',
  minus: 'M5.5 12h13',
  fit: 'M4.5 9V4.5H9 M15 4.5h4.5V9 M19.5 15v4.5H15 M9 19.5H4.5V15',
  play: 'M8 5.5l10.5 6.5L8 18.5z',
  music: `${ring(7, 17.5, 2.5)} ${ring(17, 15.5, 2.5)} M9.5 17.5V6l10-2v11.5`,
  musicOff: `${ring(7, 17.5, 2.5)} ${ring(17, 15.5, 2.5)} M9.5 17.5V6l10-2v11.5 M3.5 3.5l17 17`,
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  keys: 'M3.5 7.5h17v9h-17z M7 10.5h.01 M10.3 10.5h.01 M13.6 10.5h.01 M17 10.5h.01 M7.5 13.5h9',
  search: `${ring(10.5, 10.5, 6)} M15 15l5 5`,
  passkey: `${ring(8, 16, 3.5)} M10.5 13.5L19.5 4.5 M16 8l2.5 2.5 M13 11l2 2`,
  face: `${ring(12, 9, 3.8)} M4.8 20.5c.8-4 3.6-6 7.2-6s6.4 2 7.2 6`,
  chevron: 'M6.5 9.5l5.5 5.5 5.5-5.5',
  globe: `${ring(12, 12, 8.5)} M3.5 12h17 M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5 M12 3.5c-2.4 2.3-3.6 5.1-3.6 8.5s1.2 6.2 3.6 8.5`,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`icon icon-${name}`}>
      <path d={ICONS[name]} />
    </svg>
  );
}
