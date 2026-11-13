'use client';

/*
 * Connect your AI. A member creates a connection, gets a token once, and
 * pastes it into the AI client they already use. From then on that client can
 * read and edit the tree as them, by default through drafts they approve.
 */

import type { ConnectionAccess, ConnectionMode, ConnectionView, ConnectionsInfo, PublicSettings, ToolProfile } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { when } from '@/lib/format';

import type { PanelDef } from '../Drawer';
import { ConfirmButton, CopyRow, Field, Select } from '../ui';

import { Loading, tryIt } from './shared';

type Options<Value extends string> = readonly (readonly [Value, string])[];

const MODES: Options<ConnectionMode> = [['review_first', 'Review first: changes arrive as a draft I approve'], ['apply_directly', 'Apply directly: inside my branch, changes publish at once']];
const ACCESS: Options<ConnectionAccess> = [['write', 'Read and change'], ['read', 'Read only']];
const ADMIN_ACCESS: Options<ConnectionAccess> = [['admin', 'Everything an admin can']];
const NEW_ADMIN_ACCESS: Options<ConnectionAccess> = [...ACCESS, ['admin', 'Everything an admin can, including review']];
const PROFILES: Options<ToolProfile> = [['full', 'All tools'], ['simple', 'Fewer, simpler tools (for small local models)']];

/* "Apply directly" is offered only where the admin allows it. */
const modesFor = (settings: PublicSettings) => (settings.allowAiDirect ? MODES : MODES.slice(0, 1));

/* A token that was just created, and the name of the connection it belongs to. */
interface Fresh {
  name: string;
  token: string;
}

/* What to paste into each client, with the address and token filled in. */
function setupFor(address: string, token: string): [string, string][] {
  const config = JSON.stringify({ mcpServers: { 'family-tree': { type: 'http', url: address, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  return [
    ['Claude Code', `claude mcp add --transport http family-tree ${address} --header "Authorization: Bearer ${token}"`],
    ['Cursor, VS Code, Claude Desktop and others (JSON config)', config],
    ['Anything that speaks HTTP', `curl -s ${address} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`],
  ];
}

/* When a connection was last used. One that a client made by signing in says so first. */
const usageOf = (connection: ConnectionView) => `${connection.kind === 'oauth' ? 'signed in, ' : ''}${connection.lastUsedAt ? `used ${when(connection.lastUsedAt)}` : 'not used yet'}`;

/* What can be changed about a connection once it exists. */
type Choice = Partial<Pick<ConnectionView, 'mode' | 'access' | 'profile'>>;

/* One of the viewer's own connections, with what it may do. */
function OwnConnection({ connection }: { connection: ConnectionView }) {
  const app = useApp();
  // A saved choice is not asked for again. It is kept here and shown until the server's copy of the connection changes.
  const [chosen, setChosen] = useState<{ choice: Choice; over: ConnectionView } | null>(null);
  const choice = chosen?.over === connection ? chosen.choice : {};
  const shown = { ...connection, ...choice };
  const save = async (patch: Choice) => {
    setChosen({ choice: { ...choice, ...patch }, over: connection });
    try {
      await api.patch(`/api/connections/${connection.id}`, patch);
      app.toast('Saved');
    } catch (error) {
      app.fail(error);
      setChosen(null);
      void app.refresh();
    }
  };
  const revoke = () => tryIt(app, () => api.del(`/api/connections/${connection.id}`), connection.kind === 'oauth' ? 'Disconnected. It would have to sign in again.' : 'Connection revoked. Its token no longer works.');

  return (
    <div className="edit">
      <header>
        <strong>{connection.name}</strong>
        <small>{usageOf(connection)}</small>
      </header>
      <div className="fields" style={{ marginTop: 8 }}>
        <Field label="How changes arrive" wide>
          <Select options={modesFor(app.session.settings)} value={shown.mode} onChange={(mode) => save({ mode })} />
        </Field>
        <Field label="What it may do">
          <Select options={connection.access === 'admin' ? ADMIN_ACCESS : ACCESS} value={shown.access} onChange={(access) => save({ access })} />
        </Field>
        <Field label="Tools">
          <Select options={PROFILES} value={shown.profile} onChange={(profile) => save({ profile })} />
        </Field>
      </div>
      <div className="form-actions">
        <ConfirmButton label="Revoke" sure="Really revoke?" onConfirm={revoke} className="small danger" />
      </div>
    </div>
  );
}

function NewConnection({ onCreated }: { onCreated(fresh: Fresh): void }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('review_first');
  const [access, setAccess] = useState<ConnectionAccess>('write');
  const create = async () => {
    try {
      const created = await api.post<{ token: string }>('/api/connections', { name, mode, access });
      onCreated({ name, token: created.token });
      setName('');
      setMode('review_first');
      setAccess('write');
      void app.refresh();
    } catch (error) {
      app.fail(error);
    }
  };

  return (
    <>
      <h3>New connection</h3>
      <div className="fields">
        <Field label="Name" wide><input type="text" placeholder="For example: Claude on my laptop" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="How changes arrive" wide><Select options={modesFor(app.session.settings)} value={mode} onChange={(value) => setMode(value)} /></Field>
        <Field label="What it may do" wide><Select options={app.isAdmin ? NEW_ADMIN_ACCESS : ACCESS} value={access} onChange={(value) => setAccess(value)} /></Field>
      </div>
      <div className="form-actions">
        <button type="button" className="primary" onClick={create}>Create connection</button>
      </div>
    </>
  );
}

/* A connection of anyone in the family, as an admin sees it. */
function FamilyConnection({ connection }: { connection: ConnectionView }) {
  const app = useApp();
  const revoke = () => tryIt(app, () => api.del(`/api/connections/${connection.id}`));
  return (
    <div className="row">
      <div className="main">
        <strong>{`${connection.owner}: ${connection.name}`}</strong>
        <small>{`${connection.mode === 'review_first' ? 'review first' : 'applies directly'}, ${usageOf(connection)}`}</small>
      </div>
      <div className="side">
        <ConfirmButton label="Revoke" sure="Sure?" onConfirm={revoke} className="small danger" />
      </div>
    </div>
  );
}

function ConnectBody() {
  const app = useApp();
  const { data, error } = useQuery({ queryKey: ['connections'], queryFn: () => api.get<ConnectionsInfo>('/api/connections') });
  const [fresh, setFresh] = useState<Fresh | null>(null);
  if (!data) return <Loading error={error} />;

  const { address, signIn, connections, everyone } = data;
  const { settings, counts } = app.session;
  const about = <p>Your assistant can read the tree and make changes for you. It can only do what you can do, and by default you approve its changes first.</p>;
  if (!settings.allowAi) {
    return (
      <>
        {about}
        <p className="warning">The family’s admin has turned AI connections off.</p>
      </>
    );
  }

  return (
    <>
      {about}
      <h3>Address</h3>
      <CopyRow value={address} />
      {signIn && <p className="hint-line">An AI client that can sign in needs only this address. The token below is for the others.</p>}

      {/* A token just created is shown once, with ready-made setup for each client */}
      {fresh && (
        <>
          <h3>{`Set up “${fresh.name}”`}</h3>
          <p className="warning">This token is shown only now. Copy it into your AI client before closing this panel.</p>
          <CopyRow value={fresh.token} />
          {setupFor(address, fresh.token).map(([label, text]) => (
            <Fragment key={label}>
              <p className="hint-line">{label}</p>
              <CopyRow value={text} />
              <pre className="code">{text}</pre>
            </Fragment>
          ))}
          <div className="form-actions">
            <button type="button" onClick={() => setFresh(null)}>Done, I have copied it</button>
          </div>
        </>
      )}

      <h3>Your connections</h3>
      {connections.length ? connections.map((connection) => <OwnConnection key={connection.id} connection={connection} />) : <p className="empty">No connections yet.</p>}

      <NewConnection onCreated={setFresh} />

      {counts.drafts > 0 && (
        <>
          <h3>Drafts waiting for you</h3>
          <div className="form-actions">
            <button type="button" onClick={() => app.openPanel('inbox', { tab: 'mine' })}>{`Review ${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}`}</button>
          </div>
        </>
      )}
      {everyone.length > 0 && (
        <>
          <h3>Every connection in the family</h3>
          {everyone.map((connection) => <FamilyConnection key={connection.id} connection={connection} />)}
        </>
      )}
    </>
  );
}

export const connect: PanelDef = { title: () => 'Connect your AI', Body: ConnectBody };
