'use client';

/*
 * The setup wizard: five short steps from a fresh install to a tree. The first
 * two are needed, the rest can be skipped, and everything chosen here can be
 * changed later under "Manage family".
 */

import type { EditResult, SessionInfo, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Field, pickFile } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { OWN_CHOICE } from '@/lib/appearance';
import type { Theme } from '@/lib/appearance';
import { addPasskey, family } from '@/lib/auth-client';

const STEPS = ['You', 'The family', 'A starting point', 'The look', 'Who can see it'] as const;

const VISIBILITY: readonly (readonly [Visibility, string, string])[] = [
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
  const [imported, setImported] = useState<string | null>(null);
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

  if (!session.data) return <p className="lead">One moment…</p>;
  const { user, needsSetup } = session.data;
  const claimed = user?.role === 'owner';
  if (!needsSetup && !claimed) {
    return (
      <>
        <h1>This tree is already set up</h1>
        <p>Its owner can change everything under “Manage family”. <a href="/">Go to the tree</a></p>
      </>
    );
  }
  // The owner came back after claiming the tree: carry on from the second step
  const at = claimed && step === 0 ? 1 : step;

  return (
    <>
      <ol className="steps" aria-label={`Step ${at + 1} of ${STEPS.length}: ${STEPS[at]}`}>
        {STEPS.map((name, index) => <li key={name} className={index < at ? 'done' : undefined} aria-current={index === at ? 'step' : undefined} />)}
      </ol>
      {problem && <p className="warning" role="alert">{problem}</p>}

      {at === 0 && (
        <>
          <h1>Set up your family tree</h1>
          <p className="lead">First, you. This makes you the owner of the tree.</p>
          <div className="fields">
            <Field label="Your name" wide><input type="text" autoComplete="name" value={you.name} onChange={(event) => setYou({ ...you, name: event.target.value })} /></Field>
            <Field label="Your email" wide><input type="email" autoComplete="email" value={you.email} onChange={(event) => setYou({ ...you, email: event.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => { await family.claimSetup({ token, ...you }); await session.refetch(); })}>Continue</button>
          </div>
        </>
      )}

      {at === 1 && (
        <>
          <h1>The family</h1>
          <p className="lead">What should the tree be called?</p>
          <Field label="Family name"><input type="text" placeholder="Khananaev family" value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></Field>
          <h2>A passkey, so you never need a password</h2>
          <p>Your device keeps it, and signing in becomes one touch. It also works before email is set up.</p>
          <div className="form-actions">
            <button type="button" disabled={busy || passkeyMade} onClick={go(async () => { await addPasskey(); setPasskeyMade(true); }, at)}>{passkeyMade ? 'Passkey created' : 'Create a passkey'}</button>
          </div>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(() => api.patch('/api/settings', { familyName }))}>Continue</button>
          </div>
        </>
      )}

      {at === 2 && (
        <>
          <h1>A starting point</h1>
          <div className="choices">
            <Choice
              pressed={start === 'self'}
              title="Start with yourself"
              onClick={() => {
                setStart('self');
                // Their name is known already. It is split at the last word, for them to put right if that is wrong.
                const words = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
                if (!leaf.given && !leaf.family && words.length) setLeaf({ ...leaf, given: words.slice(0, -1).join(' ') || words[0] || '', family: words.length > 1 ? words.at(-1) ?? '' : '' });
              }}
            >
              Your own leaf is planted, and the tree grows from there.
            </Choice>
            <Choice pressed={start === 'gedcom'} title="Import a GEDCOM file" onClick={() => setStart('gedcom')}>Bring a tree from other family history software. You preview it before anything is saved.</Choice>
          </div>
          {start === 'self' && (
            <>
              <div className="fields">
                <Field label="Given name"><input type="text" value={leaf.given} onChange={(event) => setLeaf({ ...leaf, given: event.target.value })} /></Field>
                <Field label="Family name"><input type="text" value={leaf.family} onChange={(event) => setLeaf({ ...leaf, family: event.target.value })} /></Field>
                <Field label="Year you were born"><input type="text" inputMode="numeric" value={leaf.born} onChange={(event) => setLeaf({ ...leaf, born: event.target.value })} /></Field>
              </div>
              <div className="form-actions">
                <button type="button" className="primary" disabled={busy} onClick={go(() => api.post('/api/setup/first-leaf', { ...leaf, born: Number(leaf.born) }))}>Plant my leaf</button>
              </div>
            </>
          )}
          {start === 'gedcom' && (
            <div className="form-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => pickFile('.ged,text/plain', (text) => void go(async () => {
                const staged = await api.post<EditResult & { people: number }>('/api/import/gedcom', { text });
                setImported(`${staged.people} people are waiting as a draft. Open the inbox on the tree to preview and apply them.`);
              })())}>Choose a file</button>
            </div>
          )}
          <div className="form-actions"><button type="button" className="link" onClick={() => setStep(at + 1)}>Skip for now</button></div>
        </>
      )}

      {at === 3 && (
        <>
          <h1>The look</h1>
          {imported && <p className="pencil">{imported}</p>}
          <p className="lead">How the tree opens for the family: by day, or after dark. Each relative can still choose for themselves.</p>
          <div className="choices">
            {(['light', 'dark'] as const).map((theme) => (
              <Choice key={theme} pressed={look === theme} title={theme === 'light' ? 'Light' : 'Dark'} onClick={() => {
                setLook(theme);
                document.documentElement.setAttribute('data-theme', theme);
              }}>{theme === 'light' ? 'Ink and watercolour on white.' : 'The same tree after sunset.'}</Choice>
            ))}
          </div>
          <p>Choose neither, and it opens light or dark as each person’s device is set.</p>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => {
              if (!look) return;
              await api.patch('/api/settings', { appearance: look });
              // This browser follows what was just chosen for the family, whatever it had kept for itself before
              try { localStorage.removeItem(OWN_CHOICE); } catch { /* private browsing */ }
            })}>Continue</button>
          </div>
        </>
      )}

      {at === 4 && (
        <>
          <h1>Who can see it</h1>
          <div className="choices">
            {VISIBILITY.map(([value, title, text]) => <Choice key={value} pressed={visibility === value} title={title} onClick={() => setVisibility(value)}>{text}</Choice>)}
          </div>
          <p className="lead">Living people are never shown to strangers unless they choose it themselves, from their own account.</p>
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={go(async () => { await api.patch('/api/settings', { visibility }); finish(); }, at)}>Open the tree</button>
          </div>
        </>
      )}
    </>
  );
}
