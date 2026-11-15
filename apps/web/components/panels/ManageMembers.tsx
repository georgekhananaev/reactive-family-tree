'use client';

/* Manage family, the members: who is asking to join, who may sign in and as what, and who has been invited. */

import type { InviteMade, InviteView, JoinRequestView, MemberView, Role } from '@reactive-family-tree/core';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { ConfirmButton, CopyRow, Field, Select } from '../ui';

import { PersonPicker } from './PersonPicker';
import { Check, Loading, inWords, tryIt, useMembers } from './shared';

type RoleOption = readonly [Role, WebPhrase];

const ROLE_WORDS: Readonly<Record<Role, WebPhrase>> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const OWNER: RoleOption = ['owner', ROLE_WORDS.owner];
const ROLES: readonly RoleOption[] = [['member', ROLE_WORDS.member], ['admin', ROLE_WORDS.admin]];

/* One branch a member looks after, with a way to take it away. `label` is what the × is called. */
export function BranchChip({ member, at, label }: { member: MemberView; at: number; label: string }) {
  const app = useApp();
  const { t } = useT();
  const anchor = member.anchorNames[at];
  return (
    <span className="chip">
      {anchor ? t('{name}’s branch', { name: anchor }) : t('Someone’s branch')}
      <button type="button" aria-label={label} onClick={() => tryIt(app, () => api.del(`/api/members/${member.id}/branches/${member.anchors[at]}`))}>×</button>
    </span>
  );
}

function JoinRequest({ request, onApproved }: { request: JoinRequestView; onApproved(invite: InviteMade | null): void }) {
  const app = useApp();
  const { t } = useT();
  const approve = async () => {
    const result = await tryIt(app, () => api.post<{ invite: InviteMade | null }>(`/api/join/${request.id}`, { approve: true }));
    if (result) onApproved(result.invite);
  };
  return (
    <div className="row">
      <div className="main">
        <strong>{`${request.name}, ${request.email}`}</strong>
        <small>{request.message || t('No message')}</small>
      </div>
      <div className="side">
        <button type="button" className="small primary" onClick={approve}>{t('Approve')}</button>
        <button type="button" className="small" onClick={() => tryIt(app, () => api.post(`/api/join/${request.id}`, { approve: false }), t('Declined'))}>{t('Decline')}</button>
      </div>
    </div>
  );
}

/* `roles` are the ones this member can be given. `locked` is for an owner seen by someone who is not one. */
function MemberRow({ member, roles, locked }: { member: MemberView; roles: readonly RoleOption[]; locked: boolean }) {
  const app = useApp();
  const { t } = useT();
  // The role just chosen, until the server has answered
  const [picked, setPicked] = useState<Role | null>(null);
  const change = async (role: Role) => {
    setPicked(role);
    await tryIt(app, () => api.patch(`/api/members/${member.id}`, { role }), t('Role changed'));
    setPicked(null);
  };
  // Saying which leaf on the tree this member is: whether that is being chosen now, and the leaf picked so far
  const [linking, setLinking] = useState(false);
  const [leaf, setLeaf] = useState<string | null>(null);
  const stopLinking = () => {
    setLinking(false);
    setLeaf(null);
  };
  /* Link the account to a leaf, or with null to none. */
  const link = async (personId: string | null) => {
    const done = await tryIt(app, () => api.patch(`/api/members/${member.id}`, { personId }), t(personId ? 'Linked to a leaf' : 'No longer linked to a leaf'));
    if (done) stopLinking();
  };
  return (
    <div className="row">
      <div className="main">
        <strong>{member.name}</strong>
        <small>{[member.email, member.personName ? t('is {name}', { name: member.personName }) : t('not linked to a leaf'), member.ai ? t('has an AI connected') : null].filter(Boolean).join(', ')}</small>
        <div>
          {member.anchorNames.map((name, at) => (
            <BranchChip key={member.anchors[at]} member={member} at={at} label={t('Take {branch}’s branch away from {name}', { branch: name, name: member.name })} />
          ))}
        </div>
        {linking ? (
          <div className="leaf-link">
            <PersonPicker placeholder={t('Search for their name')} onPick={setLeaf} />
            <div className="form-actions">
              <button type="button" className="small primary" disabled={!leaf} onClick={() => link(leaf)}>{t('Link')}</button>
              {member.personId && <button type="button" className="small" onClick={() => link(null)}>{t('Unlink from the leaf')}</button>}
              <button type="button" className="small" onClick={stopLinking}>{t('Cancel')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="link" onClick={() => setLinking(true)}>{t(member.personId ? 'Link to another leaf' : 'Link to a leaf')}</button>
        )}
      </div>
      <div className="side">
        <Select options={inWords(t, roles)} value={picked ?? member.role} onChange={change} aria-label={t('Role of {name}', { name: member.name })} disabled={locked} />
        {member.id !== app.session.user?.id && (
          <ConfirmButton label={t('Remove')} sure={t('Really?')} onConfirm={() => tryIt(app, () => api.del(`/api/members/${member.id}`), t('{name} can no longer sign in', { name: member.name }))} className="small danger" />
        )}
      </div>
    </div>
  );
}

/* Invite someone, optionally as a person already on the tree */
function InviteForm({ roles, onCreated }: { roles: readonly RoleOption[]; onCreated(invite: InviteMade): void }) {
  const app = useApp();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [personId, setPersonId] = useState<string | null>(null);
  const [own, setOwn] = useState(true);
  const create = async () => {
    const result = await tryIt(app, () => api.post<InviteMade>('/api/invites', { email, role, personId, grantBranch: own }));
    if (result) onCreated(result);
  };
  return (
    <>
      <h3>{t('Invite a relative')}</h3>
      <div className="fields">
        <Field label={t('Email')}><input type="email" placeholder={t('their@email.example')} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label={t('Role')}><Select options={inWords(t, roles)} value={role} onChange={(value) => setRole(value)} /></Field>
        <Field label={t('Who are they on the tree?')} wide><PersonPicker placeholder={t('Search for their name')} onPick={setPersonId} /></Field>
        <Check label={t('They look after themselves and their descendants')} checked={own} onChange={setOwn} />
      </div>
      <div className="form-actions">
        <button type="button" className="primary" onClick={create}>{t('Create invitation')}</button>
      </div>
    </>
  );
}

function Invitation({ invite }: { invite: InviteView }) {
  const app = useApp();
  const { t } = useT();
  const role = t(ROLE_WORDS[invite.role]);
  return (
    <div className="row">
      <div className="main">
        <strong>{invite.email || t('Anyone with the link')}</strong>
        <small>{invite.personName ? t('{role}, as {name}, invited by {by}', { role, name: invite.personName, by: invite.by }) : t('{role}, invited by {by}', { role, by: invite.by })}</small>
      </div>
      <div className="side">
        <button type="button" className="small" onClick={() => tryIt(app, () => api.del(`/api/invites/${invite.id}`))}>{t('Cancel invitation')}</button>
      </div>
    </div>
  );
}

export function MembersTab() {
  const app = useApp();
  const { t } = useT();
  const { data, error } = useMembers();
  // The invitation made last, with its link to pass on
  const [made, setMade] = useState<InviteMade | null>(null);
  // Counts the invitations made here, so that each one leaves an empty form behind
  const [invited, setInvited] = useState(0);
  if (!data) return <Loading error={error} />;

  const isOwner = app.session.user?.role === 'owner';
  const roles = isOwner ? [...ROLES, OWNER] : ROLES;

  return (
    <>
      {data.requests.length > 0 && (
        <>
          <h3>{t('Asking to join')}</h3>
          {data.requests.map((request) => <JoinRequest key={request.id} request={request} onApproved={setMade} />)}
        </>
      )}

      <h3>{t('Members')}</h3>
      {data.members.map((member) => {
        const locked = member.role === 'owner' && !isOwner;
        return <MemberRow key={member.id} member={member} roles={locked ? [OWNER] : roles} locked={locked} />;
      })}

      <InviteForm
        key={invited}
        roles={roles}
        onCreated={(invite) => {
          setMade(invite);
          setInvited((count) => count + 1);
        }}
      />
      {made && (
        <>
          <p className="pencil">
            {made.emailedTo
              ? t('Emailed to {address}. You can also pass the link on yourself. It works once, for two weeks.', { address: made.emailedTo })
              : t('Pass this link on. It works once, for two weeks, and is shown only now.')}
          </p>
          <CopyRow value={made.link} />
        </>
      )}
      {data.invites.length > 0 && (
        <>
          <h3>{t('Invitations not yet accepted')}</h3>
          {data.invites.map((invite) => <Invitation key={invite.id} invite={invite} />)}
        </>
      )}
    </>
  );
}
