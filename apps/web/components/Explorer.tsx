'use client';

/*
 * The app: holds what this browser knows (who is signed in, the tree as they
 * may see it), keeps it fresh from the server's live stream, and connects the
 * tree, the person card, the menus and the side panel.
 */

import { describeKinship, stepWord } from '@reactive-family-tree/core';
import type { Appearance, EditResult, MemberView, MembersInfo, PersonLeaf, Relation, Relationship, SessionInfo, TreePerson, TreeSnapshot } from '@reactive-family-tree/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FamilyTree, useTreeMusic } from 'reactive-family-tree';
import type { FamilyTreeHandle, MelodyTrial, Place, TreeInsets, TreeLabels } from 'reactive-family-tree';

import { activity, api, messageOf } from '@/lib/api';
import { AppProvider } from '@/lib/app-context';
import type { AppController, CardMode, Painting, PanelArgs, PanelName, ToastOptions } from '@/lib/app-context';
import { OWN_CHOICE, bySun, placeOf, themeFor } from '@/lib/appearance';
import type { Theme } from '@/lib/appearance';
import { signOut } from '@/lib/auth-client';
import { branchOf, displayName, portraitUrl } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';
import { useLiveUpdates } from '@/lib/use-live-updates';

import { About } from './About';
import type { BuildInfo } from './About';
import { AccountMenu, Avatar } from './AccountMenu';
import { Drawer } from './Drawer';
import type { OpenPanel } from './Drawer';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { PageNote } from './PageNote';
import { PersonCard } from './PersonCard';
import type { CardHandle } from './PersonCard';
import { PetalMenu } from './PetalMenu';
import type { PetalItem, PetalMenuHandle, PetalRequest } from './PetalMenu';
import { PANELS } from './all-panels';
import { STEWARD_COLOURS } from './panels';
import { SearchBox } from './SearchBox';
import { TimeBar } from './TimeBar';
import { Toasts } from './Toasts';
import type { Toast } from './Toasts';
import { ZoomButtons } from './ZoomButtons';

/* Panels anyone may open. The rest need a signed-in relative. */
const OPEN_PANELS = new Set<PanelName>(['signin', 'invite', 'help']);
const NO_INSETS: TreeInsets = { right: 0, top: 0 };
const THIS_YEAR = new Date().getFullYear();
/* What a + bud and the ring of actions call adding each relative. */
const ADD_RELATION: Record<Relation, WebPhrase> = { child: 'Add child', partner: 'Add partner', parent: 'Add parent', sibling: 'Add sibling' };

interface Banner {
  content: ReactNode;
  /* What ending it means: leaving the mode it announced. */
  onDone?(): void;
}

interface CardState {
  personId: string;
  mode: CardMode;
  relation?: Relation;
}

export function Explorer({ build }: { build: BuildInfo }) {
  const session = useQuery({ queryKey: ['session'], queryFn: () => api.get<SessionInfo>('/api/session') });
  const tree = useQuery({ queryKey: ['tree'], queryFn: () => api.get<TreeSnapshot>('/api/tree') });
  const { t } = useT();
  if (session.data && tree.data) return <Family session={session.data} tree={tree.data} build={build} />;
  // Until both have answered there is an empty stage. If one could not, say so and offer another try, where there would be nothing at all.
  if (!session.error && !tree.error) return <div id="stage" />;
  return (
    <PageNote title={t('The family tree could not be loaded')}>
      <p>{t('The server did not answer. It may be starting, or the connection may be down.')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={() => { void session.refetch(); void tree.refetch(); }}>{t('Try again')}</button>
      </div>
    </PageNote>
  );
}

function Family({ session, tree, build }: { session: SessionInfo; tree: TreeSnapshot; build: BuildInfo }) {
  const queryClient = useQueryClient();
  const { lang, dir, t, tx, list: listed, choose } = useT();
  const view = useRef<FamilyTreeHandle>(null);
  const card = useRef<CardHandle>(null);
  const petals = useRef<PetalMenuHandle>(null);
  const bannerEl = useRef<HTMLDivElement>(null);

  const people = useMemo(() => new Map(tree.people.map((p) => [p.id, p])), [tree]);
  const user = session.user;
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const [focusId, setFocusId] = useState<string | null>(null);          // whose family the tree is showing, when not the default
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardState, setCardState] = useState<CardState | null>(null);
  const [panel, setPanel] = useState<OpenPanel | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [painting, setPainting] = useState<Painting | null>(null);      // while branches are being assigned on the tree
  const [tintMembers, setTintMembers] = useState<MemberView[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [year, setYear] = useState<number | null>(null);                // null is today
  const [playing, setPlaying] = useState(false);
  // A calm melody, and a quicker one while the years play. The family chooses which, and whether there is any.
  const [audition, setAudition] = useState<MelodyTrial | null>(null);
  const { music: mode, playMusic, melody, playMelody, latitude, longitude, appearance, moon, moonDay, pond } = session.settings;
  const music = useTreeMusic(playing, { mode, playMusic, melody, playMelody, audition });
  const { wake: wakeSound } = music;
  // Leaves, or the faces of those who have a photo. Each person's own choice, kept on their device.
  const [faces, setFaces] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [matches, setMatches] = useState<ReadonlySet<string> | null>(null);
  const [route, setRoute] = useState<readonly [string, string] | null>(null);
  const [petalRequest, setPetalRequest] = useState<PetalRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [insets, setInsets] = useState<TreeInsets>(NO_INSETS);
  const [theme, setTheme] = useState<Theme>('light');

  /* What the actions below read. They are made once, so they look here for how things are now. */
  const now = useRef({ session, tree, people, painting, banner, panel, cardState, editing, year, playing, menuOpen, searchOpen, petalRequest, selectedId });
  now.current = { session, tree, people, painting, banner, panel, cardState, editing, year, playing, menuOpen, searchOpen, petalRequest, selectedId };
  const undoLast = useRef<(() => Promise<void>) | null>(null);          // takes back this browser's last published change, for Cmd/Ctrl + Z
  const editHintShown = useRef(false);
  const nextToast = useRef(1);

  /* ---------- Saying things ---------- */

  const toast = useCallback((message: string, { ms = 6000, ...options }: ToastOptions = {}) => {
    const id = nextToast.current++;
    setToasts((list) => [...list, { id, message, leaving: false, ...options }]);
    setTimeout(() => dismiss(id), ms);
  }, []);
  const dismiss = (id: number) => {
    setToasts((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 260);
  };
  const fail = useCallback((error: unknown) => toast(messageOf(error), { bad: true }), [toast]);

  /* ---------- The actions every part of the interface may call ---------- */

  const actions = useMemo(() => {
    const currentTree = () => queryClient.getQueryData<TreeSnapshot>(['tree']) ?? now.current.tree;
    const findPerson = (id: string | null): TreePerson | null => (id ? currentTree().people.find((p) => p.id === id) ?? null : null);
    /* Unsaved typing in the card is not thrown away silently. */
    const leaveCard = (go: () => void, force = false) => (card.current ? card.current.leave(go, force) : go());

    const closePopovers = () => {
      setMenuOpen(false);
      setSearchOpen(false);
    };
    const closeBanner = () => {
      const done = now.current.banner?.onDone;
      setBanner(null);
      done?.();
    };
    const showBanner = (content: ReactNode, onDone?: () => void) => {
      now.current.banner?.onDone?.();
      setBanner({ content, onDone });
    };

    const refresh = async () => {
      await queryClient.invalidateQueries();
    };

    const togglePaint = async (person: TreePerson) => {
      const { painting: at } = now.current;
      if (!at || person.masked || person.pending) return;
      const current = at.members.find((m) => m.id === at.member.id);
      try {
        if (current?.anchors.includes(person.id)) await api.del(`/api/members/${at.member.id}/branches/${person.id}`);
        else await api.post(`/api/members/${at.member.id}/branches`, { anchor: person.id });
        await refresh();
        const { members } = await api.get<MembersInfo>('/api/members');
        setPainting((was) => (was ? { ...was, members } : was));
        setTintMembers(members);
      } catch (error) {
        fail(error);
      }
    };

    /*
     * Choose a person: open their card, or, while assigning branches, give or
     * take their branch.
     */
    const select: AppController['select'] = (id, { fly = false, force = false } = {}) => {
      const person = findPerson(id);
      if (now.current.painting && person) return void togglePaint(person);
      leaveCard(() => {
        setSelectedId(person?.id ?? null);
        if (!person) return setCardState(null);
        if (fly) view.current?.flyTo(person.id);
        setCardState({ personId: person.id, mode: 'view' });
      }, force);
    };

    const openCard: AppController['openCard'] = (person, mode = 'view', extra = {}) => {
      leaveCard(() => {
        setSelectedId(person.id);
        setCardState({ personId: person.id, mode, relation: extra.relation });
      });
    };

    const submit: AppController['submit'] = async (ops, message, { note = '', contact = null, proof = null, quiet = null } = {}) => {
      const result = await api.post<EditResult>('/api/edits', { ops, message, note, contact }, proof);
      if (result.status === 'applied') {
        const undo = async () => {
          undoLast.current = null;
          try {
            await api.post(`/api/edits/${result.editId}/revert`);
            toast(t('Undone'));
            await refresh();
          } catch (error) {
            fail(error);
          }
        };
        undoLast.current = undo;
        toast(quiet ?? t('Saved'), { action: t('Undo'), onAction: () => void undo() });
      } else {
        const reason = result.reasons[0];
        toast(reason ? t('Sent for review. {reason}', { reason }) : t('Sent for review.'));
      }
      for (const warning of result.warnings.slice(0, 2)) toast(warning.message, { ms: 9000 });
      await refresh();
      return result;
    };

    /* Show the family this person belongs to: the tree re-roots on their oldest known ancestor. */
    const focusOn: AppController['focusOn'] = async (personId) => {
      const everyone = personId === currentTree().rootId;
      select(null, { force: true });
      setFocusId(everyone ? null : personId);
      requestAnimationFrame(() => view.current?.fit(false, true));
      if (!everyone) {
        toast(t('Showing the family of {name}', { name: displayName(findPerson(personId), lang) }), { action: t('Back to everyone'), ms: 9000, onAction: () => void focusOn(currentTree().rootId ?? personId) });
      }
    };

    const showRelationship: AppController['showRelationship'] = async (person) => {
      const me = now.current.session.user?.personId;
      if (!me) return;
      try {
        const { connected, steps } = await api.get<Relationship>(`/api/relationship?from=${me}&to=${person.id}`);
        if (!connected) return toast(t('No connection between you and {name} is recorded yet.', { name: displayName(person, lang) }));
        const term = describeKinship(steps, lang);
        const name = <strong>{displayName(person, lang)}</strong>;
        select(null);
        showBanner(
          <span>
            {term ? tx('{name} is {term}.', { name, term }) : tx('{name} is connected to you.', { name })}
            {/* Hebrew reads from the right, so its arrows point left */}
            <small>{[t('You'), ...steps.map((step) => t('{relation} {name}', { relation: stepWord(step, lang), name: step.name }))].join(dir === 'rtl' ? ' ← ' : ' → ')}</small>
          </span>,
          () => setRoute(null),
        );
        // After the banner is on the page, so the way between the two is framed in the room the banner leaves
        requestAnimationFrame(() => setRoute([me, person.id]));
      } catch (error) {
        fail(error);
      }
    };

    const openPanel: AppController['openPanel'] = (name, args = {}) => {
      closePopovers();
      setPanel({ name: OPEN_PANELS.has(name) || now.current.session.user ? name : 'signin', args, focus: true });
    };
    const closePanel = () => setPanel(null);

    const startPainting: AppController['startPainting'] = (member, members) => {
      setPainting({ member, members });
      closePanel();
      select(null, { force: true });
      setTintMembers(members);
      showBanner(<span>{t('Tap a person to give {name} their branch. Tap them again to take it away.', { name: member.name })}</span>, () => {
        setPainting(null);
        openPanel('manage', { tab: 'branches' });
      });
    };

    const signedIn = async () => {
      undoLast.current = null;
      setFocusId(null);
      closeBanner();
      closePanel();
      select(null, { force: true });
      setEditing(false);
      await refresh();
    };

    return { closePopovers, closeBanner, refresh, select, openCard, submit, focusOn, showRelationship, openPanel, closePanel, startPainting, signedIn, findPerson };
  }, [queryClient, toast, fail, lang, dir, t, tx]);

  /* ---------- Light or dark ---------- */

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);
  /* A cross-fade where the browser can, with every colour inside switching at once. */
  const showTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === root.getAttribute('data-theme')) return;
    const show = () => {
      root.setAttribute('data-theme', next);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0C1322' : '#FFFFFF');
      setTheme(next);
    };
    if (view.current?.still || !document.startViewTransition) return show();
    root.classList.add('theme-cut');
    void document.startViewTransition(show).updateCallbackDone.then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-cut')));
    });
  }, []);
  /* Someone's own choice. Their browser keeps it, and it comes before what the family set. */
  const setAppearance = useCallback((next: Theme) => {
    if (next === document.documentElement.getAttribute('data-theme')) return;
    try { localStorage.setItem(OWN_CHOICE, next); } catch { /* private browsing */ }
    showTheme(next);
  }, [showTheme]);
  const followFamily = useCallback((family: Appearance, place: Place | null) => {
    try { localStorage.removeItem(OWN_CHOICE); } catch { /* private browsing */ }
    showTheme(themeFor(family, place));
  }, [showTheme]);
  // By the sun, the tree turns dark at sunset where the family is, and light at sunrise, while the page is open. Not for someone who chose for themselves.
  useEffect(() => {
    const place = placeOf({ latitude, longitude });
    if (appearance !== 'sun' || !place) return;
    const follow = () => {
      let own: string | null = null;
      try { own = localStorage.getItem(OWN_CHOICE); } catch { /* private browsing */ }
      const theme = bySun(place);
      if (own !== 'light' && own !== 'dark' && !/(?:^|[#&])theme=/.test(location.hash) && theme) showTheme(theme);
    };
    follow();
    const clock = setInterval(follow, 60_000);
    return () => clearInterval(clock);
  }, [appearance, latitude, longitude, showTheme]);

  const app = useMemo<AppController>(() => ({
    session, tree, people, isAdmin, painting,
    get view() { return view.current; },
    toast, fail,
    refresh: actions.refresh, signedIn: actions.signedIn, select: actions.select, openCard: actions.openCard, submit: actions.submit,
    focusOn: actions.focusOn, showRelationship: actions.showRelationship, openPanel: actions.openPanel, closePanel: actions.closePanel,
    showBranches: setTintMembers, startPainting: actions.startPainting, audition: setAudition, wakeSound, followFamily,
  }), [session, tree, people, isAdmin, painting, toast, fail, actions, followFamily, wakeSound]);

  /* ---------- Live updates, and what arrives with them ---------- */

  useLiveUpdates(user?.id ?? null, tree.seq, actions.refresh);

  // Someone else just added to the tree: say so, and offer to go there
  const known = useRef<{ viewer: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    const viewer = user?.id ?? 'visitor';
    const before = known.current;
    known.current = { viewer, ids: new Set(tree.people.map((p) => p.id)) };
    if (!before || before.viewer !== viewer || tree.closed || Date.now() - activity.lastWrite <= 2500) return;
    const arrived = tree.people.filter((p): p is PersonLeaf => !p.masked && Boolean(p.given) && !p.pending && !before.ids.has(p.id));
    const [first] = arrived;
    if (first && arrived.length <= 3) {
      toast(t('New on the tree: {names}', { names: listed(arrived.map((person) => displayName(person, lang))) }), { action: t('Show'), ms: 9000, onAction: () => actions.select(first.id, { fly: true }) });
    }
  }, [tree, user?.id, toast, actions, lang, t, listed]);

  // The card closes when its person is no longer on the tree this viewer sees
  const cardPerson = cardState ? people.get(cardState.personId) ?? null : null;
  useEffect(() => {
    if (cardState && !cardPerson) actions.select(null, { force: true });
  }, [cardState, cardPerson, actions]);

  /* ---------- Room for the side panel and the banner ---------- */

  /*
   * Something that covers part of the stage opened, closed or changed size: the
   * side panel on a wide screen, the banner, the window itself. The tree and
   * the controls move over to keep clear of it.
   */
  const makeRoom = useCallback(() => {
    const drawer = document.getElementById('drawer');
    const wide = now.current.panel && innerWidth > 900 ? drawer?.offsetWidth ?? 0 : 0;
    const top = bannerEl.current && !bannerEl.current.hidden ? bannerEl.current.offsetHeight + 8 : 0;
    // Read from the right, the panel opens on the left
    const fromRight = document.documentElement.dir === 'rtl', right = fromRight ? 0 : wide, left = fromRight ? wide : 0;
    document.body.style.setProperty('--inset', `${wide}px`);
    document.body.classList.toggle('tight', innerWidth - wide < 920);
    setInsets((was) => (was.right === right && was.top === top && (was.left ?? 0) === left ? was : { right, top, left }));
    card.current?.place();
  }, []);
  // A switch to or from a language read from the right moves the panel to the other side
  useLayoutEffect(makeRoom, [makeRoom, panel !== null, banner, lang]);
  useEffect(() => {
    addEventListener('resize', makeRoom);
    return () => removeEventListener('resize', makeRoom);
  }, [makeRoom]);

  /* ---------- Branches on the tree ---------- */

  /* Everyone ringed in the colour of the steward who looks after them. */
  const tints = useMemo(() => {
    if (!tintMembers) return null;
    const colours = new Map<string, string>();
    tintMembers.forEach((member, index) => {
      for (const anchor of member.anchors) {
        for (const id of branchOf(tree, anchor)) if (!colours.has(id)) colours.set(id, STEWARD_COLOURS[index % STEWARD_COLOURS.length] as string);
      }
    });
    return colours;
  }, [tintMembers, tree]);

  /* ---------- The year ---------- */

  const range = useMemo(() => {
    const years = tree.people.flatMap((p) => (!p.masked && p.born ? [p.born] : []));
    return { min: years.length ? Math.min(...years) : THIS_YEAR - 100, max: THIS_YEAR };
  }, [tree]);
  const shownYear = Math.max(range.min, Math.min(range.max, year ?? range.max));
  const chooseYear = useCallback((value: number) => setYear(value >= range.max ? null : Math.max(range.min, value)), [range]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const at = now.current.year;
      if (at === null) return setPlaying(false);
      chooseYear(at + 1);
    }, 110);
    return () => clearInterval(timer);
  }, [playing, chooseYear]);
  const togglePlay = useCallback(() => {
    if (now.current.playing) return setPlaying(false);
    // Inside the press of Play itself, or an iPhone keeps the quick tune silent
    if (playMusic) wakeSound();
    if (now.current.year === null) setYear(range.min);
    setPlaying(true);
  }, [range, playMusic, wakeSound]);

  /* ---------- Edit mode, appearance ---------- */

  const toggleEditing = useCallback((on: boolean) => {
    setEditing(on);
    if (!on || editHintShown.current) return;
    editHintShown.current = true;
    toast(t('Tap a leaf, then pull a + bud to add a relative. Hold a leaf for more.'), { ms: 7000 });
  }, [toast, t]);
  // The card stands further off while the + buds are out
  useEffect(() => { card.current?.place(); }, [editing]);
  useEffect(() => { if (!user) setEditing(false); }, [user]);

  /* ---------- The ring of actions around a leaf ---------- */

  const petalsFor = (person: PersonLeaf): PetalItem[] => {
    const tool = view.current;
    const open = (mode?: CardMode, relation?: Relation) => () => actions.openCard(person, mode, { relation });
    if (editing && person.editing !== 'none') {
      return [
        ...(tool?.addable(person.id) ?? []).map((relation) => ({ label: t(ADD_RELATION[relation]), icon: relation, action: open('add', relation) })),
        { label: person.editing === 'apply' ? t('Edit details') : t('Suggest a fix'), icon: 'edit', action: open('edit') },
        { label: t('Open'), icon: 'open', action: open() },
      ];
    }
    const me = user?.personId;
    const branch = tool?.hasBranch(person.id);
    const items: (PetalItem | false | null | undefined)[] = [
      { label: t('Open'), icon: 'open', action: open() },
      { label: t('Focus here'), icon: 'focus', action: () => void actions.focusOn(person.id) },
      Boolean(me) && me !== person.id && people.has(me ?? '') && { label: t('How are we related?'), icon: 'related', action: () => void actions.showRelationship(person) },
      person.editing !== 'none' && { label: person.editing === 'apply' ? t('Edit') : t('Suggest a fix'), icon: 'edit', action: open('edit') },
      branch && { label: branch.collapsed ? t('Show branch') : t('Fold branch'), icon: branch.collapsed ? 'unfold' : 'fold', action: () => tool?.toggleBranch(person.id) },
      { label: t('Copy link'), icon: 'link', action: () => void copyLink(person) },
    ];
    return items.filter((item): item is PetalItem => Boolean(item));
  };
  const copyLink = async (person: PersonLeaf) => {
    const link = `${location.origin}/#person=${person.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(t('Link to {name} copied', { name: displayName(person, lang) }));
    } catch {
      toast(link, { ms: 12000 });
    }
  };

  /* ---------- A link that was opened: an invitation, a person, or an edit an AI asked its owner to look at ---------- */

  const followed = useRef(false);
  useEffect(() => {
    if (followed.current) return;
    followed.current = true;
    const query = new URLSearchParams(location.search);
    const fromHash = (name: string) => new RegExp(`(?:^|[#&])${name}=([\\w-]+)`).exec(location.hash)?.[1];
    const invite = query.get('invite'), editId = fromHash('edit'), personId = fromHash('person');
    if (query.has('error')) {
      history.replaceState(null, '', location.pathname + location.hash);
      toast(t('That sign-in link has expired or was already used. Ask for a new one.'), { bad: true });
    } else if (invite && !user) {
      actions.openPanel('invite', { token: invite });
    } else if (editId) {
      if (user) history.replaceState(null, '', location.pathname);
      actions.openPanel('inbox', { tab: 'mine', editId });
    } else if (personId && people.has(personId)) {
      actions.select(personId, { fly: true });
    }
    // Once, when the app first has its data
  }, []);

  // A member's choice of language follows them to a new device: once the page knows who they are, it switches to theirs, once
  const spokenTo = useRef<string | null>(null);
  useEffect(() => {
    if (!user || spokenTo.current === user.id) return;
    spokenTo.current = user.id;
    if (user.language && user.language !== lang) void choose(user.language);
  }, [user, lang, choose]);

  // On a demo install, a first-time visitor on a wide screen is offered the ready-made accounts once the tree has grown
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current || !session.demo || user || view.current?.still || innerWidth <= 900 || location.search || location.hash.includes('=p_')) return;
    const timer = setTimeout(() => {
      offered.current = true;
      if (!now.current.session.user && !now.current.panel) setPanel({ name: 'signin', args: {}, focus: false });
    }, 3200);
    return () => clearTimeout(timer);
  }, [session.demo, user]);

  /* ---------- Keys, and taps outside a menu ---------- */

  useEffect(() => {
    try { setFaces(localStorage.getItem('rft-faces') === '1'); } catch { /* private browsing */ }
  }, []);
  const toggleFaces = useCallback(() => {
    setFaces((was) => {
      try { localStorage.setItem('rft-faces', was ? '0' : '1'); } catch { /* private browsing */ }
      return !was;
    });
  }, []);
  const anyPhotos = useMemo(() => tree.people.some((p) => !p.masked && p.portrait), [tree.people]);

  const goToMyLeaf = useCallback(() => {
    const mine = now.current.session.user?.personId;
    if (mine) actions.select(mine, { fly: true });
  }, [actions]);
  const wholeTree = useCallback(() => {
    actions.select(null);
    view.current?.fit(true, true);
  }, [actions]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('#menu, #search, #menuOpen, #searchOpen')) actions.closePopovers();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // A photo opened large, or the window about the software, is on top and has the keyboard to itself: Escape puts it away, and nothing behind it moves
      if ((event.target as Element).closest('dialog')) return;
      const at = now.current;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
      if (event.key === 'Escape') {
        // Whatever is on top closes first
        if (at.petalRequest) setPetalRequest(null);
        else if (at.menuOpen || at.searchOpen) {
          const opener = at.menuOpen ? 'menuOpen' : 'searchOpen';
          actions.closePopovers();
          document.getElementById(opener)?.focus();
        } else if (at.panel) actions.closePanel();
        else if (at.cardState) actions.select(null);
        else if (at.banner) actions.closeBanner();
        else if (at.editing) toggleEditing(false);
        return;
      }
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undoLast.current) {
        event.preventDefault();
        void undoLast.current();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const stepYear = (by: number) => { setPlaying(false); chooseYear((at.year ?? range.max) + by); };
      const keys: Record<string, () => void> = {
        '/': () => { actions.closePopovers(); setSearchOpen(true); },
        '?': () => actions.openPanel('help'),
        e: () => { if (at.session.user) toggleEditing(!at.editing); },
        m: goToMyLeaf,
        v: () => { if (anyPhotos) toggleFaces(); },
        f: () => { if (at.selectedId) void actions.focusOn(at.selectedId); },
        p: togglePlay,
        s: () => { if (music.available) music.toggle(); },
        '+': () => view.current?.zoomStep(1.5),
        '=': () => view.current?.zoomStep(1.5),
        '-': () => view.current?.zoomStep(1 / 1.5),
        0: wholeTree,
        '[': () => stepYear(-1),
        ']': () => stepYear(1),
      };
      const action = keys[event.key] ?? keys[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actions, toggleEditing, togglePlay, toggleFaces, anyPhotos, goToMyLeaf, wholeTree, chooseYear, range, music.available, music.toggle]);

  /* ---------- Drawing ---------- */

  const waiting = session.counts.review + session.counts.drafts + session.counts.unread;
  const hidden = tree.people.filter((p) => p.masked).length;
  const placing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardTarget = useMemo(() => (cardState && cardPerson ? { person: cardPerson, mode: cardState.mode, relation: cardState.relation } : null), [cardState, cardPerson]);
  const treeLabels = useMemo<TreeLabels>(() => ({
    showBranch: t('Show this branch'),
    livingRelative: t('Living relative'),
    unknown: t('Unknown'),
    draft: t('draft'),
    suggested: t('suggested'),
    relations: { child: t('child'), partner: t('partner'), parent: t('parent'), sibling: t('sibling') },
    addRelation: (relation) => t(ADD_RELATION[relation]),
  }), [t]);

  return (
    <AppProvider value={app}>
      <FamilyTree
        ref={view}
        data={tree}
        viewerId={user?.personId ?? null}
        focusId={focusId}
        year={shownYear}
        playing={playing}
        place={placeOf({ latitude, longitude })}
        moon={moon === 'day' ? (moonDay ? { day: moonDay } : 'tonight') : moon}
        pond={pond}
        editing={editing}
        selectedId={selectedId}
        matches={matches}
        route={route}
        tints={tints}
        faces={faces && anyPhotos}
        portraitOf={portraitUrl}
        insets={insets}
        label={t('The family tree')}
        labels={treeLabels}
        onSelect={(person) => actions.select(person?.id ?? null)}
        onAdd={({ person, relation }) => { if (!person.masked) actions.openCard(person, 'add', { relation }); }}
        onHold={({ person, x, y, keyboard }) => {
          // A private or pencilled leaf has nothing more to offer than a tap does
          if (person.masked || person.pending || painting) return;
          const box = view.current?.leafRect(person.id);
          setPetalRequest({ x: box ? box.left + box.width / 2 : x, y: box ? box.top + box.height / 2 : y, title: displayName(person, lang), items: petalsFor(person), focus: keyboard });
        }}
        onHoldMove={(x, y) => petals.current?.move(x, y)}
        onHoldEnd={(x, y) => petals.current?.release(x, y)}
        // Keep the card beside its leaf once the tree has come to rest
        onMoved={() => {
          if (placing.current) clearTimeout(placing.current);
          placing.current = setTimeout(() => card.current?.place(), 200);
        }}
      />
      {tree.closed && (
        <div id="closedNote" className="closed-note">
          <h2>{session.needsSetup ? t('Nothing is planted here yet') : t('This family tree is private')}</h2>
          <p>{session.needsSetup ? t('This tree has not been set up. Whoever runs it can open the setup link from the server log to claim it.') : t('Relatives can sign in to see it.')}</p>
          {!session.needsSetup && <div><button type="button" className="primary" onClick={() => actions.openPanel('signin')}>{t('Sign in')}</button></div>}
        </div>
      )}

      {/* The tree fades out under the controls instead of colliding with them */}
      <div className="scrim scrim-top" aria-hidden="true" />
      <div className="scrim scrim-bottom" aria-hidden="true" />

      <header className="top">
        <div className="title">
          <h1 id="familyName">{tree.family.name}</h1>
          <p id="familyLine">{tree.family.description}</p>
          {/* What a visitor is not being shown, said plainly */}
          <p id="note" className="note" hidden={Boolean(user) || !hidden}>
            {t('{n} {n#living relative is|living relatives are} private.', { n: hidden })}{' '}
            <button type="button" className="link" onClick={() => actions.openPanel('signin')}>{t('Sign in to see them')}</button>
          </p>
        </div>
        <nav className="tools" aria-label={t('Tools')}>
          <button id="editToggle" type="button" className="tool" hidden={!user} aria-pressed={editing} title={t('Edit the tree (E)')} onClick={() => toggleEditing(!editing)}>
            <Icon name="edit" /><span>{t('Edit')}</span>
          </button>
          <button id="searchOpen" type="button" className="tool icon" aria-label={t('Search')} title={t('Search (/)')} aria-expanded={searchOpen} onClick={() => { const was = searchOpen; actions.closePopovers(); setSearchOpen(!was); }}>
            <Icon name="search" />
          </button>
          <button id="inboxOpen" type="button" className="tool icon" aria-label={waiting ? t('Inbox, {n} waiting', { n: waiting }) : t('Inbox')} title={t('Inbox')} hidden={!user} onClick={() => actions.openPanel('inbox', { tab: session.counts.review ? 'review' : 'mine' })}>
            <Icon name="inbox" /><b className="badge" hidden={!waiting}>{waiting}</b>
          </button>
          <LanguageMenu signedIn={Boolean(user)} />
          <button id="menuOpen" type="button" className={user ? 'tool' : 'tool primary'} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => {
            if (!user) return actions.openPanel('signin');
            const was = menuOpen;
            actions.closePopovers();
            setMenuOpen(!was);
          }}>
            {user ? <><Avatar name={user.name} /><span>{user.name.split(' ')[0]}</span></> : t('Sign in')}
          </button>
        </nav>
      </header>

      <AccountMenu
        open={menuOpen}
        theme={theme}
        onClose={actions.closePopovers}
        onMyLeaf={goToMyLeaf}
        onAppearance={setAppearance}
        onSignOut={() => void signOut(t).then(actions.signedIn, fail)}
      />
      <SearchBox open={searchOpen} onClose={actions.closePopovers} onMatches={setMatches} />

      <div ref={bannerEl} id="banner" className="banner panel" hidden={!banner}>
        {banner?.content}
        {banner && <button type="button" className="primary small" onClick={actions.closeBanner}>{t('Done')}</button>}
      </div>

      <PersonCard ref={card} target={cardTarget} onSwitch={(mode, relation) => setCardState((was) => (was ? { personId: was.personId, mode, relation } : was))} />
      <Drawer
        current={panel}
        panels={PANELS}
        onArgs={(args: PanelArgs) => setPanel((was) => (was ? { ...was, args } : was))}
        onClose={actions.closePanel}
      />
      <Toasts toasts={toasts} onAction={(item) => { dismiss(item.id); item.onAction?.(); }} />

      <TimeBar year={shownYear} min={range.min} max={range.max} playing={playing} music={music.available ? music.on : null} onYear={(value) => { setPlaying(false); chooseYear(value); }} onPlay={togglePlay} onMusic={music.toggle} />
      <ZoomButtons
        hasLeaf={Boolean(user?.personId)}
        faces={anyPhotos ? faces : null}
        onZoom={(factor) => view.current?.zoomStep(factor)}
        onWhole={wholeTree}
        onMyLeaf={goToMyLeaf}
        onFaces={toggleFaces}
      />
      <About build={build} family={tree.family.name} humanCheck={Boolean(session.humanCheck)} />

      <PetalMenu ref={petals} request={petalRequest} onClose={useCallback(() => setPetalRequest(null), [])} />
    </AppProvider>
  );
}
