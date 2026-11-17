'use client';

/*
 * The setup wizard: five short steps from a fresh install to a tree. The first
 * two are needed, the rest can be skipped, and everything chosen here can be
 * changed later under "Manage family". The first also offers the language,
 * which becomes the family's own once the tree is claimed.
 */

import { LANGS, LANG_NAMES, directionOf } from '@reactive-family-tree/core';
import type { EditResult, SessionInfo, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { SessionWait } from '@/components/SessionWait';
import { Field, pickFile } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { OWN_CHOICE } from '@/lib/appearance';
import type { Theme } from '@/lib/appearance';
import { addPasskey, family } from '@/lib/auth-client';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

const STEPS = ['About you', 'The family', 'A starting point', 'The look', 'Who can see it'] as const;

const VISIBILITY: readonly (readonly [Visibility, WebPhrase, WebPhrase])[] = [
  ['private', 'Private', 'Only relatives you invite can see anything. Everyone else sees a sign-in page.'],
  ['public_masked', 'Public, with the living hidden', 'Anyone can see the tree. Living people appear as unnamed leaves with no details.'],
  ['public', 'Public', 'As above, and living people who choose it themselves are shown.'],
];

function Choice({ pressed, title, children, onClick }: { pressed?: boolean; title: string; children: ReactNode; onClick(): void }) {
  return (
    <button type="button" className="choice" aria-pressed={pressed} onClick={onClick}>
      <strong>{title}</strong>
      <small>{children}</small>
    </button>
  );
}

export function SetupWizard() {
  const { lang, t, choose } = useT();
  const session = useQuery({ queryKey: ['session'], queryFn: () => api.get<SessionInfo>('/api/session') });
  const token = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('token') ?? '';
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [you, setYou] = useState({ name: '', email: '' });
  const [passkeyMade, setPasskeyMade] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [leaf, setLeaf] = useState({ given: '', family: '', born: '' });
  const [start, setStart] = useState<'self' | 'gedcom' | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [look, setLook] = useState<Theme | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('private');

  /* Do one step's work, say so if it fails, and move on if it did not. */
  const go = (work: () => Promise<unknown>, next = step + 1) => async () => {
    setBusy(true);
    setProblem('');
    try {
      await work();
      setStep(next);
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  const finish = () => location.assign('/');

  if (!session.data) return <SessionWait failed={session.isError} onRetry={() => void session.refetch()} />;
  const { user, needsSetup } = session.data;
  const claimed = user?.role === 'owner';
  if (!needsSetup && !claimed) {
    return (
      <>
        <h1>{t('This tree is already set up')}</h1>
        <p>{t('Its owner can change everything under “{panel}”.', { panel: t('Manage family') })} <a href="/">{t('Go to the tree')}</a></p>
      </>
    );
  }
  // The owner came back after claiming the tree: carry on from the second step
  const at = claimed && step === 0 ? 1 : step;

  return (
    <>
      <ol className="steps" aria-label={t('Step {n} of {total}: {name}', { n: at + 1, total: STEPS.length, name: t(STEPS[at]) })}>
        {STEPS.map((name, index) => <li key={name} className={index < at ? 'done' : undefined} aria-current={index === at ? 'step' : undefined} />)}
      </ol>
      {problem && <p className="warning" role="alert">{problem}</p>}

      {at === 0 && (
        <>
          {/* Each language under its own name, so it can be found by someone who cannot read the one shown now */}
          <p className="language-row" role="group" aria-label={t('Choose a language')}>
            {LANGS.map((one) => (
              <button key={one} type="button" className="choice" aria-pressed={one === lang} lang={one} dir={directionOf(one)} onClick={() => void choose(one).catch((error: unknown) => setProblem(messageOf(error)))}>
                {LANG_NAMES[one]}
              </button>
            ))}
          </p>
          <h1>{t('Set up your family tree')}</h1>
          <p className="lead">{t('First, you. This makes you the owner of the tree.')}</p>
          <div className="fields">
            <Field label={t('Your name')} wide><input type="text" autoComplete="name" value={you.name} onChange={(event) => setYou({ ...you, name: event.target.value })} /></Field>
            <Field label={t('Your email')} wide><input type="email" autoComplete="email" value={you.email} onChange={(event) => setYou({ ...you, email: event.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => { await family.claimSetup({ token, ...you }); await session.refetch(); })}>{t('Continue')}</button>
          </div>
        </>
      )}

      {at === 1 && (
        <>
          <h1>{t('The family')}</h1>
          <p className="lead">{t('What should the tree be called?')}</p>
          <Field label={t('The family’s name')}><input type="text" placeholder={t('Khananaev family')} value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></Field>
          <h2>{t('A passkey, so you never need a password')}</h2>
          <p>{t('Your device keeps it, and signing in becomes one touch. It also works before email is set up.')}</p>
          <div className="form-actions">
            <button type="button" disabled={busy || passkeyMade} onClick={go(async () => { await addPasskey(t); setPasskeyMade(true); }, at)}>{passkeyMade ? t('Passkey created') : t('Create a passkey')}</button>
          </div>
          <div className="form-actions">
            {/* The tree is claimed by now, so the language chosen on the first step can become the family's own */}
            <button type="button" className="primary" disabled={busy} onClick={go(() => api.patch('/api/settings', { familyName, language: lang }))}>{t('Continue')}</button>
          </div>
        </>
      )}

      {at === 2 && (
        <>
          <h1>{t('A starting point')}</h1>
          <div className="choices">
            <Choice
              pressed={start === 'self'}
              title={t('Start with yourself')}
              onClick={() => {
                setStart('self');
                // Their name is known already. It is split at the last word, for them to put right if that is wrong.
                const words = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
                if (!leaf.given && !leaf.family && words.length) setLeaf({ ...leaf, given: words.slice(0, -1).join(' ') || words[0] || '', family: words.length > 1 ? words.at(-1) ?? '' : '' });
              }}
            >
              {t('Your own leaf is planted, and the tree grows from there.')}
            </Choice>
            <Choice pressed={start === 'gedcom'} title={t('Import a GEDCOM file')} onClick={() => setStart('gedcom')}>{t('Bring a tree from other family history software. You preview it before anything is saved.')}</Choice>
          </div>
          {start === 'self' && (
            <>
              <div className="fields">
                <Field label={t('Given name')}><input type="text" value={leaf.given} onChange={(event) => setLeaf({ ...leaf, given: event.target.value })} /></Field>
                <Field label={t('Family name')}><input type="text" value={leaf.family} onChange={(event) => setLeaf({ ...leaf, family: event.target.value })} /></Field>
                <Field label={t('Year you were born')}><input type="text" inputMode="numeric" value={leaf.born} onChange={(event) => setLeaf({ ...leaf, born: event.target.value })} /></Field>
              </div>
              <div className="form-actions">
                <button type="button" className="primary" disabled={busy} onClick={go(() => api.post('/api/setup/first-leaf', { ...leaf, born: Number(leaf.born) }))}>{t('Plant my leaf')}</button>
              </div>
            </>
          )}
          {start === 'gedcom' && (
            <div className="form-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => pickFile('.ged,text/plain', (text) => void go(async () => {
                const staged = await api.post<EditResult & { people: number }>('/api/import/gedcom', { text });
                setImported(staged.people);
              })())}>{t('Choose a file')}</button>
            </div>
          )}
          <div className="form-actions"><button type="button" className="link" onClick={() => setStep(at + 1)}>{t('Skip for now')}</button></div>
        </>
      )}

      {at === 3 && (
        <>
          <h1>{t('The look')}</h1>
          {imported !== null && <p className="pencil">{t('{n#One person is waiting as a draft. Open the inbox on the tree to preview and apply it.|# people are waiting as a draft. Open the inbox on the tree to preview and apply them.}', { n: imported })}</p>}
          <p className="lead">{t('How the tree opens for the family: by day, or after dark. Each relative can still choose for themselves.')}</p>
          <div className="choices">
            {(['light', 'dark'] as const).map((theme) => (
              <Choice key={theme} pressed={look === theme} title={theme === 'light' ? t('Light') : t('Dark')} onClick={() => {
                setLook(theme);
                document.documentElement.setAttribute('data-theme', theme);
              }}>{theme === 'light' ? t('Ink and watercolour on white.') : t('The same tree after sunset.')}</Choice>
            ))}
          </div>
          <p>{t('Choose neither, and it opens light or dark as each person’s device is set.')}</p>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => {
              if (!look) return;
              await api.patch('/api/settings', { appearance: look });
              // This browser follows what was just chosen for the family, whatever it had kept for itself before
              try { localStorage.removeItem(OWN_CHOICE); } catch { /* private browsing */ }
            })}>{t('Continue')}</button>
          </div>
        </>
      )}

      {at === 4 && (
        <>
          <h1>{t('Who can see it')}</h1>
          <div className="choices">
            {VISIBILITY.map(([value, title, text]) => <Choice key={value} pressed={visibility === value} title={t(title)} onClick={() => setVisibility(value)}>{t(text)}</Choice>)}
          </div>
          <p className="lead">{t('Living people are never shown to strangers unless they choose it themselves, from their own account.')}</p>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => { await api.patch('/api/settings', { visibility }); finish(); }, at)}>{t('Open the tree')}</button>
          </div>
        </>
      )}
    </>
  );
}
