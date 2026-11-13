'use client';

import { useEffect, useRef, useState } from 'react';

import { useApp } from '@/lib/app-context';
import { addPasskey } from '@/lib/auth-client';
import { initialsOf } from '@/lib/format';
import { usePresence } from '@/lib/hooks';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { arrowThrough } from './ui';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export function Avatar({ name }: { name: string }) {
  return <b className="avatar">{initialsOf(name)}</b>;
}

/* The menu under the avatar: your leaf, your suggestions, managing, AI, a passkey, appearance, signing out. */
export function AccountMenu({ open, theme, onClose, onMyLeaf, onAppearance, onSignOut }: {
  open: boolean;
  theme: 'light' | 'dark';
  onClose(): void;
  onMyLeaf(): void;
  onAppearance(theme: 'light' | 'dark'): void;
  onSignOut(): void;
}) {
  const app = useApp();
  const { present, shown } = usePresence(open, 160);
  const el = useRef<HTMLDivElement>(null);
  const { user, counts, signIn, demo } = app.session;
  // Signing out with no passkey, on a tree that sends no email yet, leaves only the link in the server log to get back in
  const lockedOutAfter = Boolean(user) && !demo && !signIn.emailWorks && !user?.hasPasskey;
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    if (open) el.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    else setWarned(false);
  }, [open]);

  if (!user) return <div id="menu" className="menu panel" role="menu" hidden />;
  const item = (icon: IconName, label: string, action: () => void) => (
    <button type="button" role="menuitem" onClick={() => { onClose(); action(); }}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
  return (
    <div
      ref={el}
      id="menu"
      className={shown ? 'menu panel open' : 'menu panel'}
      role="menu"
      hidden={!present}
      onKeyDown={(event) => arrowThrough(event, [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')])}
    >
      <div className="who">
        <Avatar name={user.name} />
        <div>
          <strong>{user.name}</strong>
          <small>{user.role === 'member' && user.anchors.length ? 'Steward' : ROLE_LABEL[user.role]}</small>
        </div>
      </div>
      {user.personId && item('leaf', 'My leaf', onMyLeaf)}
      {item('inbox', `My suggestions and drafts${counts.drafts ? ` (${counts.drafts})` : ''}`, () => app.openPanel('inbox', { tab: 'mine' }))}
      {(app.isAdmin || user.anchors.length > 0) && item('manage', app.isAdmin ? 'Manage family' : 'Manage my branch', () => app.openPanel('manage'))}
      {item('spark', 'Connect your AI', () => app.openPanel('connect'))}
      {item('keys', 'Gestures and keys', () => app.openPanel('help'))}
      {signIn.passkeys && item('passkey', 'Add a passkey', () => {
        void addPasskey().then(() => {
          app.toast('Passkey added. Next time you can sign in with it.');
          void app.refresh();
        }, app.fail);
      })}
      <hr />
      <div className="appearance" role="group" aria-label="Appearance">
        {(['light', 'dark'] as const).map((name) => (
          <button key={name} type="button" aria-pressed={name === theme} onClick={() => { onAppearance(name); onClose(); }}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>
      <hr />
      {warned && (
        <p className="hint-line" role="alert">
          You have no passkey, and this tree does not send email yet. The only way back in would be the sign-in link in the server log. Add a passkey first.
        </p>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          if (lockedOutAfter && !warned) return setWarned(true);
          onClose();
          onSignOut();
        }}
      >
        <Icon name="signout" />
        <span>{warned ? 'Sign out anyway' : 'Sign out'}</span>
      </button>
    </div>
  );
}
