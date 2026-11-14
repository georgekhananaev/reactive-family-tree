'use client';

/*
 * Manage family. The admin runs everything from here: members, branches,
 * activity, compost, the health of the tree, settings, translations, and data
 * in and out. A steward sees the parts that concern their own branch.
 */

import type { CompostItem, HealthEntry, HealthReport, MemberView, Op } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import type { ComponentType } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';

import type { PanelDef, PanelProps } from '../Drawer';
import { ConfirmButton } from '../ui';

import { ActivityCard } from './InboxPanel';
import { DataTab } from './ManageData';
import { BranchChip, MembersTab } from './ManageMembers';
import { LookTab } from './ManageLook';
import { SettingsTab } from './ManageSettings';
import { TranslationsTab } from './ManageTranslations';
import { Loading, tryIt, useEdits, useMembers, useWhen } from './shared';

/* One colour per steward, for seeing branches on the tree. */
export const STEWARD_COLOURS: readonly string[] = ['#12708A', '#C9992E', '#B4432E', '#7A5AA8', '#2F6B4F', '#D2691E', '#4A7BD0', '#C2518C'];

const useHealth = () => useQuery({ queryKey: ['health'], queryFn: () => api.get<HealthReport>('/api/health') });

/* ---------- Branches: assigned on the tree itself, because a branch is a shape ---------- */

function BranchesTab() {
  const app = useApp();
  const { t } = useT();
  const members = useMembers();
  const health = useHealth();
  const list = members.data?.members;

  // While this is showing, everyone on the tree is ringed in their steward's colour
  const tint = useEffectEvent((stewards: MemberView[]) => app.showBranches(stewards));
  // Leaving clears the rings, unless branches are being assigned on the tree
  const leave = useEffectEvent(() => { if (!app.painting) app.showBranches(null); });
  const settled = !members.isFetching;
  useEffect(() => {
    // Not with a list kept from earlier: it may be from before branches were assigned on the tree
    if (list && settled) tint(list);
  }, [list, settled, app.tree]);
  useEffect(() => () => leave(), []);

  if (!list || !health.data) return <Loading error={members.error ?? health.error} />;
  return (
    <>
      <p>{t('A branch is one person, their descendants, and those descendants’ partners. Its steward edits it directly. Everyone else suggests.')}</p>
      <p className="hint-line">{t('{n} of {total} people have no steward, so only admins can edit them directly.', { n: health.data.withoutSteward, total: health.data.total })}</p>
      {list.map((member, index) => (
        <div key={member.id} className="row">
          <div className="main">
            <strong>
              <span className="chip">
                <i style={{ background: STEWARD_COLOURS[index % STEWARD_COLOURS.length] }} />
                {member.name}
              </span>
            </strong>
            <div>
              {member.anchorNames.length
                ? member.anchorNames.map((name, at) => <BranchChip key={member.anchors[at]} member={member} at={at} label={t('Remove {name}’s branch', { name })} />)
                : <small>{t('No branch')}</small>}
            </div>
          </div>
          <div className="side">
            <button type="button" className="small" onClick={() => app.startPainting(member, list)}>{t('Assign on the tree')}</button>
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------- Activity and compost ---------- */

function ActivityTab() {
  const { t } = useT();
  const { data, error } = useEdits('activity');
  if (!data) return <Loading error={error} />;
  if (!data.edits.length) return <p className="empty">{t('Nothing has changed yet.')}</p>;
  return data.edits.map((edit) => <ActivityCard key={edit.id} edit={edit} />);
}

function CompostTab() {
  const app = useApp();
  const { t } = useT();
  const when = useWhen();
  const { data, error } = useQuery({ queryKey: ['compost'], queryFn: () => api.get<{ people: CompostItem[] }>('/api/compost') });
  if (!data) return <Loading error={error} />;
  const restore = (p: CompostItem) => {
    const ops: Op[] = [{ type: 'person.restore', person: p.id }];
    return tryIt(app, () => api.post('/api/edits', { ops, message: t('Restore {name}', { name: p.name }) }), t('{name} is back on the tree', { name: p.name }));
  };
  return (
    <>
      <p className="hint-line">{t('Removed people stay here for 30 days and can be restored. After that they are gone for good.')}</p>
      {data.people.length ? data.people.map((p) => (
        <div key={p.id} className="row">
          <div className="main">
            <strong>{p.name}</strong>
            <small>{t('removed {when}', { when: when(p.removedAt) })}</small>
          </div>
          <div className="side">
            <button type="button" className="small primary" onClick={() => restore(p)}>{t('Restore')}</button>
            <ConfirmButton label={t('Remove for good')} sure={t('Cannot be undone. Sure?')} onConfirm={() => tryIt(app, () => api.post(`/api/compost/${p.id}/purge`), t('Removed for good'))} className="small danger" />
          </div>
        </div>
      )) : <p className="empty">{t('The compost is empty.')}</p>}
    </>
  );
}

/* ---------- Tree health ---------- */

/* `title` is said with the number of people in it. */
function HealthSection({ title, entries, empty }: { title: string; entries: HealthEntry[]; empty: string }) {
  const app = useApp();
  return (
    <>
      <h3>{title}</h3>
      {entries.length ? (
        <ul className="relatives">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="link" onClick={() => { app.closePanel(); app.select(entry.id, { fly: true }); }}>{entry.name}</button>
            </li>
          ))}
        </ul>
      ) : <p className="hint-line">{empty}</p>}
    </>
  );
}

function HealthTab() {
  const { t } = useT();
  const { data: report, error } = useHealth();
  if (!report) return <Loading error={error} />;
  return (
    <>
      {report.suspicious.length > 0 && (
        <>
          <h3>{t('Looks wrong ({n})', { n: report.suspicious.length })}</h3>
          {report.suspicious.map((item, index) => <p key={index} className="warning">{item.message}</p>)}
        </>
      )}
      <HealthSection title={t('No name yet ({n})', { n: report.unnamed.length })} entries={report.unnamed} empty={t('Everyone has a name.')} />
      <HealthSection title={t('No birth date ({n})', { n: report.noBirthDate.length })} entries={report.noBirthDate} empty={t('Everyone has a birth date.')} />
      <HealthSection title={t('Connected to nobody ({n})', { n: report.noParents.length })} entries={report.noParents} empty={t('Everyone is connected.')} />
    </>
  );
}

const TABS: Readonly<Record<string, ComponentType | undefined>> = {
  members: MembersTab, branches: BranchesTab, activity: ActivityTab, compost: CompostTab, health: HealthTab, settings: SettingsTab, look: LookTab, translations: TranslationsTab, data: DataTab,
};

function ManageBody({ args }: PanelProps) {
  const Tab = TABS[args.tab ?? ''];
  return Tab ? <Tab /> : null;
}

export const manage: PanelDef = {
  title: (_args, app, t) => (app.isAdmin ? t('Manage family') : t('Manage my branch')),
  tabs: (app, _args, t) => (app.isAdmin
    ? [['members', t('Members')], ['branches', t('Branches')], ['activity', t('Activity')], ['compost', t('Compost')], ['health', t('Health')], ['settings', t('Settings')], ['look', t('The look')], ['translations', t('Translations')], ['data', t('Data')]]
    : [['activity', t('Activity')], ['health', t('Health')]]),
  Body: ManageBody,
};
