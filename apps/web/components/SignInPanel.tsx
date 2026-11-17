'use client';

/* Signing in, accepting an invitation, and asking to join. No passwords anywhere. */

import type { OpenInvite } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api, messageOf } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { family } from '@/lib/auth-client';
import { useSingle } from '@/lib/hooks';
import { useHumanCheck } from '@/lib/human-check';
import { useT } from '@/lib/i18n';

import type { PanelDef, PanelProps } from './Drawer';
import { SignInWays } from './SignInWays';
import { Field } from './ui';

function SignIn() {
  const app = useApp();
  const { t } = useT();
  const [join, setJoin] = useState({ name: '', email: '', message: '' });
  const human = useHumanCheck(app.session.settings.allowJoinRequests ? app.session.humanCheck : null);
  const ask = useSingle(async () => {
    try {
      await api.post('/api/join', join, await human.prove());
      app.toast(t('Your request was sent to the family’s admins.'));
      app.closePanel();
    } catch (error) {
      app.fail(error);
    }
  });
  return (
    <>
      <SignInWays session={app.session} onSignedIn={app.signedIn} onFail={app.fail} />
      {app.session.settings.allowJoinRequests && (
        <>
          <h3>{t('Not invited yet?')}</h3>
          <div className="fields">
            <Field label={t('Your name')}><input type="text" name="name" autoComplete="name" value={join.name} onChange={(event) => setJoin({ ...join, name: event.target.value })} /></Field>
            <Field label={t('Your email')}><input type="email" name="email" autoComplete="email" value={join.email} onChange={(event) => setJoin({ ...join, email: event.target.value })} /></Field>
            <Field label={t('Who are you in this family?')} wide>
              <textarea rows={2} name="message" placeholder={t('For example: I am Rosalind’s grandson')} value={join.message} onChange={(event) => setJoin({ ...join, message: event.target.value })} />
            </Field>
          </div>
          {human.box}
          <div className="form-actions">
            <button type="button" onClick={() => void ask()}>{t('Ask to join')}</button>
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
  const { t, tx } = useT();
  const [name, setName] = useState(invite.personName ?? '');
  const [email, setEmail] = useState(invite.email);
  const accept = useSingle(async () => {
    try {
      await family.acceptInvite({ token, name, email });
      history.replaceState(null, '', location.pathname);
      await app.signedIn();
      app.toast(t('Welcome, {name}.', { name }));
    } catch (error) {
      app.fail(error);
    }
  });
  return (
    <>
      <p>
        {invite.personName
          ? tx('{inviter} invited you to the family tree as {person}. Is that you?', { inviter: <bdi>{invite.invitedBy}</bdi>, person: <bdi>{invite.personName}</bdi> })
          : tx('{inviter} invited you to the family tree.', { inviter: <bdi>{invite.invitedBy}</bdi> })}
      </p>
      <div className="fields">
        <Field label={t('Your name')} wide><input type="text" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label={t('Your email')} wide><input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      </div>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => void accept()}>{invite.personName ? t('Yes, that is me') : t('Join')}</button>
      </div>
    </>
  );
}

export const signin: PanelDef = { title: (_args, _app, t) => t('Sign in'), Body: SignIn };
export const invite: PanelDef = { title: (_args, _app, t) => t('You are invited'), Body: Invite };
