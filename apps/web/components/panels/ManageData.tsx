'use client';

/* Manage family, data in and out. */

import type { EditResult } from '@reactive-family-tree/core';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';

import { ConfirmButton, pickFile } from '../ui';

import { tryIt } from './shared';

/* What the server says about a GEDCOM file it has staged. */
type GedcomImport = EditResult & { people: number; skipped: string[] };

export function DataTab() {
  const app = useApp();
  const { t } = useT();
  const isOwner = app.session.user?.role === 'owner';

  const importGedcom = () => pickFile('.ged,.gedcom,.txt', async (text) => {
    const result = await tryIt(app, () => api.post<GedcomImport>('/api/import/gedcom', { text }));
    if (!result) return;
    const n = result.people, skipped = result.skipped.join(', ');
    app.toast(skipped ? t('{n#One person|# people} staged as a draft. Not understood: {skipped}', { n, skipped }) : t('{n#One person|# people} staged as a draft', { n }));
    app.openPanel('inbox', { tab: 'mine', editId: result.editId });
  });

  const restoreBackup = () => pickFile('.json', (text) => {
    let backup: unknown;
    try {
      backup = JSON.parse(text);
    } catch {
      app.toast(t('That file is not a backup.'), { bad: true });
      return;
    }
    app.toast(t('Replace the whole tree with this backup?'), {
      action: t('Replace'),
      ms: 12000,
      onAction: async () => {
        try {
          await api.post('/api/import/backup', { backup });
          location.reload();
        } catch (error) {
          app.fail(error);
        }
      },
    });
  });

  const startAgain = async () => {
    try {
      await api.post('/api/demo/reset');
      location.reload();
    } catch (error) {
      app.fail(error);
    }
  };

  return (
    <>
      <h3>{t('Take it with you')}</h3>
      <p>{t('Everything can leave in standard formats at any time.')}</p>
      <div className="form-actions">
        <a href="/api/export/gedcom" download="family.ged"><button type="button">{t('Download GEDCOM')}</button></a>
        <a href="/api/export/backup" download="family-backup.json"><button type="button">{t('Download full backup')}</button></a>
      </div>

      <h3>{t('Bring a tree in')}</h3>
      <p className="hint-line">{t('A GEDCOM file from other family tree software. Nothing is written until you have looked at it: it arrives as a draft you can preview on the tree, apply, or discard.')}</p>
      <div className="form-actions">
        <button type="button" onClick={importGedcom}>{t('Import a GEDCOM file')}</button>
      </div>

      {isOwner && (
        <>
          <h3>{t('Danger zone')}</h3>
          <p className="hint-line">{t('Only owners see this. Restoring a backup replaces the whole tree and signs everyone out.')}</p>
          <div className="form-actions">
            <button type="button" className="danger" onClick={restoreBackup}>{t('Restore a backup')}</button>
            {/* Only an install that runs the demo family can be started again */}
            {app.session.demo && <ConfirmButton label={t('Start the demo again')} sure={t('Wipe everything. Sure?')} onConfirm={startAgain} className="danger" />}
          </div>
        </>
      )}
    </>
  );
}
