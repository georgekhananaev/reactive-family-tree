'use client';

import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from './Icon';

/* Which build of the software this is: its version always, and the commit and the day of it where the image was told them. */
export interface BuildInfo {
  version: string;
  revision: string | null;
  made: string | null;
}

/* Where the software lives. While that is kept private, these links open only for those who may see it. */
const HOME = 'https://github.com/georgekhananaev/reactive-family-tree';
/* Its maker, and where to tell him of something wrong with it. */
const MAKER = 'https://george.khananaev.com';
const REPORTS = 'report@khananaev.com';

const dayOf = (made: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(made));

const PRIVACY: readonly string[] = [
  'What a family puts on its tree is kept where that family chose to keep it. The software sends nothing to its maker.',
  'There is no advertising and no tracking, and the pages load nothing from other companies.',
  'Living people are never shown to visitors unless they choose it themselves.',
  'Cookies are used only for signing in. Choices such as light or dark stay in your browser.',
  'Email addresses are used to sign in and to invite relatives. The mail goes out through the service this family set up.',
  'A relative may connect an AI assistant of their own, where the family allows it. It can see and do only what that relative can.',
];

const REFERENCES: readonly string[] = [
  'Literata, by TypeTogether, and Source Sans, by Adobe: the two typefaces, under the SIL Open Font License.',
  'The Astronomical Almanac, for the sums that place the sun and the moon.',
  'GEDCOM, the file format that family history programs share, and the Model Context Protocol, by which an AI assistant connects.',
  'Next.js, React, SQLite and Better Auth, which the app is built with.',
];

type PartName = 'Privacy' | 'References';

/* One part of the card that unfolds under its heading. What is folded away is out of reach of the keyboard and of a screen reader, as well as out of sight. */
function Part({ title, open, onToggle, children }: { title: PartName; open: boolean; onToggle(): void; children: ReactNode }) {
  const body = useId();
  return (
    <section className={open ? 'about-part open' : 'about-part'}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={body} onClick={onToggle}>
          {title}
          <Icon name="chevron" />
        </button>
      </h3>
      <div id={body} className="about-fold" aria-hidden={!open}>
        <div>{children}</div>
      </div>
    </section>
  );
}

/*
 * The version, small, in a corner of the page. Pressing it opens a card that
 * rises from that corner, about the software the tree runs on: which build
 * this is, who made it and where to find it, and two parts that unfold one at
 * a time, on what it does with what a family keeps in it and on what it owes
 * to others. Escape, the cross, or a press anywhere beside the card closes it.
 */
export function About({ build, family }: { build: BuildInfo; family: string }) {
  const card = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const title = useId();
  const [unfolded, setUnfolded] = useState<PartName | null>(null);
  const { version, revision, made } = build;
  const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer">{text}</a>;
  const open = () => {
    card.current?.showModal();
    close.current?.focus();
  };
  const part = (name: PartName, children: ReactNode) => (
    <Part title={name} open={unfolded === name} onToggle={() => setUnfolded(unfolded === name ? null : name)}>{children}</Part>
  );
  return (
    <>
      <button type="button" className="about-open" aria-haspopup="dialog" aria-label={`About Reactive Family Tree, version ${version}`} onClick={open}>
        v{version}
      </button>
      {/* A press beside the card lands on the dialog itself. Closed, it folds its parts away again for next time. */}
      <dialog ref={card} className="about" aria-labelledby={title} onClick={(event) => { if (event.target === card.current) card.current.close(); }} onClose={() => setUnfolded(null)}>
        <div className="about-card panel">
          <header>
            <h2 id={title}>Reactive Family Tree</h2>
            <button ref={close} type="button" className="close" aria-label="Close" onClick={() => card.current?.close()}>×</button>
          </header>
          <p className="about-build">
            Version {version}
            {revision && <>, build {link(`${HOME}/commit/${revision}`, revision.slice(0, 7))}</>}
            {made && ` of ${dayOf(made)}`}
          </p>
          <p>The software that the {family} tree runs on. Each family runs a copy of its own, on a server it chose.</p>
          <p>Made by {link(MAKER, 'George Khananaev')}, and free for anyone to use under the MIT licence.</p>
          <p className="about-links">
            {link(HOME, 'Source on GitHub')}
            {link(`${HOME}/blob/v${version}/CHANGELOG.md`, 'What changed in each version')}
          </p>
          <p className="about-report">
            Something wrong with the software? Write to <a href={`mailto:${REPORTS}?subject=${encodeURIComponent(`Reactive Family Tree ${version}${revision ? `, build ${revision.slice(0, 7)}` : ''}`)}`}>{REPORTS}</a>
          </p>
          {part('Privacy', (
            <>
              <ul>{PRIVACY.map((line) => <li key={line}>{line}</li>)}</ul>
              <p>Whoever runs this tree decides who may see it, and can correct or remove anything kept here. Questions about the tree itself go to them.</p>
            </>
          ))}
          {part('References', <ul>{REFERENCES.map((line) => <li key={line}>{line}</li>)}</ul>)}
        </div>
      </dialog>
    </>
  );
}
