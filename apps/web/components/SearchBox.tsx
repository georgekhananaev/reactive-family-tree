'use client';

import type { SearchHit } from '@reactive-family-tree/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { usePresence } from '@/lib/hooks';

import { arrowThrough } from './ui';

/* The text with the words that were typed marked, so it is clear why each person was found. */
function marked(text: string, query: string): ReactNode {
  const words = query.split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'ig')).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

/* Search by name, year or place. On the tree, the people found keep their colour and everyone else steps back. */
export function SearchBox({ open, onClose, onMatches }: {
  open: boolean;
  onClose(): void;
  /* Who the search is pointing at, or null when it is not pointing at anyone. */
  onMatches(ids: ReadonlySet<string> | null): void;
}) {
  const app = useApp();
  const { present, shown } = usePresence(open, 160);
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ query: string; people: SearchHit[] }>({ query: '', people: [] });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const query = text.trim();

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) {
      onMatches(null);
      return;
    }
    let stale = false;         // an answer to something typed earlier is dropped
    const ask = query ? api.get<{ people: SearchHit[] }>(`/api/people?q=${encodeURIComponent(query)}`) : Promise.resolve({ people: [] });
    ask.then(({ people }) => {
      if (stale) return;
      setFound({ query, people });
      onMatches(query ? new Set(people.map((person) => person.id)) : null);
    }).catch(() => {});
    return () => { stale = true; };
  }, [open, query, onMatches]);

  const go = (person: SearchHit) => {
    onClose();
    app.select(person.id, { fly: true });
  };
  const results = () => [...(list.current?.querySelectorAll<HTMLElement>('button') ?? [])];

  return (
    <div
      id="search"
      className={shown ? 'search panel open' : 'search panel'}
      hidden={!present}
      onKeyDown={(event) => {
        const buttons = results();
        if (event.target === input.current) {
          if (event.key === 'ArrowDown' && buttons.length) { event.preventDefault(); buttons[0]?.focus(); }
          if (event.key === 'Enter' && buttons.length) buttons[0]?.click();
        } else if (event.key === 'ArrowUp' && event.target === buttons[0]) {
          event.preventDefault();
          input.current?.focus();
        } else {
          arrowThrough(event, buttons);
        }
      }}
    >
      <input ref={input} id="searchInput" type="search" placeholder="Search by name, year or place" autoComplete="off" aria-label="Search people" aria-controls="searchResults" value={text} onChange={(event) => setText(event.target.value)} />
      <ul ref={list} id="searchResults">
        {found.people.length || !found.query ? found.people.map((person) => (
          <li key={person.id}>
            <button type="button" onClick={() => go(person)}>
              <span>
                {marked(person.name, found.query)}
                {person.birthName && <small> born {marked(person.birthName, found.query)}</small>}
              </span>
              <small>{person.born ? `${person.born}${person.died ? `–${person.died}` : ''}` : ''}</small>
            </button>
          </li>
        )) : (
          <li className="empty">{app.session.user ? 'Nobody by that name.' : 'Nobody by that name. Living people can be found only by relatives who sign in.'}</li>
        )}
      </ul>
      <p className="search-keys" aria-hidden="true">Arrow keys to move, Enter to go, Esc to close</p>
    </div>
  );
}
