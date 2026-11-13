'use client';

/* Manage family, the members: who is asking to join, who may sign in and as what, and who has been invited. */

import type { InviteMade, InviteView, JoinRequestView, MemberView, Role } from '@reactive-family-tree/core';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';

import { ConfirmButton, CopyRow, Field, Select } from '../ui';

import { PersonPicker } from './PersonPicker';
import { Check, Loading, tryIt, useMembers } from './shared';

type RoleOption = readonly [Role, string];

const OWNER: RoleOption = ['owner', 'Owner'];
const ROLES: readonly RoleOption[] = [['member', 'Member'], ['admin', 'Admin']];

/* One branch a member looks after, with a way to take it away. `label` is what the × is called. */
export function BranchChip({ member, at, label }: { member: MemberView; at: number; label: string }) {
  const app = useApp();
  return (
    <span className="chip">
      {`${member.anchorNames[at] ?? 'Someone'}’s branch`}
      <button type="button" aria-label={label} onClick={() => tryIt(app, () => api.del(`/api/members/${member.id}/branches/${member.anchors[at]}`))}>×</button>
    </span>
  );
}

function JoinRequest({ request, onApproved }: { request: JoinRequestView; onApproved(invite: InviteMade | null): void }) {
  const app = useApp();
  const approve = async () => {
    const result = await tryIt(app, () => api.post<{ invite: InviteMade | null }>(`/api/join/${request.id}`, { approve: true }));
    if (result) onApproved(result.invite);
  };
  return (
    <div className="row">
      <div className="main">
        <strong>{`${request.name}, ${request.email}`}</strong>
        <small>{request.message || 'No message'}</small>
      </div>
      <div className="side">
        <button type="button" className="small primary" onClick={approve}>Approve</button>
        <button type="button" className="small" onClick={() => tryIt(app, () => api.post(`/api/join/${request.id}`, { approve: false }), 'Declined')}>Decline</button>
      </div>
    </div>
  );
}

/* `roles` are the ones this member can be given. `locked` is for an owner seen by someone who is not one. */
function MemberRow({ member, roles, locked }: { member: MemberView; roles: readonly RoleOption[]; locked: boolean }) {
  const app = useApp();
  // The role just chosen, until the server has answered
  const [picked, setPicked] = useState<Role | null>(null);
  const change = async (role: Role) => {
    setPicked(role);
    await tryIt(app, () => api.patch(`/api/members/${member.id}`, { role }), 'Role changed');
    setPicked(null);
  };
  return (
    <div className="row">
      <div className="main">
        <strong>{member.name}</strong>
        <small>{[member.email, member.personName ? `is ${member.personName}` : 'not linked to a leaf', member.ai ? 'has an AI connected' : null].filter(Boolean).join(', ')}</small>
        <div>
          {member.anchorNames.map((name, at) => (
            <BranchChip key={member.anchors[at]} member={member} at={at} label={`Take ${name}’s branch away from ${member.name}`} />
          ))}
        </div>
      </div>
      <div className="side">
        <Select options={roles} value={picked ?? member.role} onChange={change} aria-label={`Role of ${member.name}`} disabled={locked} />
        {member.id !== app.session.user?.id && (
          <ConfirmButton label="Remove" sure="Really?" onConfirm={() => tryIt(app, () => api.del(`/api/members/${member.id}`), `${member.name} can no longer sign in`)} className="small danger" />
        )}
      </div>
    </div>
  );
}

/* Invite someone, optionally as a person already on the tree */
function InviteForm({ roles, onCreated }: { roles: readonly RoleOption[]; onCreated(invite: InviteMade): void }) {
  const app = useApp();
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
      <h3>Invite a relative</h3>
      <div className="fields">
        <Field label="Email"><input type="email" placeholder="their@email.example" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label="Role"><Select options={roles} value={role} onChange={(value) => setRole(value)} /></Field>
        <Field label="Who are they on the tree?" wide><PersonPicker placeholder="Search for their name" onPick={setPersonId} /></Field>
        <Check label="They look after themselves and their descendants" checked={own} onChange={setOwn} />
      </div>
      <div className="form-actions">
        <button type="button" className="primary" onClick={create}>Create invitation</button>
      </div>
    </>
  );
}

function Invitation({ invite }: { invite: InviteView }) {
  const app = useApp();
  return (
    <div className="row">
      <div className="main">
        <strong>{invite.email || 'Anyone with the link'}</strong>
        <small>{`${invite.role}${invite.personName ? `, as ${invite.personName}` : ''}, invited by ${invite.by}`}</small>
      </div>
      <div className="side">
        <button type="button" className="small" onClick={() => tryIt(app, () => api.del(`/api/invites/${invite.id}`))}>Cancel</button>
      </div>
    </div>
  );
}

export function MembersTab() {
  const app = useApp();
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
          <h3>Asking to join</h3>
          {data.requests.map((request) => <JoinRequest key={request.id} request={request} onApproved={setMade} />)}
        </>
      )}

      <h3>Members</h3>
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
              ? `Emailed to ${made.emailedTo}. You can also pass the link on yourself. It works once, for two weeks.`
              : 'Pass this link on. It works once, for two weeks, and is shown only now.'}
          </p>
          <CopyRow value={made.link} />
        </>
      )}
      {data.invites.length > 0 && (
        <>
          <h3>Invitations not yet accepted</h3>
          {data.invites.map((invite) => <Invitation key={invite.id} invite={invite} />)}
        </>
      )}
    </>
  );
}
