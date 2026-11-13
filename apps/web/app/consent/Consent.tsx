'use client';

import type { SessionInfo } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api, messageOf } from '@/lib/api';
import { answerConsent, clientName } from '@/lib/auth-client';

/* Says in plain words what connecting an AI client means, before the person agrees. */
export function Consent() {
  const session = useQuery({ queryKey: ['session'], queryFn: () => api.get<SessionInfo>('/api/session') });
  const clientId = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('client_id') ?? '';
  const client = useQuery({ queryKey: ['oauth-client', clientId], queryFn: () => clientName(clientId), enabled: Boolean(clientId), retry: false });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const answer = async (accept: boolean) => {
    setBusy(true);
    setProblem('');
    try {
      const next = await answerConsent(accept);
      location.assign(next ?? '/');
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(false);
    }
  };

  const user = session.data?.user;
  if (!session.data) return <p className="lead">One moment…</p>;
  if (!user) return <p>Sign in first. <a href={`/sign-in${typeof location === 'undefined' ? '' : location.search}`}>Go to sign in</a></p>;
  const name = client.data || 'An AI client';
  return (
    <>
      <h1>Connect {name}?</h1>
      <p className="lead">It is asking to use the {session.data.settings.familyName} tree as you, {user.name}.</p>
      <ul>
        <li>It can read what you can read, including living relatives you are allowed to see.</li>
        <li>It can change what you can change, and nothing more.</li>
        <li>Its changes arrive as drafts for you to look over first. You can change that, or disconnect it, under “Connect your AI”.</li>
      </ul>
      {problem && <p className="warning" role="alert">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void answer(true)}>Connect</button>
        <button type="button" disabled={busy} onClick={() => void answer(false)}>Do not connect</button>
      </div>
    </>
  );
}
