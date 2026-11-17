'use client';

import type { SessionInfo } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { SessionWait } from '@/components/SessionWait';
import { SignInWays } from '@/components/SignInWays';
import { api, messageOf } from '@/lib/api';
import { useT } from '@/lib/i18n';

/*
 * An AI client sent the person here with a signed request in the address. Once
 * they are signed in, the browser goes back to the sign-in server with that
 * same request, which then asks for their consent.
 */
export function SignInForClient() {
  const { t } = useT();
  const session = useQuery({ queryKey: ['session'], queryFn: () => api.get<SessionInfo>('/api/session') });
  const [problem, setProblem] = useState('');
  const signedIn = Boolean(session.data?.user);

  useEffect(() => {
    if (!signedIn) return;
    const forClient = new URLSearchParams(location.search).has('client_id');
    location.replace(forClient ? `/api/auth/oauth2/authorize${location.search}` : '/');
  }, [signedIn]);

  if (!session.data || signedIn) return <SessionWait failed={session.isError && !session.data} onRetry={() => void session.refetch()} />;
  return (
    <>
      <h1>{t('Sign in to {family}', { family: session.data.settings.familyName })}</h1>
      <p className="lead">{t('Your AI client is asking to connect. Sign in first, as yourself.')}</p>
      {problem && <p className="warning" role="alert">{problem}</p>}
      <SignInWays
        session={session.data}
        backTo={typeof location === 'undefined' ? '/' : `${location.pathname}${location.search}`}
        onSignedIn={() => session.refetch()}
        onFail={(error) => setProblem(messageOf(error))}
      />
    </>
  );
}
