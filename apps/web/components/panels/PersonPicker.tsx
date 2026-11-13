'use client';

import type { SearchHit } from '@reactive-family-tree/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '@/lib/api';

/* A search box that picks one person. `onPick` is called with the choice, and with null when typing on undoes it. */
export function PersonPicker({ placeholder, onPick }: { placeholder: string; onPick(id: string | null): void }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(false);
  // What is being looked for. Nothing once someone has been picked, so the list goes away.
  const [query, setQuery] = useState('');
  const looking = query.trim() !== '';
  const { data } = useQuery({
    queryKey: ['people', query],
    queryFn: () => api.get<{ people: SearchHit[] }>(`/api/people?q=${encodeURIComponent(query)}`),
    enabled: looking,
    // The names found so far stay until the next ones arrive
    placeholderData: keepPreviousData,
  });
  const people = looking && data ? data.people.slice(0, 6) : [];

  return (
    <div>
      <input
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setQuery(event.target.value);
          // The name in the box is no longer the person who was picked
          if (picked) {
            setPicked(false);
            onPick(null);
          }
        }}
      />
      <ul className="relatives">
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="link"
              onClick={() => {
                setText(p.name);
                setQuery('');
                setPicked(true);
                onPick(p.id);
              }}
            >
              {`${p.name}${p.born ? `, ${p.born}` : ''}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
