'use client';

/* Signing in, accepting an invitation, and asking to join. No passwords anywhere. */

import type { OpenInvite } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api, messageOf } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { family } from '@/lib/auth-client';

import type { PanelDef, PanelProps } from './Drawer';
import { SignInWays } from './SignInWays';
import { Field } from './ui';

function SignIn() {
  const app = useApp();
  const [join, setJoin] = useState({ name: '', email: '', message: '' });
  return (
    <>
      <SignInWays session={app.session} onSignedIn={app.signedIn} onFail={app.fail} />
      {app.session.settings.allowJoinRequests && (
        <>
          <h3>Not invited yet?</h3>
          <div className="fields">
            <Field label="Your name"><input type="text" name="name" autoComplete="name" value={join.name} onChange={(event) => setJoin({ ...join, name: event.target.value })} /></Field>
            <Field label="Your email"><input type="email" name="email" autoComplete="email" value={join.email} onChange={(event) => setJoin({ ...join, email: event.target.value })} /></Field>
            <Field label="Who are you in this family?" wide>
              <textarea rows={2} name="message" placeholder="For example: I am Rosalind’s grandson" value={join.message} onChange={(event) => setJoin({ ...join, message: event.target.value })} />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" onClick={async () => {
              try {
                await api.post('/api/join', join);
                app.toast('Your request was sent to the family’s admins.');
                app.closePanel();
              } catch (error) {
                app.fail(error);
              }
            }}>Ask to join</button>
          </div>
        </>
      )}
    </>
  );
}

function Invite({ args }: PanelProps) {
  const token = args.token ?? '';
  const open = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<OpenInvite>(`/api/invites/open?token=${encodeURIComponent(token)}`), retry: false });
  if (open.isError) return <p className="empty">{messageOf(open.error)}</p>;
  if (!open.data) return null;
  return <Accept token={token} invite={open.data} />;
}

function Accept({ token, invite }: { token: string; invite: OpenInvite }) {
  const app = useApp();
  const [name, setName] = useState(invite.personName ?? '');
  const [email, setEmail] = useState(invite.email);
  return (
    <>
      <p>{invite.personName ? `${invite.invitedBy} invited you to the family tree as ${invite.personName}. Is that you?` : `${invite.invitedBy} invited you to the family tree.`}</p>
      <div className="fields">
        <Field label="Your name" wide><input type="text" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Your email" wide><input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      </div>
      <div className="form-actions">
        <button type="button" className="primary" onClick={async () => {
          try {
            await family.acceptInvite({ token, name, email });
            history.replaceState(null, '', location.pathname);
            await app.signedIn();
            app.toast(`Welcome, ${name}.`);
          } catch (error) {
            app.fail(error);
          }
        }}>{invite.personName ? 'Yes, that is me' : 'Join'}</button>
      </div>
    </>
  );
}

export const signin: PanelDef = { title: () => 'Sign in', Body: SignIn };
export const invite: PanelDef = { title: () => 'You are invited', Body: Invite };
